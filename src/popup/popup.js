/* Popup logic — classic script. Talks to the service worker; never touches
 * chrome.storage directly for writes (the worker enforces tier gates).
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  function send(msg) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(msg, function (resp) { resolve(resp || { ok: false }); });
    });
  }

  function fmtTime(t) {
    if (!t) return 'never';
    return new Date(t).toLocaleString();
  }

  function renderStatus(s) {
    $('stateBadge').textContent = s.sessionState;
    $('stateBadge').className = 'badge ' + s.sessionState;
    $('tierLabel').textContent = VSG.tiers.TIERS[s.tier].label;
    $('tierNote').textContent = VSG.tiers.TIERS[s.tier].priceNote;

    var premium = s.tier === 'premium';
    $('upgradeBtn').style.display = premium ? 'none' : '';
    // Gate premium controls visually (worker enforces for real).
    var lock = function (id, allowed) {
      $(id).disabled = !allowed;
      if (!allowed && $(id).type === 'checkbox') $(id).checked = false;
    };
    lock('intervalMin', premium);
    lock('qlEnabled', premium);
    lock('abEnabled', premium);
    $('intervalLock').classList.toggle('hidden', premium);
    $('premiumLock').classList.toggle('hidden', premium);

    $('consulate').value = s.consulate || '';
    $('dateFrom').value = s.dateFrom || '';
    $('dateTo').value = s.dateTo || '';
    $('intervalMin').value = s.intervalMin;
    $('soundAlert').checked = s.soundAlert;
    $('desktopAlert').checked = s.desktopAlert;
    $('autoReopenTab').checked = s.autoReopenTab;
    $('paused').checked = s.paused;
    $('qlEnabled').checked = s.quickLogin.enabled;
    $('qlFields').classList.toggle('hidden', !s.quickLogin.enabled);
    $('qlUser').value = s.quickLogin.username || '';
    $('qlPass').value = s.quickLogin.password || '';
    $('qlAnswers').value = (s.quickLogin.answers || []).join(', ');
    $('abEnabled').checked = s.autoBook.enabled;
    $('lastCheck').textContent = fmtTime(s.lastCheckAt);
    $('lastResult').textContent = s.lastResult || '—';
    $('stripeKey').value = s.stripePublishableKey || '';
    $('billingServer').value = s.billingServerUrl || '';

    var billing = VSG.billing.getBillingProvider(s);
    $('billingNote').textContent = billing.isConfigured()
      ? 'Billing server configured. Checkout is handled server-side via Stripe.'
      : VSG.billing.SETUP_HINT;

    var log = $('healthLog');
    log.innerHTML = '';
    (s.healthLog || []).slice().reverse().slice(0, 30).forEach(function (e) {
      var li = document.createElement('li');
      li.className = e.kind || 'info';
      var t = document.createElement('span');
      t.className = 't';
      t.textContent = new Date(e.t).toLocaleTimeString();
      li.appendChild(t);
      li.appendChild(document.createTextNode(e.msg));
      log.appendChild(li);
    });
  }

  async function load() {
    var resp = await send({ type: 'VSG_GET_STATUS' });
    if (resp.ok) renderStatus(resp.settings);
  }

  $('qlEnabled').addEventListener('change', function () {
    $('qlFields').classList.toggle('hidden', !$('qlEnabled').checked);
  });

  $('save').addEventListener('click', async function () {
    var answers = $('qlAnswers').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    await send({
      type: 'VSG_SAVE',
      patch: {
        consulate: $('consulate').value,
        dateFrom: $('dateFrom').value,
        dateTo: $('dateTo').value,
        intervalMin: Number($('intervalMin').value),
        soundAlert: $('soundAlert').checked,
        desktopAlert: $('desktopAlert').checked,
        autoReopenTab: $('autoReopenTab').checked,
        paused: $('paused').checked,
        quickLogin: {
          enabled: $('qlEnabled').checked,
          username: $('qlUser').value.trim(),
          password: $('qlPass').value,
          answers: answers,
        },
        autoBook: { enabled: $('abEnabled').checked },
        stripePublishableKey: $('stripeKey').value.trim(),
        billingServerUrl: $('billingServer').value.trim(),
      },
    });
    $('savedMsg').classList.remove('hidden');
    setTimeout(function () { $('savedMsg').classList.add('hidden'); }, 1500);
    load();
  });

  $('checkNow').addEventListener('click', async function () { await send({ type: 'VSG_CHECK_NOW' }); load(); });
  $('testSound').addEventListener('click', function () { send({ type: 'VSG_TEST_SOUND' }); });

  $('upgradeBtn').addEventListener('click', async function () {
    var resp = await send({ type: 'VSG_GET_STATUS' });
    var billing = VSG.billing.getBillingProvider(resp.settings || {});
    try {
      await billing.createCheckoutSession('premium-7day');
    } catch (e) {
      alert(e.message);
    }
  });

  load();
})();
