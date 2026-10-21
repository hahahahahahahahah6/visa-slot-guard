/* Service worker — the orchestrator.
 * MV3 workers die constantly; ALL state lives in chrome.storage.local and
 * every alarm re-derives what to do. Nothing here assumes "I ran 5 min ago".
 */
importScripts(
  'src/lib/storage.js',
  'src/lib/detector.js',
  'src/lib/availability.js',
  'src/lib/scheduler.js',
  'src/lib/session.js',
  'src/lib/tiers.js',
  'src/lib/billing/provider.js',
  'src/lib/billing/stripe-stub.js',
  'src/lib/notify.js'
);

var ALARM = 'vsg-check';
var PORTAL_RE = /^https:\/\/[^/]*\.usvisascheduling\.com\//;

function sendToTab(tabId, msg, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; resolve({ ok: false, error: 'timeout' }); }
    }, timeoutMs || 20000);
    chrome.tabs.sendMessage(tabId, msg, function (resp) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp || { ok: false, error: 'empty-response' });
    });
  });
}

async function findPortalTab() {
  var tabs = await chrome.tabs.query({ url: 'https://*.usvisascheduling.com/*' });
  return tabs && tabs.length ? tabs[0] : null;
}

async function setBadge(state) {
  var text = { HEALTHY: 'ON', DEGRADED: '~', NEEDS_USER: '!', PAUSED: 'II', UNKNOWN: '?' }[state] || '?';
  var color = { HEALTHY: '#2e7d32', DEGRADED: '#f9a825', NEEDS_USER: '#c62828', PAUSED: '#616161', UNKNOWN: '#616161' }[state] || '#616161';
  try {
    await chrome.action.setBadgeText({ text: text });
    await chrome.action.setBadgeBackgroundColor({ color: color });
  } catch (e) { /* ignore */ }
}

async function scheduleNext(baseMin, level) {
  var delayMs = VSG.scheduler.computeDelayMs(baseMin, level, 120);
  await chrome.alarms.create(ALARM, { when: Date.now() + delayMs });
}

async function applyTransition(pageState, settings) {
  var t = VSG.session.transition(settings.sessionState, pageState, {
    unknownStreak: settings.consecutiveUnknown,
    quickLoginOn: VSG.tiers.canUse(settings.tier, 'quickLogin') && settings.quickLogin.enabled,
  });
  var patch = {
    sessionState: t.state,
    consecutiveUnknown: pageState === 'UNKNOWN' ? settings.consecutiveUnknown + 1 : 0,
    lastCheckAt: Date.now(),
  };
  await VSG.storage.updateSettings(patch);
  await VSG.storage.logHealth(t.logKind, (pageState + ' -> ' + t.state) + (t.userMessage ? ' | ' + t.userMessage : ''));
  if (t.action === 'notify-user' && t.userMessage) {
    await VSG.notify.notifyHealth('Visa Slot Guard needs you', t.userMessage);
  }
  return t;
}

