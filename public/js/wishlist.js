let items = [];

const grid = document.getElementById('wishGrid');
const emptyState = document.getElementById('emptyState');
const overlay = document.getElementById('modalOverlay');
const form = document.getElementById('wishForm');
const modalTitle = document.getElementById('modalTitle');

async function load() {
  items = await API.wishlist.list();
  render();
}

function render() {
  grid.innerHTML = '';
  emptyState.classList.toggle('hidden', items.length > 0);
  items.forEach((item) => grid.appendChild(renderCard(item)));
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-title">${escapeHtml(item.destinationName || item.destination)}</div>
        <div class="card-route">${item.origin} → ${item.destination}</div>
      </div>
      <span class="badge ${item.status}">${item.statusLabel}</span>
    </div>
    <div class="card-price">${fmtMoney(item.latestPrice?.price, item.latestPrice?.currency)} <small>${item.latestPrice ? 'last sample' : 'no data yet'}</small></div>
    <div class="card-reason">${escapeHtml(item.statusReason)}</div>
    ${item.note ? `<div class="card-reason">"${escapeHtml(item.note)}"</div>` : ''}
    ${item.targetPrice ? `<div class="card-meta"><span>Target: ${fmtMoney(item.targetPrice)}</span></div>` : ''}
    ${item.lastError ? `<div class="error-note">${escapeHtml(item.lastError)}</div>` : ''}
    <div class="card-meta">
      <span>Checked ${timeAgo(item.lastChecked)}</span>
    </div>
    <div class="card-actions">
      <button class="btn-secondary" data-action="check">Check Now</button>
      ${item.bookingLink ? `<a class="btn btn-secondary" href="${item.bookingLink}" target="_blank" rel="noopener">View</a>` : ''}
      <button class="btn-ghost" data-action="edit">Edit</button>
      <button class="btn-danger" data-action="delete">Delete</button>
    </div>
  `;

  card.querySelector('[data-action="check"]').addEventListener('click', async (e) => {
    e.target.textContent = 'Checking…';
    e.target.disabled = true;
    try {
      await API.wishlist.check(item.id);
      await load();
      initUsagePill();
    } catch (err) {
      alert('Price check failed: ' + err.message);
      e.target.textContent = 'Check Now';
      e.target.disabled = false;
    }
  });

  card.querySelector('[data-action="edit"]').addEventListener('click', () => openModal(item));
  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Remove "${item.destinationName || item.destination}" from your wishlist?`)) return;
    await API.wishlist.remove(item.id);
    await load();
  });

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function openModal(item) {
  form.reset();
  document.getElementById('wishId').value = item?.id || '';
  modalTitle.textContent = item ? 'Edit Destination' : 'Add Destination';
  if (item) {
    document.getElementById('origin').value = item.origin;
    document.getElementById('destination').value = item.destination;
    document.getElementById('destinationName').value = item.destinationName || '';
    document.getElementById('note').value = item.note || '';
    document.getElementById('targetPrice').value = item.targetPrice || '';
    document.getElementById('stayNights').value = item.stayNights || 7;
  }
  overlay.classList.remove('hidden');
}

function closeModal() {
  overlay.classList.add('hidden');
}

document.getElementById('addWishBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelBtn').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('wishId').value;
  const payload = {
    origin: document.getElementById('origin').value.trim(),
    destination: document.getElementById('destination').value.trim(),
    destinationName: document.getElementById('destinationName').value.trim(),
    note: document.getElementById('note').value.trim(),
    targetPrice: Number(document.getElementById('targetPrice').value) || null,
    stayNights: Number(document.getElementById('stayNights').value) || 7,
  };

  try {
    if (id) {
      await API.wishlist.update(id, payload);
    } else {
      await API.wishlist.create(payload);
    }
    closeModal();
    await load();
    initUsagePill();
  } catch (err) {
    alert('Could not save: ' + err.message);
  }
});

load();
