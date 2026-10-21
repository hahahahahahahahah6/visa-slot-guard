/* Scheduler math — PURE. Exponential backoff with jitter so a fleet of
 * users doesn't hammer the portal in lockstep, and so we back off instead
 * of getting rate-limited into oblivion.
 */
(function () {
  var VSG = (globalThis.VSG = globalThis.VSG || {});

  // baseMin: user's chosen interval. level: consecutive failure count.
  // Returns milliseconds until the next attempt.
  function computeDelayMs(baseMin, level, maxMin) {
    maxMin = maxMin || 120;
    var exp = Math.min(baseMin * Math.pow(2, Math.max(0, level)), maxMin);
    var jitter = exp * (0.8 + Math.random() * 0.4); // ±20%
    return Math.round(jitter * 60000);
  }

  // How much worse does each portal condition make the next delay?
  // CHALLENGE/LOGGED_OUT are user-action gates: retrying fast is pointless.
  var BACKOFF_STEP = {
    OK: -1, // success: decay one level
    QUEUE: 1,
    RATE_LIMITED: 2, // portal is explicitly telling us to slow down
    UNKNOWN: 1,
    CHALLENGE: 0, // paused until user acts; alarm stays on a slow heartbeat
    SESSION_EXPIRED: 0,
    LOGGED_OUT: 0,
  };

  function nextLevel(level, outcome) {
    var step = BACKOFF_STEP[outcome] == null ? 1 : BACKOFF_STEP[outcome];
    return Math.max(0, Math.min(8, level + step));
  }

  VSG.scheduler = { computeDelayMs: computeDelayMs, nextLevel: nextLevel };
})();
