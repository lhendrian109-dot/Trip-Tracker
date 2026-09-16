# Trip Tracker — context for Claude

Personal flight price tracker for one user (Lara). Vanilla HTML/CSS/JS
frontend, dependency-free Node.js backend, JSON files as the database.
No build step — `npm start` runs it directly.

Read `README.md` first for setup/usage and `docs/DECISIONS.md` for the
*why* behind non-obvious choices (flight data provider, holiday-pricing
override, per-person price display). Don't re-litigate those decisions
without re-reading `docs/DECISIONS.md` — several were made after
researching that the "obvious" answer (e.g. Amadeus for flight data) had
become unavailable partway through 2026.

## Key constraints to keep in mind

- **No npm dependencies, intentionally.** The user asked for something
  "more html, javascript, css, not heavy on frameworks." Node 18+'s
  built-in `fetch` covers the SerpApi calls; don't add axios/express/
  dotenv/etc. without a real reason to break this.
- **SerpApi free tier is 250 searches/month.** Any change that adds
  more automatic price-checking (shorter cadence, more items tracked
  per check, checking booked trips) risks blowing through it. Check
  `lib/pricing.js` (`checkCadenceDays`/`wishlistCadenceDays`) and
  `lib/budget.js` before changing check frequency.
- **`data/*.json` is gitignored on purpose** — it's the user's personal
  trip data and should never end up in a commit. `.env` (their real API
  key) is also gitignored. Never remove these from `.gitignore`.
- **`lib/pricing.js` is the single source of truth for "what status does
  this trip get."** If asked to change status logic, thresholds, or add
  a new status, this is the one file to touch — don't duplicate status
  logic into the frontend JS.
- **Price from `lib/serpapi.js` is always a total for `adults`
  passengers**, never per-person. See "Per-person vs. total price
  display" in `docs/DECISIONS.md` before touching anything price-display
  related.

## Running/testing locally

```bash
npm start                      # starts on http://localhost:4173
curl http://localhost:4173/api/meta   # confirms SERPAPI_KEY is picked up
```

There's no test suite (deliberately, for a project this size). To
verify a change works:
1. `node --check <file>` for a quick syntax sanity check on any edited
   `.js` file (server-side or client-side).
2. Exercise the REST API directly with `curl` for backend changes (see
   README's API table for routes).
3. For UI changes, use the claude-in-chrome browser tools to actually
   click through the change — don't just eyeball the HTML/CSS. Take a
   screenshot before claiming a UI change works. **Read screenshot
   coordinates freshly each time** — viewport size can shift between
   screenshots (this bit us once: clicking based on stale coordinates
   landed on the modal backdrop and silently closed it instead of
   focusing a field).
4. After any manual testing that creates trips/wishlist items via the
   API, clean up with `echo "[]" > data/trips.json` (and same for
   `wishlist.json`) so test data doesn't linger, and reset
   `data/usage.json`'s `count` if a real SerpApi call was made during
   testing, so it doesn't eat into the user's real monthly budget.

## Repo/commit conventions

- Git identity for this repo is set locally (not global) to Lara
  Hendrian / lhendrian109@gmail.com — see `git config --local -l` if
  that ever needs re-confirming after a fresh clone.
- Commit messages end with the Claude attribution footer the harness
  provides at commit time — don't hand-write a different one.
