let trips = [];
let activeFilter = 'all';

const grid = document.getElementById('tripGrid');
const emptyState = document.getElementById('emptyState');
const overlay = document.getElementById('modalOverlay');
const form = document.getElementById('tripForm');
const modalTitle = document.getElementById('modalTitle');
const bookedCheckbox = document.getElementById('booked');
const bookedPriceField = document.getElementById('bookedPriceField');

async function loadTrips() {
  trips = await API.trips.list();
  render();
}

function render() {
  const filtered = activeFilter === 'all' ? trips : trips.filter((t) => t.status === activeFilter);
  grid.innerHTML = '';
  emptyState.classList.toggle('hidden', trips.length > 0);

  if (trips.length > 0 && filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state">No trips match this filter.</div>';
    return;
  }

  filtered
    .slice()
    .sort((a, b) => new Date(a.departDate) - new Date(b.departDate))
    .forEach((trip) => grid.appendChild(renderCard(trip)));
}

function renderCard(trip) {
  const card = document.createElement('div');
  card.className = 'card';

  const multiPax = (trip.adults || 1) > 1;
  const paxSuffix = multiPax ? ` · ${trip.adults} travelers` : '';

  const priceBlock = trip.booked
    ? priceBlockHtml(trip.bookedPrice, trip.adults, 'you paid')
    : priceBlockHtml(trip.latestPrice?.price, trip.adults, trip.latestPrice ? 'current' : 'no data yet', trip.latestPrice?.currency);

  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-title">${escapeHtml(trip.tripName)}</div>
        <div class="card-route">${trip.origin} → ${trip.destination} · ${fmtDate(trip.departDate)}${trip.returnDate ? ' – ' + fmtDate(trip.returnDate) : ' (one-way)'}${paxSuffix}</div>
      </div>
      <span class="badge ${trip.status}">${trip.statusLabel}</span>
    </div>
    ${priceBlock}
    <div class="card-reason">${escapeHtml(trip.statusReason)}</div>
    ${trip.lastError ? `<div class="error-note">${escapeHtml(trip.lastError)}</div>` : ''}
    <div class="card-meta">
      <span>Checked ${timeAgo(trip.lastChecked)}</span>
      <span>${daysUntilLabel(trip.departDate)}</span>
    </div>
    <div class="card-actions">
      <button class="btn-secondary" data-action="check">Check Now</button>
      <a class="btn btn-secondary" href="${trip.bookingLink}" target="_blank" rel="noopener">View / Book</a>
      <button class="btn-ghost" data-action="edit">Edit</button>
      <button class="btn-danger" data-action="delete">Delete</button>
    </div>
  `;

  card.querySelector('[data-action="check"]').addEventListener('click', async (e) => {
    e.target.textContent = 'Checking…';
    e.target.disabled = true;
    try {
      await API.trips.check(trip.id);
      await loadTrips();
      initUsagePill();
    } catch (err) {
      alert('Price check failed: ' + err.message);
      e.target.textContent = 'Check Now';
      e.target.disabled = false;
    }
  });

  card.querySelector('[data-action="edit"]').addEventListener('click', () => openModal(trip));
  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Delete "${trip.tripName}"? This can't be undone.`)) return;
    await API.trips.remove(trip.id);
    await loadTrips();
  });

  return card;
}

function priceBlockHtml(price, adults, label, currency = 'USD') {
  if (price == null) {
    return `<div class="card-price">${fmtMoney(null)} <small>${label}</small></div>`;
  }
  const multiPax = (adults || 1) > 1;
  const totalLabel = multiPax ? `${label} · total` : label;
  const perPersonLine = multiPax
    ? `<div class="card-price-context">${fmtMoney(price / adults, currency)}/person for ${adults} travelers</div>`
    : '';
  return `
    <div class="card-price">${fmtMoney(price, currency)} <small>${totalLabel}</small></div>
    ${perPersonLine}
  `;
}

function daysUntilLabel(dateStr) {
  const d = Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000);
  if (d < 0) return 'past';
  if (d === 0) return 'today';
  return `${d} days out`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function openModal(trip) {
  form.reset();
  document.getElementById('tripId').value = trip?.id || '';
  modalTitle.textContent = trip ? 'Edit Trip' : 'Add Trip';
  if (trip) {
    document.getElementById('tripName').value = trip.tripName;
    document.getElementById('origin').value = trip.origin;
    document.getElementById('destination').value = trip.destination;
    document.getElementById('departDate').value = trip.departDate;
    document.getElementById('returnDate').value = trip.returnDate || '';
    document.getElementById('adults').value = trip.adults || 1;
    bookedCheckbox.checked = Boolean(trip.booked);
    document.getElementById('bookedPrice').value = trip.bookedPrice || '';
  }
  bookedPriceField.classList.toggle('hidden', !bookedCheckbox.checked);
  overlay.classList.remove('hidden');
}

function closeModal() {
  overlay.classList.add('hidden');
}

document.getElementById('addTripBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelBtn').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
bookedCheckbox.addEventListener('change', () => bookedPriceField.classList.toggle('hidden', !bookedCheckbox.checked));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('tripId').value;
  const payload = {
    tripName: document.getElementById('tripName').value.trim(),
    origin: document.getElementById('origin').value.trim(),
    destination: document.getElementById('destination').value.trim(),
    departDate: document.getElementById('departDate').value,
    returnDate: document.getElementById('returnDate').value || null,
    adults: Number(document.getElementById('adults').value) || 1,
    booked: bookedCheckbox.checked,
    bookedPrice: bookedCheckbox.checked ? Number(document.getElementById('bookedPrice').value) || null : null,
  };
  if (!payload.tripName) payload.tripName = `${payload.origin} → ${payload.destination}`;

  try {
    if (id) {
      await API.trips.update(id, payload);
    } else {
      await API.trips.create(payload);
    }
    closeModal();
    await loadTrips();
    initUsagePill();
  } catch (err) {
    alert('Could not save trip: ' + err.message);
  }
});

document.getElementById('filterBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  render();
});

loadTrips();
