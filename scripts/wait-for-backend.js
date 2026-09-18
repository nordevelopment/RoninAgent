/**
 * wait-for-backend.js - Waits for Fastify backend to be ready before starting Vite
 * Author: Norayr Petrosyan
 */
import http from 'node:http';

let port = process.env.PORT || '3000';
let host = process.env.HOST || '127.0.0.1';

// 0.0.0.0 is a bind address, connect to loopback instead
if (host === '0.0.0.0') {
  host = '127.0.0.1';
}

const HEALTH_URL = `http://${host}:${port}/api/health`;
const MAX_ATTEMPTS = 120; // 60 seconds total
const INTERVAL_MS = 500;

function pingBackend() {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const req = http.get(HEALTH_URL, (res) => {
      // Consume response stream to avoid holding sockets open
      res.resume();
      if (res.statusCode && res.statusCode < 500) {
        safeResolve(true);
      } else {
        safeResolve(false);
      }
    });

    req.on('error', () => {
      req.destroy();
      safeResolve(false);
    });

    req.setTimeout(1000, () => {
      req.destroy();
      safeResolve(false);
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

