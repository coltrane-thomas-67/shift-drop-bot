require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const logger = require('./logger');
const state = require('./state');
const auth = require('./auth');
const { findNewShifts } = require('./monitor');
const { sendShiftAlert } = require('./notify');

const PRIMED_FILE = path.join(__dirname, '..', 'data', 'PRIMED');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A stuck network call inside sendShiftAlert must never be able to freeze
// the whole monitoring loop forever. Cap it hard as a last line of defense,
// on top of whatever timeout the notification method itself sets.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Adds up to +/-20% random jitter around the base interval so requests
// don't land at a perfectly robotic fixed cadence.
function nextDelayMs() {
  const baseSec = Number(process.env.CHECK_INTERVAL_SECONDS || 45);
  const jitter = baseSec * 0.2 * (Math.random() * 2 - 1);
  return Math.max(10, baseSec + jitter) * 1000;
}

async function runLoop(page) {
  let seen = state.loadSeen();
  let firstRun = !fs.existsSync(PRIMED_FILE);

  while (true) {
    if (state.isPaused()) {
      logger.info('Monitoring paused (delete data/PAUSED to resume). Sleeping...');
      await sleep(nextDelayMs());
      continue;
    }

    try {
      await auth.ensureLoggedIn(page);
      const { shifts, newOnes } = await findNewShifts(page, seen);

      if (firstRun) {
        logger.info(`First run: baselining ${shifts.length} existing shift(s) without alerting.`);
      } else {
        for (const shift of newOnes) {
          await withTimeout(sendShiftAlert(shift), 30000, `sendShiftAlert(${shift.id})`).catch((err) => {
            logger.error(`Alert failed or timed out for ${shift.id}: ${err.message}`);
          });
        }
      }

      for (const shift of shifts) seen.add(shift.id);
      state.saveSeen(seen);

      if (firstRun) {
        fs.writeFileSync(PRIMED_FILE, new Date().toISOString());
        firstRun = false;
      }
    } catch (err) {
      logger.error(`Check cycle failed: ${err.message}`);
    }

    await sleep(nextDelayMs());
  }
}

async function main() {
  const required = ['SITE_LOGIN_URL', 'SITE_SHIFTS_URL', 'SITE_USERNAME', 'SITE_PASSWORD'];
  const missing = required.filter((k) => !process.env[k] || process.env[k].includes('REPLACE-ME'));
  if (missing.length) {
    logger.error(`Missing/placeholder .env values: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }

  logger.info('Starting shift bot...');
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
  );

  await auth.login(page);

  const shutdown = async () => {
    logger.info('Shutting down...');
    await browser.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await runLoop(page);
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.stack || err.message}`);
  process.exit(1);
});
