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

  // Start weekly scraper cron job (never during tests)
  if (process.env.NODE_ENV !== 'test') {
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