async function runCheck(manual) {
  var settings = await VSG.storage.getSettings();
  if (settings.paused && !manual) return;

  if (!manual && settings.backoffUntil > Date.now()) {
    await scheduleNext(settings.intervalMin, settings.backoffLevel);
    return;
  }

  var tab = await findPortalTab();
  if (!tab) {
    await VSG.storage.logHealth('warn', 'No portal tab open — open usvisascheduling.com and log in.');
    if (manual || settings.autoReopenTab) {
      // Gentle: only auto-open when the user opted in; otherwise just tell them.
      if (settings.autoReopenTab) {
        await chrome.tabs.create({ url: 'https://www.usvisascheduling.com/', active: false });
        await VSG.storage.logHealth('info', 'Reopened portal tab (autoReopenTab).');
      } else {
        await VSG.notify.notifyHealth('Visa Slot Guard', 'No visa portal tab is open. Open usvisascheduling.com to resume monitoring.');
      }
    }
    await VSG.storage.updateSettings({ sessionState: 'NEEDS_USER' });
    await setBadge('NEEDS_USER');
    await scheduleNext(settings.intervalMin, settings.backoffLevel);
    return;
  }

  var resp = await sendToTab(tab.id, { type: 'VSG_PROBE' });
  if (!resp.ok) {
    // Content script missing (page still loading?) — soft retry, no drama.
    await VSG.storage.logHealth('info', 'Probe failed (' + resp.error + ') — will retry next round.');
    var lvl = VSG.scheduler.nextLevel(settings.backoffLevel, 'UNKNOWN');
    await VSG.storage.updateSettings({ backoffLevel: lvl, backoffUntil: Date.now() + VSG.scheduler.computeDelayMs(settings.intervalMin, lvl, 120) });
    await scheduleNext(settings.intervalMin, lvl);
    return;
  }

  var pageState = resp.data.pageState;
  var t = await applyTransition(pageState, settings);
  settings = await VSG.storage.getSettings(); // refresh after patch

  if (t.action === 'try-relogin') {
    var lr = await sendToTab(tab.id, {
      type: 'VSG_TRY_LOGIN',
      creds: {
        username: settings.quickLogin.username,
        password: settings.quickLogin.password,
        answers: settings.quickLogin.answers || [],
      },
    });
    var rt = VSG.session.reloginOutcome(lr.ok && lr.data && lr.data.ok);
    await VSG.storage.updateSettings({ sessionState: rt.state });
    await VSG.storage.logHealth(rt.logKind, 'auto-relogin: ' + ((lr.data && lr.data.reason) || lr.error || 'unknown'));
    if (rt.userMessage) await VSG.notify.notifyHealth('Visa Slot Guard', rt.userMessage);
    // Re-probe after login attempt.
    resp = await sendToTab(tab.id, { type: 'VSG_PROBE' });
    if (resp.ok) {
      pageState = resp.data.pageState;
      t = await applyTransition(pageState, settings);
      settings = await VSG.storage.getSettings();
    }
  }

  if (pageState === 'READY_CALENDAR') {
    var avail = resp.data.availability;
    var matched = VSG.availability.matchDates(avail.dates, settings.dateFrom, settings.dateTo);
    if (matched.length) {
      await VSG.storage.updateSettings({ lastResult: 'match', backoffLevel: 0, backoffUntil: 0 });
      await VSG.storage.logHealth('ok', 'MATCH: ' + matched.join(', ') + ' (via ' + avail.strategy + ')');
      await VSG.notify.notifyMatch(matched, settings);
      if (VSG.tiers.canUse(settings.tier, 'autoBook') && settings.autoBook.enabled) {
        var br = await sendToTab(tab.id, { type: 'VSG_AUTOBOOK', dates: matched }, 60000);
        var summary = br.ok && br.data ? JSON.stringify(br.data.log) : 'auto-book error: ' + (br.error || 'unknown');
        await VSG.storage.logHealth(br.ok && br.data && br.data.ok ? 'ok' : 'error', 'auto-book: ' + summary);
        await VSG.notify.notifyHealth('Visa Slot Guard — auto-book', summary.slice(0, 180));
      }
    } else {
      await VSG.storage.updateSettings({ lastResult: 'no-match' });
      await VSG.storage.logHealth('info', 'Checked: no dates in range (' + avail.dates.length + ' total, via ' + avail.strategy + '/' + avail.confidence + ').');
    }
    var okLevel = VSG.scheduler.nextLevel(settings.backoffLevel, 'OK');
    await VSG.storage.updateSettings({ backoffLevel: okLevel, backoffUntil: 0 });
    await scheduleNext(settings.intervalMin, okLevel);
  } else {
    // Degraded paths: back off per failure kind.
    var outcome = pageState === 'RATE_LIMITED' ? 'RATE_LIMITED' : pageState === 'QUEUE' ? 'QUEUE' : pageState === 'CHALLENGE' || pageState === 'SESSION_EXPIRED' || pageState === 'LOGGED_OUT' ? 'CHALLENGE' : 'UNKNOWN';
    var newLevel = VSG.scheduler.nextLevel(settings.backoffLevel, outcome);
    var waitMs = outcome === 'CHALLENGE' ? 15 * 60000 : VSG.scheduler.computeDelayMs(settings.intervalMin, newLevel, 120);
    await VSG.storage.updateSettings({ backoffLevel: newLevel, backoffUntil: Date.now() + waitMs, lastResult: 'degraded' });
    await chrome.alarms.create(ALARM, { when: Date.now() + waitMs });
  }
  await setBadge(settings.sessionState === 'HEALTHY' ? 'HEALTHY' : settings.sessionState);
}

// Watch for the user solving a challenge / logging back in: any portal tab
// update while NEEDS_USER re-probes once.
chrome.tabs.onUpdated.addListener(async function (tabId, info, tab) {
  if (info.status !== 'complete' || !tab.url || !PORTAL_RE.test(tab.url)) return;
  var settings = await VSG.storage.getSettings();
  if (settings.sessionState !== 'NEEDS_USER' || settings.paused) return;
  var resp = await sendToTab(tabId, { type: 'VSG_PROBE' }, 10000);
  if (resp.ok && resp.data.pageState === 'READY_CALENDAR') {
    await applyTransition('READY_CALENDAR', settings);
    await setBadge('HEALTHY');
    await VSG.notify.notifyHealth('Visa Slot Guard', VSG.session.MSG.RESUMED);
  }
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === ALARM) runCheck(false).catch(function (e) {
    VSG.storage.logHealth('error', 'check crashed: ' + String((e && e.message) || e));
  });
});

chrome.runtime.onInstalled.addListener(async function () {
  await VSG.storage.updateSettings({ sessionState: 'UNKNOWN' });
  await setBadge('UNKNOWN');
  var settings = await VSG.storage.getSettings();
  await scheduleNext(settings.intervalMin, 0);
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  (async function () {
    var settings = await VSG.storage.getSettings();
    if (msg.type === 'VSG_GET_STATUS') {
      sendResponse({ ok: true, settings: settings });
    } else if (msg.type === 'VSG_SAVE') {
      // Enforce tier gates server-side-of-the-extension: never trust the popup.
      var patch = msg.patch || {};
      if (patch.intervalMin != null && !VSG.tiers.canUse(settings.tier, 'customInterval')) {
        patch.intervalMin = VSG.storage.DEFAULTS.intervalMin;
      }
      if (patch.quickLogin && patch.quickLogin.enabled && !VSG.tiers.canUse(settings.tier, 'quickLogin')) {
        patch.quickLogin.enabled = false;
      }
      if (patch.autoBook && patch.autoBook.enabled && !VSG.tiers.canUse(settings.tier, 'autoBook')) {
        patch.autoBook.enabled = false;
      }
      if (patch.intervalMin != null) {
        patch.intervalMin = Math.max(5, Math.min(120, Number(patch.intervalMin) || 60));
      }
      await VSG.storage.updateSettings(patch);
      await VSG.storage.logHealth('info', 'Settings updated.');
      sendResponse({ ok: true });
    } else if (msg.type === 'VSG_CHECK_NOW') {
      await runCheck(true);
      sendResponse({ ok: true });
    } else if (msg.type === 'VSG_TEST_SOUND') {
      VSG.notify.playSound();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'unknown' });
    }
  })();
  return true;
});
