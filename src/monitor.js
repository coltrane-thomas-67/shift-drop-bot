const crypto = require('crypto');
const logger = require('./logger');
const selectors = require('../config/selectors.json');

function hashRow(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

async function fetchShifts(page) {
  const { SITE_SHIFTS_URL } = process.env;
  await page.goto(SITE_SHIFTS_URL, { waitUntil: 'networkidle2' });

  const { rowSelector, idAttribute, fields } = selectors.shifts;

  const shifts = await page.$$eval(
    rowSelector,
    (rows, idAttribute, fields) => {
      return rows.map((row) => {
        const getField = (sel) => {
          const el = row.querySelector(sel);
          return el ? el.textContent.trim() : '';
        };
        const out = {
          id: idAttribute ? row.getAttribute(idAttribute) : null,
          rawText: row.textContent.replace(/\s+/g, ' ').trim(),
        };
        for (const [key, sel] of Object.entries(fields)) {
          out[key] = getField(sel);
        }
        return out;
      });
    },
    idAttribute,
    fields
  );

  // Fall back to a content hash as the ID if the site doesn't expose a stable data attribute.
  for (const shift of shifts) {
    if (!shift.id) shift.id = hashRow(shift.rawText);
  }

  return shifts;
}

async function findNewShifts(page, seenSet) {
  const shifts = await fetchShifts(page);
  const newOnes = shifts.filter((s) => !seenSet.has(s.id));

  if (newOnes.length > 0) {
    logger.info(`Found ${newOnes.length} new shift(s) out of ${shifts.length} total.`);
  }

  return { shifts, newOnes };
}

module.exports = { fetchShifts, findNewShifts };
