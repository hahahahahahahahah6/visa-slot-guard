/* Content script — runs inside usvisascheduling.com pages.
 * Thin DOM layer: builds a snapshot, answers messages from the service
 * worker. All *decisions* live in lib/ (pure, tested). Selectors are
 * defensive with fallbacks; when nothing matches we say so instead of
 * guessing.
 */
(function () {
  var VSG = globalThis.VSG || {};

  function buildSnapshot() {
    var bodyText = '';
    var html = '';
    try {
      bodyText = (document.body ? document.body.innerText : '').slice(0, 20000);
      html = document.documentElement ? document.documentElement.outerHTML.slice(0, 200000) : '';
    } catch (e) {
      /* cross-origin frame or early run */
    }
    return { url: location.href, title: document.title, bodyText: bodyText, html: html };
  }

  function firstMatch(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el) return el;
      } catch (e) {
        /* bad selector — skip */
      }
    }
    return null;
  }

  function click(el) {
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }

  // --- handlers -----------------------------------------------------------

  function handleProbe() {
    var snap = buildSnapshot();
    var pageState = VSG.detector.detectPageState(snap);
    var availability = { dates: [], strategy: 'none', confidence: 'high' };
    if (pageState === 'READY_CALENDAR') {
      availability = VSG.availability.extractAvailability(snap);
    }
    return { pageState: pageState, availability: availability };
  }

  // Opt-in auto-book (Premium): pick earliest matching date, earliest time,
  // submit — verifying each step. Returns a step log so the popup can show
  // exactly what happened. NEVER bypasses CAPTCHA/checkboxes.
  async function handleAutoBook(dates) {
    var log = [];
    function step(name, ok, detail) {
      log.push({ name: name, ok: !!ok, detail: detail || '' });
      return !!ok;
    }
    var target = (dates || [])[0];
    if (!target) return { ok: false, log: log, reason: 'no-dates' };

    // 1. click the date cell
    var dayCell = firstMatch([
      '[data-available-date="' + target + '"]',
      '[data-slot-date="' + target + '"]',
      'td[data-date="' + target + '"]',
      'button[data-date="' + target + '"]',
    ]);
    if (!step('select-date', click(dayCell), target)) {
      return { ok: false, log: log, reason: 'date-cell-not-found' };
    }
    await new Promise(function (r) { setTimeout(r, 1500); });

    // 2. pick earliest time slot
    var timeBtn = firstMatch([
      '[data-available-time]',
      'button.time-slot:not([disabled])',
      '.time-slots button:not([disabled])',
      'input[name="time"]',
    ]);
    if (timeBtn && timeBtn.tagName === 'INPUT') {
      timeBtn.checked = true;
      step('select-time', true, 'radio');
    } else if (!step('select-time', click(timeBtn), 'first enabled')) {
      return { ok: false, log: log, reason: 'time-slot-not-found' };
    }
    await new Promise(function (r) { setTimeout(r, 1000); });

    // 3. submit — but refuse if a human-verification widget appeared
    var snap = buildSnapshot();
    if (VSG.detector.detectPageState(snap) === 'CHALLENGE') {
      step('pre-submit-check', false, 'verification challenge appeared');
      return { ok: false, log: log, reason: 'challenge-before-submit' };
    }
    var submitBtn = firstMatch([
      'button[type="submit"]',
      'input[type="submit"]',
      'button.confirm',
      'button.book',
      '#confirm',
    ]);
    if (!step('submit', click(submitBtn), 'clicked')) {
      return { ok: false, log: log, reason: 'submit-not-found' };
    }
    return { ok: true, log: log, reason: 'submitted-verify-manually' };
  }

  // Opt-in quick re-login. Credentials never leave this device; this only
  // fills the form the user could fill by hand. Security questions are only
  // auto-answered if the user explicitly stored them.
  async function handleTryLogin(creds) {
    function setVal(selectors, value) {
      var el = firstMatch(selectors);
      if (!el || value == null || value === '') return false;
      el.focus();
      // React/Angular-friendly value set
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    var userOk = setVal(['input[name="username"]', 'input[name="email"]', '#username', '#email', 'input[type="email"]'], creds.username);
    var passOk = setVal(['input[name="password"]', '#password', 'input[type="password"]'], creds.password);
    if (!userOk || !passOk) return { ok: false, reason: 'login-form-not-found' };
    await new Promise(function (r) { setTimeout(r, 800); });
    // Security questions: answer only stored ones, in order.
    var answers = creds.answers || [];
    var qInputs = Array.prototype.slice.call(document.querySelectorAll('input[name^="answer"], input.security-answer, #securityAnswer'));
    for (var i = 0; i < Math.min(qInputs.length, answers.length); i++) {
      setVal([], ''); // noop guard
      var el = qInputs[i];
      var p = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      p.call(el, answers[i]);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var needManual = qInputs.length > answers.length;
    var submitBtn = firstMatch(['button[type="submit"]', 'input[type="submit"]', '#login', '#signIn']);
    if (submitBtn && !needManual) {
      click(submitBtn);
      return { ok: true, reason: 'submitted' };
    }
    return { ok: false, reason: needManual ? 'security-questions-need-you' : 'submit-not-found' };
  }

  function handleSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.7);
      // two more beeps
      [0.8, 1.6].forEach(function (d) {
        var o2 = ctx.createOscillator();
        var g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.frequency.value = 880;
        var t = ctx.currentTime + d;
        g2.gain.setValueAtTime(0.001, t);
        g2.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o2.start(t); o2.stop(t + 0.7);
      });
    } catch (e) {
      /* audio blocked — desktop notification still fired */
    }
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    (async function () {
      try {
        if (msg.type === 'VSG_PROBE') sendResponse({ ok: true, data: handleProbe() });
        else if (msg.type === 'VSG_AUTOBOOK') sendResponse({ ok: true, data: await handleAutoBook(msg.dates) });
        else if (msg.type === 'VSG_TRY_LOGIN') sendResponse({ ok: true, data: await handleTryLogin(msg.creds) });
        else if (msg.type === 'VSG_SOUND') sendResponse({ ok: true, data: handleSound() });
        else sendResponse({ ok: false, error: 'unknown-message' });
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true; // async response
  });
})();
