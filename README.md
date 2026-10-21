# Visa Slot Guard

A resilient US visa appointment slot monitor (Chrome extension, Manifest V3) for `usvisascheduling.com`.

Most slot-checker extensions go quiet the moment the portal fights back — a Cloudflare check, a waiting room, a rate limit, an expired session — and leave you staring at a spinner wondering what happened. **Visa Slot Guard's whole design is the opposite: every portal condition maps to an explicit state, a concrete recovery action, and a plain-language message telling you exactly what happened and what (if anything) you need to do.**

Written from scratch. No code taken from any other slot-checker.

## Features

| | Free | Premium |
|---|---|---|
| Manual "check now" + reminders | ✓ | ✓ |
| Sound + desktop alerts on match | ✓ | ✓ |
| Custom refresh interval (5–120 min) | — | ✓ |
| Quick Login (auto re-login on session expiry) | — | ✓ |
| Auto-book (auto-select slot + submit) | — | ✓ |

**Premium billing is a clean stub until you wire Stripe** (see Billing below). The extension is fully usable on Free meanwhile.

## Install (developer mode)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
2. Open `usvisascheduling.com` and log in.
3. Click the extension icon → set consulate + date range → Save.

## How monitoring works

1. A `chrome.alarms` timer fires (survives service-worker restarts; all state is in `chrome.storage.local`).
2. The content script snapshots the portal tab and classifies the page: `READY_CALENDAR`, `CHALLENGE`, `QUEUE`, `RATE_LIMITED`, `SESSION_EXPIRED`, `LOGGED_OUT`, `UNKNOWN`.
3. A session state machine (`HEALTHY` / `DEGRADED` / `NEEDS_USER`) decides: check, back off, re-login, or ask you for help — and logs every transition to the popup's Session health feed.
4. On a ready calendar, available dates are extracted (multiple strategies, confidence reported) and matched against your date range. Matches trigger sound + desktop alerts, and optionally auto-book.

## What it fixes — and what it honestly cannot

**Fixed (vs. typical slot checkers):**
- **Silent dropouts are gone.** Cloudflare challenge? You get "human-verification check — open the tab and click the checkbox, checks resume on their own." Rate limited? "Backing off automatically." Every condition has a message; the toolbar badge shows state at a glance (`ON` / `~` / `!` / `II`).
- **Per-failure backoff with jitter.** Rate limits escalate the delay exponentially instead of hammering; successes decay it back.
- **Auto-resume.** Solve the checkbox or log back in, and the extension notices the tab state change and resumes — no need to touch the popup.
- **Opt-in Quick Login.** With your explicit consent, credentials stored *only on this device* are used to refill the login form when the session expires. Security questions are only auto-answered if you stored them.

**Hard portal limits — cannot be fixed, and anyone claiming otherwise is lying:**
- **Human-verification checkboxes (Cloudflare "I'm human") cannot and should not be auto-solved.** Auto-book *stops* and asks you if one appears mid-flow.
- **Session expiry is the portal's decision.** Re-login needs your credentials and sometimes your security answers; without stored credentials it needs *you*.
- **Rate limits / waiting rooms are the portal defending itself.** Checking every 30 seconds will get you throttled — the extension backs off instead of fighting it.
- **No tool can guarantee you a slot.** Released slots are first-come-first-served and can vanish in under two minutes while hundreds of people compete.

## Billing / Stripe

Real money needs a server — Stripe *secret* keys must never live in a browser extension. The intended shape:

```
extension → your tiny server (/api/billing/*) → Stripe
```

- `src/lib/billing/provider.js` — the interface the extension programs against.
- `src/lib/billing/stripe-stub.js` — default implementation. Every method throws `BillingNotConfiguredError` with setup instructions until you configure it. Swap the stub for a server-backed implementation; nothing else changes.
- Paste your Stripe **publishable** key + server URL in the popup's Billing section when ready.

## Privacy

- Everything (settings, credentials, health log) lives in `chrome.storage.local` **on your device**.
- No analytics, no remote calls — except Stripe, only after *you* configure it.
- Quick Login credentials never leave the browser. Anyone with access to your browser profile could read them: only use it on your own computer.

## Architecture

```
src/lib/          pure, unit-tested logic (no chrome.* except storage/notify)
  detector.js     page-state classifier over a DOM snapshot
  availability.js date extraction (data-attrs → embedded JSON → text scan)
  scheduler.js    exponential backoff + jitter
  session.js      HEALTHY/DEGRADED/NEEDS_USER state machine
  tiers.js        the ONLY file that knows Free vs Premium
  billing/        provider interface + Stripe stub
  notify.js       sound + desktop alerts
src/content/portal.js   thin DOM adapter, answers worker messages
src/background/service-worker.js  orchestration (alarms, tabs, badge)
src/popup/        settings UI, tier card, health log
tests/            node:test, 35 tests, no dependencies
```

## Roadmap

- Mobile push via optional companion (honest: needs a backend; not faked)
- Multi-profile monitoring (Premium)
- Server-backed Stripe billing reference implementation
- Community slot-activity feed
- Firefox port

## License

MIT — see [LICENSE](LICENSE).
