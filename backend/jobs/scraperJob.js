/**
 * scraperJob.js — Daily cron scheduler
 * Runs the full scraper every day at 3:00 AM PKT.
 * Can be imported by server.js to start automatically.
 */

import cron from 'node-cron';
import { runScraper } from '../scripts/scrapers/index.js';
import { embedAllProducts } from '../scripts/embedAll.js';
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
      // 1. Run the scraper
      await runScraper({ triggeredBy: 'cron' });
      
      // 2. Generate vector embeddings for newly scraped products
      logger.info('Cron triggered: starting auto-embedding for new products...');
      await embedAllProducts();
      
      logger.info('Cron job completed successfully (Scrape + Embed).');
    } catch (err) {
      logger.error('Cron scraper job failed:', err.message);
    }
  }, {
    timezone: 'Asia/Karachi'
  });
}
