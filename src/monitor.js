const crypto = require('crypto');
const logger = require('./logger');
const selectors = require('../config/selectors.json');

function hashRow(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

async function fetchAppointments(page) {
  const { SMN_APPOINTMENTS_URL } = process.env;
  await page.goto(SMN_APPOINTMENTS_URL, { waitUntil: 'networkidle2' });

  const { rowSelector, idAttribute, fields } = selectors.appointments;

  const appointments = await page.$$eval(
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
  for (const appt of appointments) {
    if (!appt.id) appt.id = hashRow(appt.rawText);
  }

  return appointments;
}

async function findNewAppointments(page, seenSet) {
  const appointments = await fetchAppointments(page);
  const newOnes = appointments.filter((a) => !seenSet.has(a.id));

  if (newOnes.length > 0) {
    logger.info(`Found ${newOnes.length} new appointment(s) out of ${appointments.length} total.`);
  }

  return { appointments, newOnes };
}

module.exports = { fetchAppointments, findNewAppointments };
