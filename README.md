# Trip Tracker

A local flight price tracker: add the trips you've got coming up, and it
periodically checks real fares against them, tells you whether to buy now
or wait, and shows a calendar of what's booked vs. what still needs
booking. Includes a wishlist page for dream destinations with no fixed
dates — it flags a genuinely great fare if one shows up.

No frameworks, no build step: vanilla HTML/CSS/JS on the frontend, a
small dependency-free Node.js server on the backend, JSON files as the
database.

## Quick start

```bash
npm start           # or: node server.js
```

Then open **http://localhost:4173**.

On first run, add a real flight price API key (see below) or the app
will run fine but every price check will show an error until you do.

### Get a SerpApi key (free)

Flight prices come from [SerpApi's Google Flights
engine](https://serpapi.com/google-flights-api). Sign up free at
[serpapi.com](https://serpapi.com) — no credit card needed for the free
tier (250 searches/month). Copy your key from the dashboard, then:

```bash
cp .env.example .env
# edit .env and set SERPAPI_KEY=<your key>
```

Restart the server after editing `.env`.

> **Why SerpApi and not Amadeus/Kiwi/etc.?** See
> [`docs/DECISIONS.md`](docs/DECISIONS.md) — short version: the obvious
> options (Amadeus self-service, Kiwi Tequila, Travelpayouts) are no
> longer available to individual/hobby developers as of mid-2026.

## Using the app

- **Dashboard** (`/`) — every trip you're tracking, with a status badge:
  - **Buy Soon** — good price, or departure is close, or it's a
    fixed-date peak-holiday trip that won't get cheaper
  - **Watch Closely** — typical price but departure is approaching
  - **Can Wait** — typical/high price and plenty of time left
  - **Watching** — no price data yet
  - **Booked** — you've marked it booked
  - Click **Check Now** to force an immediate price check (uses one
    search from your monthly budget). **View/Book** opens Google Flights
    with the same route/dates so you can actually buy it — this app
    never books anything for you.
- **Calendar** (`/calendar.html`) — month view of departures/returns for
  booked trips, and a red "needs booking" flag on trips you haven't
  booked yet.
- **Wishlist** (`/wishlist.html`) — places you love with no fixed dates.
  Each entry gets a periodic spot-check on a sample date range, and you
  can set a target price to get flagged when fares drop to it.

Multi-passenger trips (Adults > 1) show the price as a clearly-labeled
**total**, with a per-person breakdown underneath, so it's never
ambiguous whether $619 means $619 or $619 each.

## How the automatic checking works

A background job (`lib/scheduler.js`) wakes up every
`SCHEDULER_TICK_MINUTES` (default 60) and checks any trip/wishlist item
that's "due":

- Trips **more than 30 days from departure**: checked weekly
- Trips **within 30 days**: checked daily (prices move faster and
  urgency is higher close in)
- Wishlist items: checked weekly (flexible dates, less urgency)
- Booked trips and paused (`tracking: false`) items: never
  auto-checked

This cadence (see `lib/pricing.js`) is deliberately conservative so that
tracking ~10-15 trips comfortably fits inside SerpApi's 250/month free
tier. There's also a hard monthly budget cap
(`MONTHLY_SEARCH_BUDGET` in `.env`, tracked in `lib/budget.js` /
`data/usage.json`) — once it's hit, automatic and manual checks both
stop cleanly (with a visible error on the affected card) until the
budget resets at the start of the next month. The header always shows
how many checks are left this month.

## Status logic

All of the "is this a good price" logic lives in one file:
**`lib/pricing.js`**. In order of precedence:

1. **Booked** → always "Booked", no further logic.
2. **≤14 days to departure** → "Buy Soon" (prices rarely improve this
   close in).
3. **Google rates the price "low"** → "Buy Soon".
4. **Peak holiday travel window** (see below) and price isn't already
   "low" → "Buy Soon", regardless of Google's own rating.
5. **Price has risen for 3 checks in a row** (>3% total) → "Buy Soon"
   ("Price Rising").
6. **Google rates the price "high"** → "Can Wait".
7. **≤45 days to departure** (typical price) → "Watch Closely".
8. Otherwise → "Can Wait".

### Peak holiday override

`peakTravelWindow()` in `lib/pricing.js` detects Thanksgiving,
Christmas/New Year's, July 4th week, Memorial Day weekend, and Labor Day
weekend — computed dynamically from the year (e.g. "4th Thursday of
November"), not hardcoded dates, so it keeps working in future years.
This exists because fixed-date holiday travel behaves differently from
flexible leisure trips: fares on these dates are demand-inelastic and
essentially never come down as the date approaches, so treating a
"high" rating as "worth waiting" is actively bad advice for these
windows specifically.

## Data model

Everything lives in flat JSON files in `data/` (gitignored — this is
your personal data, not code):

- `data/trips.json` — array of trip objects (see `lib/store.js` for the
  CRUD helpers). Each trip carries its own `priceHistory` array, so the
  full price trend for that trip is self-contained.
- `data/wishlist.json` — same idea, with `dealHistory` instead of
  `priceHistory`.
- `data/usage.json` — `{ month, count }` for the monthly search budget.

There's no separate database — `lib/store.js` just reads/writes the
whole JSON array on every operation. Fine at this scale (a personal
trip list), would need to change if this ever needed concurrent writers
or thousands of records.

## Project layout

```
server.js            HTTP server + REST API routes, static file serving
lib/
  env.js             Minimal .env loader (no dependency)
  store.js           Generic JSON-file CRUD (read/insert/update/remove)
  serpapi.js         SerpApi client (flight search + Google Flights link builder)
  budget.js          Monthly search budget tracking/enforcement
  pricing.js         All "what status/cadence does this trip get" logic
  scheduler.js        Background job that finds due items and checks them
public/
  index.html/.js      Dashboard page
  calendar.html/.js   Calendar page
  wishlist.html/.js   Wishlist page
  js/api.js           Shared fetch() wrapper for the REST API
  js/common.js        Shared formatting helpers + usage-pill header widget
  css/styles.css      All styling (single stylesheet, CSS variables for theme)
data/                 JSON "database" (gitignored)
docs/DECISIONS.md      Why things are built the way they are
```

## REST API

All under `/api`, JSON in/out:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/meta` | SerpApi configured?, current usage/budget |
| GET | `/api/trips` | List all trips (with computed status) |
| POST | `/api/trips` | Create a trip (triggers an immediate price check) |
| PUT | `/api/trips/:id` | Update a trip |
| DELETE | `/api/trips/:id` | Delete a trip |
| POST | `/api/trips/:id/check` | Force a price check now |
| GET/POST/PUT/DELETE | `/api/wishlist...` | Same shape, for wishlist items |
| POST | `/api/wishlist/:id/check` | Force a spot-check now |

## Extending this later

- **Swap/add a price data source**: everything provider-specific is
  isolated in `lib/serpapi.js`. A new provider needs the same two
  exports (`searchFlightOffers`, `googleFlightsLink`-equivalent) and a
  wire-up in `lib/scheduler.js`.
- **Notifications** (email/push when something flips to "Buy Soon"):
  there's no notification system yet — the dashboard is pull-only (you
  have to look at it). Would hook in at the end of `checkTripNow`/
  `checkWishlistNow` in `lib/scheduler.js`, wherever the status
  actually changes.
- **Multi-city / more complex itineraries**: not supported — trips are
  single origin/destination pairs, one-way or round-trip only.
