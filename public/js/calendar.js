let trips = [];
let viewDate = new Date();
viewDate.setDate(1);

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const grid = document.getElementById('calGrid');
const monthLabel = document.getElementById('monthLabel');

async function load() {
  trips = await API.trips.list();
  render();
}

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function eventsByDate() {
  const map = {};
  const add = (dateStr, ev) => {
    if (!dateStr) return;
    (map[dateStr] ||= []).push(ev);
  };

  for (const t of trips) {
    const cls = t.booked ? 'depart' : 'needs-booking';
    const start = new Date(t.departDate + 'T00:00:00');
    const end = t.returnDate ? new Date(t.returnDate + 'T00:00:00') : null;

    if (end && end > start) {
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = toKey(cursor);
        const isStart = key === t.departDate;
        const isEnd = key === t.returnDate;
        let label = t.tripName;
        if (isStart) label = (t.booked ? '✈ ' : 'Book: ') + t.tripName;
        else if (isEnd && t.booked) label = `⟲ ${t.tripName}`;
        add(key, { label, cls, trip: t });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      add(t.departDate, { label: (t.booked ? '✈ ' : 'Book: ') + t.tripName, cls, trip: t });
    }
  }
  return map;
}

function render() {
  monthLabel.textContent = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const byDate = eventsByDate();

  grid.innerHTML = '';
  DOW.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'cal-dow';
    cell.textContent = d;
    grid.appendChild(cell);
  });

  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cursor = new Date(firstOfMonth);
  cursor.setDate(cursor.getDate() - startOffset);

  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(cursor);
    const inMonth = cellDate.getMonth() === viewDate.getMonth();
    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (inMonth ? '' : ' outside');

    if (inMonth) {
      const key = toKey(cellDate);
      const dayNum = document.createElement('div');
      dayNum.className = 'cal-daynum';
      dayNum.textContent = cellDate.getDate();
      cell.appendChild(dayNum);

      (byDate[key] || []).forEach((ev) => {
        const evEl = document.createElement('div');
        evEl.className = `cal-event ${ev.cls}`;
        evEl.textContent = ev.label;
        evEl.title = `${ev.trip.tripName} — ${ev.trip.origin} → ${ev.trip.destination}`;
        evEl.addEventListener('click', () => {
          window.location.href = '/index.html';
        });
        cell.appendChild(evEl);
      });
    }

    grid.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }
}

document.getElementById('prevMonth').addEventListener('click', () => {
  viewDate.setMonth(viewDate.getMonth() - 1);
  render();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  viewDate.setMonth(viewDate.getMonth() + 1);
  render();
});

load();
