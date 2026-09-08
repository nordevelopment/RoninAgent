
/**
 * Logger utility for logging messages to the console with different log levels.
 * Author: Norayr Petrosyan
 */

import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.LOG_LEVEL || 'info',
  transport: config.ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

export default logger;
