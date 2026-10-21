/* Billing provider interface.
 *
 * Real money needs a server: Stripe secret keys must NEVER live in a browser
 * extension. The intended production shape is:
 *
 *   extension -> your tiny server (/api/billing/*) -> Stripe
 *
 * This file defines the interface the rest of the extension programs
 * against. src/lib/billing/stripe-stub.js is the default implementation:
 * it throws BillingNotConfiguredError until the operator wires a real
 * backend. Swap the stub for a server-backed implementation without
 * touching any other file.
 */
(function () {
  var VSG = (globalThis.VSG = globalThis.VSG || {});
  VSG.billing = VSG.billing || {};

  function BillingNotConfiguredError(message) {
    this.name = 'BillingNotConfiguredError';
    this.message = message || 'Billing is not configured.';
    if (Error.captureStackTrace) Error.captureStackTrace(this, BillingNotConfiguredError);
  }
  BillingNotConfiguredError.prototype = Object.create(Error.prototype);
  BillingNotConfiguredError.prototype.constructor = BillingNotConfiguredError;

  // Interface (documented, never instantiated directly).
  function BillingProvider() {}
  // Opens the Stripe Checkout page for a premium pass. Returns { url }.
  BillingProvider.prototype.createCheckoutSession = function (plan) {
    throw new Error('BillingProvider.createCheckoutSession not implemented');
  };
  // Returns 'active' | 'past_due' | 'canceled' | 'none'.
  BillingProvider.prototype.subscriptionStatus = function () {
    throw new Error('BillingProvider.subscriptionStatus not implemented');
  };
  BillingProvider.prototype.cancelSubscription = function () {
    throw new Error('BillingProvider.cancelSubscription not implemented');
  };

  VSG.billing.BillingNotConfiguredError = BillingNotConfiguredError;
  VSG.billing.BillingProvider = BillingProvider;
})();
