/* Stripe stub — the default billing provider.
 *
 * Until the operator deploys the companion server and enters a Stripe
 * publishable key in settings, every method throws BillingNotConfiguredError
 * with actionable instructions. The extension keeps working fully on Free;
 * premium features simply stay locked with an honest "not set up yet" note
 * instead of a dead button.
 *
 * Integration point (when ready):
 *   1. Deploy server/stripe-server.js (or your own) with STRIPE_SECRET_KEY.
 *   2. Paste your Stripe *publishable* key + server URL in the popup's
 *      Billing section.
 *   3. This stub's methods start calling your server; tier flips to
 *      'premium' on webhook-confirmed payment. No other file changes.
 */
(function () {
  var VSG = (globalThis.VSG = globalThis.VSG || {});
  VSG.billing = VSG.billing || {};

  var SETUP_HINT =
    'Premium checkout is not wired up yet. To enable it: deploy the companion ' +
    'billing server (see README "Billing / Stripe"), add your Stripe keys, and ' +
    'paste the server URL in Settings > Billing. The extension stays fully ' +
    'usable on the Free tier meanwhile.';

  function StripeBillingStub(opts) {
    opts = opts || {};
    this.serverUrl = opts.serverUrl || '';
    this.publishableKey = opts.publishableKey || '';
  }
  StripeBillingStub.prototype = Object.create(VSG.billing.BillingProvider.prototype);
  StripeBillingStub.prototype.constructor = StripeBillingStub;

  StripeBillingStub.prototype.isConfigured = function () {
    return !!(this.serverUrl && this.publishableKey);
  };

  StripeBillingStub.prototype.createCheckoutSession = async function (plan) {
    throw new VSG.billing.BillingNotConfiguredError(
      'Cannot start checkout for plan "' + plan + '": ' + SETUP_HINT
    );
  };

  StripeBillingStub.prototype.subscriptionStatus = async function () {
    // Honest default: without a server there is nothing to check.
    return 'none';
  };

  StripeBillingStub.prototype.cancelSubscription = async function () {
    throw new VSG.billing.BillingNotConfiguredError('Nothing to cancel: ' + SETUP_HINT);
  };

  // Factory used by the rest of the extension. Swap here for a real impl.
  function getBillingProvider(settings) {
    return new StripeBillingStub({
      serverUrl: settings.billingServerUrl || '',
      publishableKey: settings.stripePublishableKey || '',
    });
  }

  VSG.billing.StripeBillingStub = StripeBillingStub;
  VSG.billing.getBillingProvider = getBillingProvider;
  VSG.billing.SETUP_HINT = SETUP_HINT;
})();
