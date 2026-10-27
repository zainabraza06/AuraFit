import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** Structured JSON logger: one line per entry so it is greppable in `docker logs`. */
export function createLogger(service) {
  const min = LEVELS[config.logLevel] ?? LEVELS.info;
  const emit = (level, msg, extra) => {
    if (LEVELS[level] < min) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...extra });
    (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
  };
  return {
    debug: (m, e) => emit('debug', m, e),
    info: (m, e) => emit('info', m, e),
    warn: (m, e) => emit('warn', m, e),
    error: (m, e) => emit('error', m, e),
  };
}
