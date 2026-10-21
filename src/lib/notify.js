/* Notifications — sound + desktop. Pure-ish; chrome.* calls isolated here.
 * Mobile push is intentionally NOT faked: without a backend there is no
 * honest way to push to a phone, so the roadmap says so instead.
 */
(function () {
  var VSG = (globalThis.VSG = globalThis.VSG || {});

  function hasChrome() {
    return typeof chrome !== 'undefined' && chrome.notifications;
  }

  async function notifyMatch(dates, settings) {
    var title = 'Visa slot found!';
    var message =
      'Matching date' + (dates.length > 1 ? 's' : '') + ' at ' + (settings.consulate || 'your consulate') + ': ' + dates.join(', ');
    if (hasChrome() && settings.desktopAlert) {
      try {
        await chrome.notifications.create('vsg-match-' + Date.now(), {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: title,
          message: message,
          priority: 2,
          requireInteraction: true,
        });
      } catch (e) {
        /* notifications blocked — sound still fires below */
      }
    }
    if (settings.soundAlert) playSound();
    return { title: title, message: message };
  }

  async function notifyHealth(title, message) {
    if (!hasChrome()) return;
    try {
      await chrome.notifications.create('vsg-health-' + Date.now(), {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: String(message).slice(0, 180),
        priority: 1,
      });
    } catch (e) {
      /* ignore */
    }
  }

  // Sound must play in a page context; the service worker has no DOM.
  // We ask the portal content script to beep. Fallback: skip silently.
  function playSound() {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ url: 'https://*.usvisascheduling.com/*' }, function (tabs) {
      if (!tabs || !tabs.length) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'VSG_SOUND' }).catch(function () {});
    });
  }

  VSG.notify = { notifyMatch: notifyMatch, notifyHealth: notifyHealth, playSound: playSound };
})();
