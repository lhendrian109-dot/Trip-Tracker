import * as store from './store.js';
import * as serpapi from './serpapi.js';
import * as budget from './budget.js';
import { checkCadenceDays, wishlistCadenceDays, isDueForCheck } from './pricing.js';

const MAX_HISTORY_POINTS = 60;

export async function checkTripNow(trip) {
  if (!budget.hasBudget()) {
    return store.update('trips', trip.id, {
      lastError: 'Monthly SerpApi search budget reached — resumes next month.',
    });
  }
  try {
    const result = await serpapi.searchFlightOffers({
      origin: trip.origin,
      destination: trip.destination,
      departDate: trip.departDate,
      returnDate: trip.returnDate || undefined,
      adults: trip.adults || 1,
    });
    budget.recordSearch();

    if (!result) {
      return store.update('trips', trip.id, {
        lastChecked: new Date().toISOString(),
        lastError: 'No flights found for these dates.',
      });
    }

    const history = [...(trip.priceHistory || []), result].slice(-MAX_HISTORY_POINTS);
    return store.update('trips', trip.id, {
      priceHistory: history,
      lastChecked: result.checkedAt,
      lastError: null,
    });
  } catch (err) {
    return store.update('trips', trip.id, {
      lastChecked: new Date().toISOString(),
      lastError: err.message,
    });
  }
}

export async function checkWishlistNow(item) {
  if (!budget.hasBudget()) {
    return store.update('wishlist', item.id, {
      lastError: 'Monthly SerpApi search budget reached — resumes next month.',
    });
  }
  try {
    const { departDate, returnDate } = serpapi.pickSampleDates({
      weeksOut: item.weeksOut || 8,
      stayNights: item.stayNights || 7,
    });
    const result = await serpapi.searchFlightOffers({
      origin: item.origin,
      destination: item.destination,
      departDate,
      returnDate,
      adults: 1,
    });
    budget.recordSearch();

    if (!result) {
      return store.update('wishlist', item.id, {
        lastChecked: new Date().toISOString(),
        lastError: 'No flights found for a sample date range.',
      });
    }

    const history = [...(item.dealHistory || []), result].slice(-MAX_HISTORY_POINTS);
    return store.update('wishlist', item.id, {
      dealHistory: history,
      lastChecked: result.checkedAt,
      lastError: null,
    });
  } catch (err) {
    return store.update('wishlist', item.id, {
      lastChecked: new Date().toISOString(),
      lastError: err.message,
    });
  }
}

export async function runDueChecks() {
  if (!serpapi.isConfigured()) return { checked: 0, skipped: 'not-configured' };

  let checked = 0;

  for (const trip of store.readAll('trips')) {
    const cadence = checkCadenceDays(trip);
    if (isDueForCheck(trip, cadence)) {
      if (!budget.hasBudget()) break;
      await checkTripNow(trip);
      checked++;
    }
  }

  for (const item of store.readAll('wishlist')) {
    const cadence = wishlistCadenceDays(item);
    if (isDueForCheck(item, cadence)) {
      if (!budget.hasBudget()) break;
      await checkWishlistNow(item);
      checked++;
    }
  }

  return { checked };
}

export function startScheduler() {
  const tickMinutes = Number(process.env.SCHEDULER_TICK_MINUTES || 60);
  const tickMs = tickMinutes * 60 * 1000;

  runDueChecks().catch((err) => console.error('Scheduler tick failed:', err.message));
  setInterval(() => {
    runDueChecks().catch((err) => console.error('Scheduler tick failed:', err.message));
  }, tickMs);

  console.log(`Background price checker running every ${tickMinutes} minute(s).`);
}
