/**
 * server.ts - Application entry point
 * Starts the Fastify server
 * Author: Norayr Petrosyan
 */

import { buildApp } from './app.js';
import { config } from './config.js';
import logger from './utils/logger.js';

async function start() {
  let app: ReturnType<typeof buildApp> extends Promise<infer T> ? T : never;

  try {
    // Create and configure application
    app = await buildApp();

    // Start server with retry on EADDRINUSE (useful during watch reloads on Windows)
    const port = Number(config.PORT);
    const host = config.HOST;
    let retries = 3;
    while (retries >= 0) {
      try {
        await app.listen({ port, host });
        break;
      } catch (listenErr: any) {
        if (listenErr?.code === 'EADDRINUSE' && retries > 0) {
          logger.warn({ port, host, retriesLeft: retries }, 'Port in use, waiting 1s before retry...');
          await new Promise((res) => setTimeout(res, 1000));
          retries--;
        } else {
          throw listenErr;
        }
      }
    }

    const gracefulShutdown = async (signal: string) => {
      app.log.info({ signal }, 'Received shutdown signal. Starting graceful shutdown...');

      try {
        await app.close();
        app.log.info('HTTP server closed. Graceful shutdown completed.');
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (err) {
    console.error('[BACKEND FATAL ERROR]', err);
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Log unhandled rejections and exceptions instead of crashing silently
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection caught');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception caught');
});

start();
