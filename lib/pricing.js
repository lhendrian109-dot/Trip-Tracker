// Status + cadence rules. Kept isolated from the API client and the HTTP
// layer so the "what counts as a good deal" logic is easy to read/tune
// in one place.

const DAY = 24 * 60 * 60 * 1000;

export function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - Date.now()) / DAY);
}

// nth (1-indexed) occurrence of `weekday` (0=Sun..6=Sat) in `month` (0-indexed) of `year`.
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

// Peak US holiday travel windows: fixed dates rarely get cheaper as they
// approach (unlike flexible leisure trips), because demand is inelastic
// and airlines know it. Checked against the trip's departure date only.
export function peakTravelWindow(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr + 'T00:00:00');
  const year = date.getFullYear();
  const inWindow = (start, end) => date >= start && date <= end;

  const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4); // 4th Thursday of November
  const thanksgivingStart = new Date(thanksgiving);
  thanksgivingStart.setDate(thanksgiving.getDate() - 5);
  const thanksgivingEnd = new Date(thanksgiving);
  thanksgivingEnd.setDate(thanksgiving.getDate() + 4);
  if (inWindow(thanksgivingStart, thanksgivingEnd)) return 'Thanksgiving';

  const memorialDay = lastWeekdayOfMonth(year, 4, 1); // last Monday of May
  const memorialStart = new Date(memorialDay);
  memorialStart.setDate(memorialDay.getDate() - 4);
  const memorialEnd = new Date(memorialDay);
  memorialEnd.setDate(memorialDay.getDate() + 1);
  if (inWindow(memorialStart, memorialEnd)) return 'Memorial Day weekend';

  const laborDay = nthWeekdayOfMonth(year, 8, 1, 1); // 1st Monday of September
  const laborStart = new Date(laborDay);
  laborStart.setDate(laborDay.getDate() - 4);
  const laborEnd = new Date(laborDay);
  laborEnd.setDate(laborDay.getDate() + 1);
  if (inWindow(laborStart, laborEnd)) return 'Labor Day weekend';

  // July 4th week
  if (inWindow(new Date(year, 6, 1), new Date(year, 6, 7))) return 'July 4th week';

  // Christmas/New Year's, spans the year boundary (Dec 18 - Jan 2)
  if (inWindow(new Date(year, 11, 18), new Date(year, 11, 31))) return 'Christmas/New Year\'s';
  if (inWindow(new Date(year, 0, 1), new Date(year, 0, 2))) return 'Christmas/New Year\'s';

  return null;
}

// How many days should elapse before we automatically re-check this trip.
// Conservative cadence, tuned to fit comfortably inside a 250/month
// SerpApi free-tier budget across ~10-15 active trips:
//   - far out (>30 days to departure): weekly
//   - inside 30 days: daily (prices move faster and urgency is higher)
export function checkCadenceDays(trip) {
  if (trip.booked || trip.tracking === false) return null;
  const d = daysUntil(trip.departDate);
  if (d < 0) return null; // trip has passed
  return d > 30 ? 7 : 1;
}

export function wishlistCadenceDays(item) {
  if (item.tracking === false) return null;
  return 7;
}

export function isDueForCheck(item, cadenceDays) {
  if (cadenceDays === null) return false;
  if (!item.lastChecked) return true;
  const elapsedDays = (Date.now() - new Date(item.lastChecked).getTime()) / DAY;
  return elapsedDays >= cadenceDays;
}

// Combine SerpApi's own price_level judgement with departure urgency into
// a single actionable status for the dashboard.
export function computeTripStatus(trip) {
  if (trip.booked) return { status: 'booked', label: 'Booked', reason: 'You booked this trip.' };

  const history = trip.priceHistory || [];
  if (history.length === 0) {
    return { status: 'watching', label: 'Pending', reason: 'No price data yet — check back soon.' };
  }

  const latest = history[history.length - 1];
  const d = daysUntil(trip.departDate);
  const rising = isRising(history);
  const peak = peakTravelWindow(trip.departDate);

  if (d <= 14 && d >= 0) {
    return {
      status: 'buy-soon',
      label: 'Buy Soon',
      reason: `Only ${d} day${d === 1 ? '' : 's'} until departure — prices rarely improve this close in.`,
    };
  }

  if (latest.priceLevel === 'low') {
    return { status: 'buy-soon', label: 'Buy Soon', reason: 'Google Flights rates this price as low for the route.' };
  }

  if (peak && latest.priceLevel !== 'low') {
    return {
      status: 'buy-soon',
      label: 'Buy Soon',
      reason: `${peak} travel — fares rated "${latest.priceLevel}" rarely get cheaper for a fixed peak-holiday date, and usually only climb as it nears.`,
    };
  }

  if (rising) {
    return {
      status: 'buy-soon',
      label: 'Price Rising',
      reason: 'Price has increased over the last few checks — likely to keep climbing.',
    };
  }

  if (latest.priceLevel === 'high') {
    return { status: 'can-wait', label: 'Can Wait', reason: 'Price is currently rated high — worth waiting.' };
  }

  if (d <= 45) {
    return { status: 'watch', label: 'Watch Closely', reason: 'Typical pricing, but departure is approaching.' };
  }

  return { status: 'can-wait', label: 'Can Wait', reason: 'Typical pricing and plenty of time left.' };
}

function isRising(history, lookback = 3) {
  if (history.length < lookback) return false;
  const recent = history.slice(-lookback);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].price <= recent[i - 1].price) return false;
  }
  return recent[recent.length - 1].price > recent[0].price * 1.03;
}

export function computeWishlistStatus(item) {
  const history = item.dealHistory || [];
  if (history.length === 0) {
    return { status: 'watching', label: 'Watching', reason: 'No price data yet.' };
  }
  const latest = history[history.length - 1];
  if (item.targetPrice && latest.price <= Number(item.targetPrice)) {
    return { status: 'deal', label: 'Great Deal!', reason: `At or below your target of $${item.targetPrice}.` };
  }
  if (latest.priceLevel === 'low') {
    return { status: 'deal', label: 'Great Deal!', reason: 'Google Flights rates this price as low.' };
  }
  return { status: 'watching', label: 'Watching', reason: 'No standout deal right now.' };
}
