import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function ensureFile(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(fp, '[]');
  }
  return fp;
}

export function readAll(name) {
  const fp = ensureFile(name);
  const raw = fs.readFileSync(fp, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}

function writeAll(name, records) {
  const fp = ensureFile(name);
  fs.writeFileSync(fp, JSON.stringify(records, null, 2));
}

export function getById(name, id) {
  return readAll(name).find((r) => r.id === id) || null;
}

export function insert(name, record) {
  const records = readAll(name);
  const now = new Date().toISOString();
  const full = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...record };
  records.push(full);
  writeAll(name, records);
  return full;
}

export function update(name, id, patch) {
  const records = readAll(name);
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  records[idx] = { ...records[idx], ...patch, id, updatedAt: new Date().toISOString() };
  writeAll(name, records);
  return records[idx];
}

export function remove(name, id) {
  const records = readAll(name);
  const next = records.filter((r) => r.id !== id);
  writeAll(name, next);
  return next.length !== records.length;
}

export function replaceAll(name, records) {
  writeAll(name, records);
}
