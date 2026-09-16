import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './lib/env.js';
import * as store from './lib/store.js';
import * as serpapi from './lib/serpapi.js';
import * as budget from './lib/budget.js';
import * as pricing from './lib/pricing.js';
import * as scheduler from './lib/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(__dirname);

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function decorateTrip(trip) {
  const { status, label, reason } = pricing.computeTripStatus(trip);
  const latest = (trip.priceHistory || []).at(-1) || null;
  return {
    ...trip,
    status,
    statusLabel: label,
    statusReason: reason,
    latestPrice: latest ? { price: latest.price, currency: latest.currency, checkedAt: latest.checkedAt } : null,
    bookingLink: serpapi.googleFlightsLink({
      origin: trip.origin,
      destination: trip.destination,
      departDate: trip.departDate,
      returnDate: trip.returnDate,
    }),
  };
}

function decorateWishlist(item) {
  const { status, label, reason } = pricing.computeWishlistStatus(item);
  const latest = (item.dealHistory || []).at(-1) || null;
  return {
    ...item,
    status,
    statusLabel: label,
    statusReason: reason,
    latestPrice: latest ? { price: latest.price, currency: latest.currency, checkedAt: latest.checkedAt } : null,
    bookingLink: latest
      ? serpapi.googleFlightsLink({
          origin: item.origin,
          destination: item.destination,
          departDate: latest.departDate,
          returnDate: latest.returnDate,
        })
      : null,
  };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Prevent path traversal outside the public directory.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const routes = [
  {
    method: 'GET',
    pattern: /^\/api\/meta$/,
    handler: async (req, res) => {
      sendJson(res, 200, { configured: serpapi.isConfigured(), usage: budget.getUsage() });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/trips$/,
    handler: async (req, res) => {
      const trips = store.readAll('trips').map(decorateTrip);
      sendJson(res, 200, trips);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/trips$/,
    handler: async (req, res) => {
      const body = await readJsonBody(req);
      const trip = store.insert('trips', {
        tripName: body.tripName || `${body.origin} → ${body.destination}`,
        origin: (body.origin || '').toUpperCase(),
        destination: (body.destination || '').toUpperCase(),
        departDate: body.departDate,
        returnDate: body.returnDate || null,
        adults: body.adults || 1,
        booked: Boolean(body.booked),
        bookedPrice: body.bookedPrice || null,
        tracking: true,
        priceHistory: [],
        lastChecked: null,
        lastError: null,
      });
      scheduler.checkTripNow(trip).catch(() => {});
      sendJson(res, 201, decorateTrip(trip));
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/trips\/([^/]+)$/,
    handler: async (req, res, [id]) => {
      const body = await readJsonBody(req);
      const patch = { ...body };
      if (patch.origin) patch.origin = patch.origin.toUpperCase();
      if (patch.destination) patch.destination = patch.destination.toUpperCase();
      const trip = store.update('trips', id, patch);
      if (!trip) return sendJson(res, 404, { error: 'Trip not found' });
      sendJson(res, 200, decorateTrip(trip));
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/trips\/([^/]+)$/,
    handler: async (req, res, [id]) => {
      const ok = store.remove('trips', id);
      sendJson(res, ok ? 200 : 404, { ok });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/trips\/([^/]+)\/check$/,
    handler: async (req, res, [id]) => {
      const trip = store.getById('trips', id);
      if (!trip) return sendJson(res, 404, { error: 'Trip not found' });
      const updated = await scheduler.checkTripNow(trip);
      sendJson(res, 200, decorateTrip(updated));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/wishlist$/,
    handler: async (req, res) => {
      sendJson(res, 200, store.readAll('wishlist').map(decorateWishlist));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/wishlist$/,
    handler: async (req, res) => {
      const body = await readJsonBody(req);
      const item = store.insert('wishlist', {
        destination: (body.destination || '').toUpperCase(),
        destinationName: body.destinationName || body.destination,
        origin: (body.origin || '').toUpperCase(),
        note: body.note || '',
        targetPrice: body.targetPrice || null,
        weeksOut: body.weeksOut || 8,
        stayNights: body.stayNights || 7,
        tracking: true,
        dealHistory: [],
        lastChecked: null,
        lastError: null,
      });
      scheduler.checkWishlistNow(item).catch(() => {});
      sendJson(res, 201, decorateWishlist(item));
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/wishlist\/([^/]+)$/,
    handler: async (req, res, [id]) => {
      const body = await readJsonBody(req);
      const patch = { ...body };
      if (patch.origin) patch.origin = patch.origin.toUpperCase();
      if (patch.destination) patch.destination = patch.destination.toUpperCase();
      const item = store.update('wishlist', id, patch);
      if (!item) return sendJson(res, 404, { error: 'Wishlist item not found' });
      sendJson(res, 200, decorateWishlist(item));
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/wishlist\/([^/]+)$/,
    handler: async (req, res, [id]) => {
      const ok = store.remove('wishlist', id);
      sendJson(res, ok ? 200 : 404, { ok });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/wishlist\/([^/]+)\/check$/,
    handler: async (req, res, [id]) => {
      const item = store.getById('wishlist', id);
      if (!item) return sendJson(res, 404, { error: 'Wishlist item not found' });
      const updated = await scheduler.checkWishlistNow(item);
      sendJson(res, 200, decorateWishlist(updated));
    },
  },
];

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath.startsWith('/api/')) {
    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = urlPath.match(route.pattern);
      if (!match) continue;
      try {
        await route.handler(req, res, match.slice(1));
      } catch (err) {
        console.error(err);
        sendJson(res, 500, { error: err.message });
      }
      return;
    }
    return sendJson(res, 404, { error: 'Not found' });
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Trip Tracker running at http://localhost:${PORT}`);
  if (!serpapi.isConfigured()) {
    console.log('NOTE: SERPAPI_KEY is not set in .env — price checks will fail until you add one. See .env.example.');
  }
  scheduler.startScheduler();
});
