const nodemailer = require('nodemailer');
const logger = require('./logger');

function formatMessage(appt) {
  const parts = ['🍼 New SMN shift!'];
  if (appt.time) parts.push(`Time: ${appt.time}`);
  if (appt.location) parts.push(`Loc: ${appt.location}`);
  if (appt.rate) parts.push(`Rate: ${appt.rate}`);
  if (appt.family) parts.push(`Family: ${appt.family}`);

  // Field-level selectors are best-effort guesses (no live example was available
  // to verify them against) -- fall back to the row's raw text so the alert still
  // carries full shift details even if none of the specific fields matched.
  if (parts.length === 1 && appt.rawText) {
    parts.push(appt.rawText);
  }

  return parts.join(' | ').slice(0, 300); // SMS gateways truncate long messages
}

async function sendViaEmailToSms(appt) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_PHONE_NUMBER, CARRIER_GATEWAY } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !ALERT_PHONE_NUMBER || !CARRIER_GATEWAY) {
    throw new Error('Missing GMAIL_USER/GMAIL_APP_PASSWORD/ALERT_PHONE_NUMBER/CARRIER_GATEWAY in .env');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const to = `${ALERT_PHONE_NUMBER}@${CARRIER_GATEWAY}`;
  await transporter.sendMail({
    from: GMAIL_USER,
    to,
    subject: '', // most carrier gateways ignore subject; keep body short
    text: formatMessage(appt),
  });
}

async function sendViaTwilio(appt) {
  // Lazy require so the twilio package is only needed if you actually use this path.
  const twilio = require('twilio');
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !TWILIO_TO_NUMBER) {
    throw new Error('Missing TWILIO_* vars in .env');
  }
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body: formatMessage(appt),
    from: TWILIO_FROM_NUMBER,
    to: TWILIO_TO_NUMBER,
  });
}

async function sendShiftAlert(appt) {
  const method = (process.env.NOTIFY_METHOD || 'emailToSms').trim();
  try {
    if (method === 'twilio') {
      await sendViaTwilio(appt);
    } else {
      await sendViaEmailToSms(appt);
    }
    logger.info(`SMS alert sent for appointment ${appt.id}`);
  } catch (err) {
    logger.error(`Failed to send SMS alert for ${appt.id}: ${err.message}`);
    throw err;
  }
}

module.exports = { sendShiftAlert, formatMessage };
