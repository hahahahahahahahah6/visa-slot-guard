/* Storage layer — everything stays on this device (chrome.storage.local).
 * No analytics, no remote sync, no credential exfiltration. Ever.
 * Classic script: attaches to the shared VSG namespace.
 */
(function () {
  var VSG = (globalThis.VSG = globalThis.VSG || {});

  var DEFAULTS = {
    tier: 'free', // 'free' | 'premium'
    paused: false,
    consulate: '', // e.g. 'SHENYANG'
    dateFrom: '', // ISO yyyy-mm-dd
    dateTo: '', // ISO yyyy-mm-dd
    intervalMin: 60, // free tier: fixed reminder cadence; premium: custom 5..120
    soundAlert: true,
    desktopAlert: true,
    quickLogin: { enabled: false, username: '', password: '', answers: [] },
    autoBook: { enabled: false }, // premium, opt-in: auto-select slot + submit
    autoReopenTab: false, // opt-in: reopen portal tab if user closed it
    healthLog: [], // [{t, kind, msg}] newest last, capped
    lastCheckAt: 0,
    lastResult: null, // 'match' | 'no-match' | 'degraded' | null
    backoffUntil: 0,
    backoffLevel: 0,
    sessionState: 'UNKNOWN', // HEALTHY | DEGRADED | NEEDS_USER | PAUSED
    consecutiveUnknown: 0,
    stripePublishableKey: '', // self-hosted billing; empty = stub
  };

  function hasChrome() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  async function getSettings() {
    if (!hasChrome()) return Object.assign({}, DEFAULTS);
    var s = await chrome.storage.local.get(DEFAULTS);
    // deep-merge nested objects so new default keys appear after upgrades
    s.quickLogin = Object.assign({}, DEFAULTS.quickLogin, s.quickLogin);
    s.autoBook = Object.assign({}, DEFAULTS.autoBook, s.autoBook);
    return s;
  }

  async function updateSettings(patch) {
    if (!hasChrome()) return;
    await chrome.storage.local.set(patch);
  }

  var MAX_LOG = 60;
  async function logHealth(kind, msg) {
    var entry = { t: Date.now(), kind: kind, msg: String(msg).slice(0, 300) };
    if (!hasChrome()) return entry;
    var s = await chrome.storage.local.get({ healthLog: [] });
    var log = s.healthLog || [];
    log.push(entry);
    while (log.length > MAX_LOG) log.shift();
    await chrome.storage.local.set({ healthLog: log });
    return entry;
  }

  VSG.storage = { DEFAULTS: DEFAULTS, getSettings: getSettings, updateSettings: updateSettings, logHealth: logHealth };
})();
