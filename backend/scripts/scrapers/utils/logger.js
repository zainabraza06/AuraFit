/**
 * logger.js
 * File + console logger for the scraper pipeline.
 * Writes JSON-line logs to backend/logs/scraper/<date>.log
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log directory: backend/logs/scraper/
const LOG_DIR = path.resolve(__dirname, '../../../../logs/scraper');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function todayFilename() {
  return path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`);
}

function writeToFile(level, message, meta) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {})
  });
  try {
    fs.appendFileSync(todayFilename(), entry + '\n', 'utf8');
  } catch {
    // Non-fatal: silently ignore file write errors
  }
}

function colorize(level) {
  const colors = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', SUCCESS: '\x1b[32m' };
  return colors[level] || '\x1b[0m';
}

function log(level, message, meta) {
  const reset = '\x1b[0m';
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${colorize(level)}[${ts}] [${level}]${reset} ${message}`);
  if (meta) console.log('        ', meta);
  writeToFile(level, message, meta);
}

export const logger = {
  info: (msg, meta) => log('INFO', msg, meta),
  warn: (msg, meta) => log('WARN', msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta),
  success: (msg, meta) => log('SUCCESS', msg, meta)
};

export default logger;
