/**
 * wait-for-backend.js - Waits for Fastify backend to be ready before starting Vite
 * Author: Norayr Petrosyan
 */
import http from 'node:http';

const HEALTH_URL = 'http://127.0.0.1:3000/api/health';
const MAX_ATTEMPTS = 60; // 30 seconds max
const INTERVAL_MS = 300;

function pingBackend() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      if (res.statusCode && res.statusCode < 500) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ready = await pingBackend();
    if (ready) {
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  console.error('[WAIT] Timeout waiting for backend at ' + HEALTH_URL);
  process.exit(1);
}

waitForBackend();
