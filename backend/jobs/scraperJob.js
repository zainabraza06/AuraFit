/**
 * scraperJob.js — Daily cron scheduler
 * Runs the full scraper every day at 3:00 AM PKT.
 * Can be imported by server.js to start automatically.
 */

import cron from 'node-cron';
import { runScraper } from '../scripts/scrapers/index.js';
import logger from '../scripts/scrapers/utils/logger.js';

/**
 * Starts the daily scraper cron job.
 * Schedule: "0 3 * * *" = Every day at 03:00 AM
 */
export function startScraperJob() {
  const schedule = process.env.SCRAPER_CRON_SCHEDULE || '0 3 * * *';

  logger.info(`Scraper cron job scheduled: ${schedule} (daily at 3AM)`);

  cron.schedule(schedule, async () => {
    logger.info('Cron triggered: starting daily fashion scrape...');
    try {
      await runScraper({ triggeredBy: 'cron' });
    } catch (err) {
      logger.error('Cron scraper job failed:', err.message);
    }
  }, {
    timezone: 'Asia/Karachi'
  });
}
