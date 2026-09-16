# Decisions and history

This file exists so a future session (human or AI) doesn't have to
re-derive *why* things are built this way. Newest first.

## Per-person vs. total price display (2026-09-16)

**Problem:** A 2-adult trip showed "$619 · high" and it wasn't obvious
whether $619 was per-person or total, or whether "high" was being
judged against the right baseline.

**Investigation:** Ran the same route/dates through SerpApi with
`adults=1` and `adults=2` side by side:

| Adults | Price | Typical range |
|---|---|---|
| 1 | $310 | $155–290 |
| 2 | $619 | $310–580 |

Both the price *and* the typical range scale by exactly 2x. So SerpApi/
Google Flights already returns the **total for all passengers**, and
`price_level`/`typical_price_range` are computed consistently against
that same total — there was no bug, "high" was correct.

**Resolution:** Not a data-correctness fix, a *display clarity* fix.
The dashboard card now:
- appends passenger count to the route line ("· 2 travelers")
- labels the big price number "total" when adults > 1
- adds a small per-person line underneath (`$310/person for 2
  travelers`)

Solo trips (the common case) render exactly as before — no clutter.
See `priceBlockHtml()` in `public/js/dashboard.js`.

**If touching price display again:** remember `price` from
`lib/serpapi.js` is always the **total for `adults` passengers**, for
both `searchFlightOffers` and `pickSampleDates`/wishlist checks. Divide
by `adults` for a per-person figure; never assume it's already
per-person.

## Peak holiday override (2026-09-16)

**Problem:** A Thanksgiving-week trip was rated "high" by Google Flights
and the app's logic said "Can Wait" — technically consistent with the
rule "high price → can wait", but bad advice for a fixed holiday date,
where fares are demand-inelastic and essentially never drop as the date
approaches (unlike a flexible leisure trip, where "high" plausibly does
mean "wait for a dip").

**Resolution:** Added `peakTravelWindow()` in `lib/pricing.js`, which
detects Thanksgiving, Christmas/New Year's, July 4th week, Memorial Day
weekend, and Labor Day weekend — computed dynamically per year (e.g.
"4th Thursday of November") via `nthWeekdayOfMonth`/
`lastWeekdayOfMonth` helpers, not hardcoded dates. If a trip's departure
falls in one of these windows and the price isn't already rated "low",
status is forced to "Buy Soon" regardless of Google's "high"/"typical"
rating.

**If extending this:** the window list is US-centric (Thanksgiving,
July 4th, Memorial/Labor Day are US-specific). If this app ever needs
non-US holidays, `peakTravelWindow()` is the one place to extend — it
already returns a human-readable name string used directly in the
status reason text.

## Flight data provider: SerpApi, not Amadeus (2026-09-15)

**Original plan:** use Amadeus for Developers' self-service API
(free-tier OAuth2 client-credentials flow), since it's historically the
standard answer for "free flight search API for a hobby project."

**Why that changed:** the user flagged that Amadeus shut down its
self-service developer portal on 2026-07-17 — it now requires
enterprise contracts + IATA/ARC accreditation. Verified via web search
(this postdates the assistant's training cutoff, so it had to be
checked live, not assumed).

**Alternatives researched and rejected:**
- **Kiwi.com Tequila** — now invite-only, requires 50,000+ MAU
- **Travelpayouts** — also requires 50,000+ MAU
- **Duffel** — self-serve, but *live* (non-sandbox) prices require
  identity verification since it's a real booking API, not just a
  search API
- **FlightAPI.io** — free tier is 20–100 calls **total**, not
  recurring monthly; too small for ongoing tracking

**Chosen: SerpApi's `google_flights` engine.** Instant individual
signup, real recurring free tier (250 searches/month), and — the
deciding factor beyond availability — its response includes
`price_insights` (`price_level: low/typical/high`, `typical_price_range`,
`price_history`) computed by Google itself, which maps directly onto
this app's "Buy Soon/Can Wait" concept instead of requiring a
hand-rolled statistical model built on our own limited history.

**Guardrails added because of the free-tier limit:**
- `lib/budget.js`: hard monthly cap (`MONTHLY_SEARCH_BUDGET`), checked
  before every outgoing search, persisted in `data/usage.json`
- `lib/pricing.js` (`checkCadenceDays`/`wishlistCadenceDays`):
  conservative check cadence — weekly beyond 30 days out, daily inside
  30 days, weekly for wishlist — sized to keep ~10-15 active trips
  comfortably inside 250 searches/month. The user explicitly chose this
  "conservative" cadence over a more aggressive one that would require
  a paid plan.

**If this market shifts again:** re-verify current provider status via
web search before assuming any of Amadeus/Kiwi/Travelpayouts/Duffel/
SerpApi's terms are still what's described here — this space changed
multiple times within 2026 alone.
