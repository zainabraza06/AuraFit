/**
 * Lightweight system logger — writes to MongoDB SystemLog.
 * Fire-and-forget: never throws, so callers don't need try/catch.
 */
import SystemLog from '../models/SystemLog.js';

async function write(type, source, message, details) {
  try {
    await SystemLog.create({ type, source, message, details });
  } catch (err) {
    // Last resort — don't let logger failures break the app
    console.error('[logger] Failed to write SystemLog:', err.message);
  }
}

export const logger = {
  error:   (source, message, details) => write('error',   source, message, details),
  warning: (source, message, details) => write('warning', source, message, details),
  info:    (source, message, details) => write('info',    source, message, details),
};
