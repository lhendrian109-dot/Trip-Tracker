function fmtMoney(price, currency = 'USD') {
  if (price == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function initUsagePill() {
  const el = document.getElementById('usagePill');
  if (!el) return;
  try {
    const meta = await API.meta();
    const { count, budget, remaining } = meta.usage;
    el.textContent = `${remaining}/${budget} price checks left this month`;
    el.classList.toggle('low', remaining < budget * 0.15);
    if (!meta.configured) {
      el.textContent = 'SERPAPI_KEY not set — see .env.example';
      el.classList.add('low');
    }
  } catch (e) {
    el.textContent = 'Usage unavailable';
  }
}

document.addEventListener('DOMContentLoaded', initUsagePill);
