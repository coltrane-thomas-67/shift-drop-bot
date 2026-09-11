const logger = require('./logger');
const selectors = require('../config/selectors.json');

async function login(page) {
  const { SITE_LOGIN_URL, SITE_USERNAME, SITE_PASSWORD } = process.env;
  logger.info('Logging in...');

  await page.goto(SITE_LOGIN_URL, { waitUntil: 'networkidle2' });
  await page.waitForSelector(selectors.login.usernameField, { timeout: 15000 });

  await page.type(selectors.login.usernameField, SITE_USERNAME, { delay: 30 });
  await page.type(selectors.login.passwordField, SITE_PASSWORD, { delay: 30 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
    page.click(selectors.login.submitButton),
  ]);

  const stillLoggedOut = await page.$(selectors.loggedOutIndicator);
  if (stillLoggedOut) {
    throw new Error('Login appears to have failed. Check SITE_USERNAME/SITE_PASSWORD or the login selectors in config/selectors.json');
  }

  logger.info('Login successful.');
}

async function isLoggedOut(page) {
  const el = await page.$(selectors.loggedOutIndicator);
  return !!el;
}

async function ensureLoggedIn(page) {
  if (await isLoggedOut(page)) {
    logger.warn('Session appears expired, re-authenticating.');
    await login(page);
  }
}

module.exports = { login, isLoggedOut, ensureLoggedIn };
