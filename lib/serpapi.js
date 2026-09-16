// Thin wrapper around SerpApi's Google Flights engine
// (https://serpapi.com/google-flights-api). Free tier: 250 searches/month.
// We spend that budget carefully — see lib/scheduler.js and lib/budget.js —
// rather than polling constantly.

const SEARCH_URL = 'https://serpapi.com/search.json';

export function isConfigured() {
  return Boolean(process.env.SERPAPI_KEY);
}

async function serpapiGet(params) {
  if (!isConfigured()) {
    throw new Error(
      'SerpApi key is not set. Add SERPAPI_KEY to .env (see .env.example). Sign up free at https://serpapi.com.'
    );
  }
  const qs = new URLSearchParams({ ...params, api_key: process.env.SERPAPI_KEY });
  const res = await fetch(`${SEARCH_URL}?${qs.toString()}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`SerpApi request failed: ${json.error || res.statusText}`);
  }
  return json;
}

function cheapestOf(flights = []) {
  if (flights.length === 0) return null;
  return flights.reduce((min, f) => (f.price < min.price ? f : min), flights[0]);
}

function summarize(json) {
  const candidates = [...(json.best_flights || []), ...(json.other_flights || [])];
  const cheapest = cheapestOf(candidates);
  if (!cheapest) return null;

  const firstLeg = cheapest.flights?.[0];
  const stops = (cheapest.flights?.length || 1) - 1;
  const insights = json.price_insights || null;

  return {
    price: cheapest.price,
    currency: 'USD',
    airline: firstLeg?.airline || null,
    stops,
    priceLevel: insights?.price_level || null, // "low" | "typical" | "high"
    typicalPriceRange: insights?.typical_price_range || null,
    lowestHistoricalPrice: insights?.lowest_price ?? null,
    checkedAt: new Date().toISOString(),
  };
}

// Fixed-date search for a specific trip (round trip if returnDate given,
// otherwise one-way).
export async function searchFlightOffers({ origin, destination, departDate, returnDate, adults = 1 }) {
  const params = {
    engine: 'google_flights',
    departure_id: origin,
    arrival_id: destination,
    outbound_date: departDate,
    adults: String(adults),
    currency: 'USD',
    hl: 'en',
    gl: 'us',
    type: returnDate ? '1' : '2',
  };
  if (returnDate) params.return_date = returnDate;

  const json = await serpapiGet(params);
  return summarize(json);
}

// Spot-check for a flexible wishlist entry: samples one representative
// round trip (a Saturday ~`weeksOut` weeks from now, staying `stayNights`
// nights) rather than scanning every possible date, to conserve quota.
export function pickSampleDates({ weeksOut = 8, stayNights = 7 } = {}) {
  const depart = new Date();
  depart.setDate(depart.getDate() + weeksOut * 7);
  // roll forward to the next Saturday
  const day = depart.getDay();
  const daysToSaturday = (6 - day + 7) % 7;
  depart.setDate(depart.getDate() + daysToSaturday);

  const ret = new Date(depart);
  ret.setDate(ret.getDate() + stayNights);

  const fmt = (d) => d.toISOString().slice(0, 10);
  return { departDate: fmt(depart), returnDate: fmt(ret) };
}

export function googleFlightsLink({ origin, destination, departDate, returnDate }) {
  const base = 'https://www.google.com/travel/flights';
  const parts = [`Flights from ${origin} to ${destination} on ${departDate}`];
  if (returnDate) parts.push(`returning ${returnDate}`);
  const params = new URLSearchParams({ q: parts.join(', ') });
  return `${base}?${params.toString()}`;
}
