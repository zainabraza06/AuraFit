/**
 * scraperJob.js — Weekly cron scheduler
 * Runs the full scraper every Sunday at 3:00 AM PKT.
 * Can be imported by server.js to start automatically.
 */

import cron from 'node-cron';
import { runScraper } from '../scripts/scrapers/index.js';
import logger from '../scripts/scrapers/utils/logger.js';

/**
 * Starts the weekly scraper cron job.
 * Schedule: "0 3 * * 0" = Sunday at 03:00 AM
 */
export function startScraperJob() {
  const schedule = process.env.SCRAPER_CRON_SCHEDULE || '0 3 * * 0';

  logger.info(`Scraper cron job scheduled: ${schedule} (every Sunday 3AM)`);

  cron.schedule(schedule, async () => {
    logger.info('Cron triggered: starting weekly fashion scrape...');
    try {
      await runScraper({ triggeredBy: 'cron' });
    } catch (err) {
      logger.error('Cron scraper job failed:', err.message);
    }
  }, {
    timezone: 'Asia/Karachi'
  });
}
