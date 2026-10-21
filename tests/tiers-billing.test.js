const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAll } = require('./helper');
loadAll();

test('free tier gates premium features', () => {
  assert.ok(VSG.tiers.canUse('free', 'manualCheck'));
  assert.ok(VSG.tiers.canUse('free', 'soundAlert'));
  assert.ok(!VSG.tiers.canUse('free', 'autoBook'));
  assert.ok(!VSG.tiers.canUse('free', 'customInterval'));
  assert.ok(!VSG.tiers.canUse('free', 'quickLogin'));
});

test('premium unlocks everything', () => {
  for (const f of VSG.tiers.FEATURES) assert.ok(VSG.tiers.canUse('premium', f), f);
});

test('unknown tier falls back to free', () => {
  assert.ok(!VSG.tiers.canUse('hacker', 'autoBook'));
  assert.ok(VSG.tiers.canUse('hacker', 'manualCheck'));
});

test('requiredTier points at premium', () => {
  assert.equal(VSG.tiers.requiredTier('autoBook'), 'premium');
});

test('stripe stub throws honest errors until configured', async () => {
  const stub = new VSG.billing.StripeBillingStub({});
  assert.equal(stub.isConfigured(), false);
  assert.equal(await stub.subscriptionStatus(), 'none');
  await assert.rejects(() => stub.createCheckoutSession('premium-7day'), VSG.billing.BillingNotConfiguredError);
});

test('stripe stub reports configured with keys', () => {
  const stub = new VSG.billing.StripeBillingStub({ serverUrl: 'https://x', publishableKey: 'pk_test_x' });
  assert.equal(stub.isConfigured(), true);
});
