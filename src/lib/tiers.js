/* Tier abstraction — the ONLY place that knows what Free vs Premium means.
 * Everything else asks canUse(tier, feature). Adding a third tier later
 * means editing this file and nothing else.
 */
(function () {
  var VSG = (globalThis.VSG = globalThis.VSG || {});

  var FEATURES = [
    'manualCheck', // "Check now" button + hourly reminders
    'soundAlert',
    'desktopAlert',
    'customInterval', // premium: choose 5..120 min refresh
    'quickLogin', // premium: stored-credential auto re-login
    'autoBook', // premium: auto-select slot + submit when found
    'multiProfile', // premium: monitor several applicants (roadmap)
  ];

  var TIERS = {
    free: {
      id: 'free',
      label: 'Free',
      priceNote: '$0 — manual checks and reminders',
      grants: { manualCheck: true, soundAlert: true, desktopAlert: true },
    },
    premium: {
      id: 'premium',
      label: 'Premium',
      priceNote: '$9 / 7 days or $24 / month (via Stripe, when configured)',
      grants: {
        manualCheck: true,
        soundAlert: true,
        desktopAlert: true,
        customInterval: true,
        quickLogin: true,
        autoBook: true,
        multiProfile: true,
      },
    },
  };

  function normalizeTier(tier) {
    return TIERS[tier] ? tier : 'free';
  }

  function canUse(tier, feature) {
    tier = normalizeTier(tier);
    return !!(TIERS[tier].grants[feature] === true);
  }

  // For locked UI: which tier unlocks this feature?
  function requiredTier(feature) {
    for (var id in TIERS) {
      if (TIERS[id].grants[feature]) return id;
    }
    return null;
  }

  VSG.tiers = {
    FEATURES: FEATURES,
    TIERS: TIERS,
    normalizeTier: normalizeTier,
    canUse: canUse,
    requiredTier: requiredTier,
  };
})();
