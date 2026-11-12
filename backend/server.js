/**
 * server.js — Backend entrypoint
 * Kept minimal so tests can import the Express app without starting a listener.
 */

import { pathToFileURL } from 'url';
import connectDB from './config/db.js';
import { startScraperJob } from './jobs/scraperJob.js';
import { createApp } from './app.js';

export const app = createApp();
const PORT = process.env.PORT || 5000;

export async function bootstrap() {
  await connectDB();
  const server = app.listen(PORT, () => {
    console.log(`\n🚀 Fashion Stylist API running on http://localhost:${PORT}`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });

  // The in-process scraper cron is OFF by default: every API instance would run its own copy, and a
  // restart or deploy at the wrong moment would skip the run. The weekly refresh is scheduled by
  // .github/workflows/weekly-refresh.yml instead. Opt back in for a single-instance setup with
  // SCRAPER_CRON_ENABLED=true (never during tests).
  if (process.env.NODE_ENV !== 'test' && String(process.env.SCRAPER_CRON_ENABLED || '').toLowerCase() === 'true') {
    startScraperJob();
  }

  return server;
}

// Only auto-start when executed directly: `node server.js`
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
