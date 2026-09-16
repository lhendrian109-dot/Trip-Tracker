import fs from 'node:fs';
import path from 'node:path';

const USAGE_PATH = path.join(process.cwd(), 'data', 'usage.json');

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function load() {
  if (!fs.existsSync(USAGE_PATH)) {
    return { month: currentMonthKey(), count: 0 };
  }
  const raw = JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8'));
  if (raw.month !== currentMonthKey()) {
    return { month: currentMonthKey(), count: 0 };
  }
  return raw;
}

function save(state) {
  fs.mkdirSync(path.dirname(USAGE_PATH), { recursive: true });
  fs.writeFileSync(USAGE_PATH, JSON.stringify(state, null, 2));
}

export function getUsage() {
  const state = load();
  const budget = Number(process.env.MONTHLY_SEARCH_BUDGET || 250);
  return { ...state, budget, remaining: Math.max(0, budget - state.count) };
}

export function hasBudget() {
  const { count, budget } = getUsage();
  return count < budget;
}

export function recordSearch() {
  const state = load();
  state.count += 1;
  save(state);
  return state.count;
}
