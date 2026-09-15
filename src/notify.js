const nodemailer = require('nodemailer');
const logger = require('./logger');

function formatMessage(shift) {
  const parts = ['🔔 New shift!'];
  if (shift.time) parts.push(`Time: ${shift.time}`);
  if (shift.location) parts.push(`Loc: ${shift.location}`);
  if (shift.rate) parts.push(`Rate: ${shift.rate}`);
  if (shift.client) parts.push(`Client: ${shift.client}`);

  // Field-level selectors are best-effort guesses (no live example was available
  // to verify them against). Fall back to the row's raw text so the alert still
  // carries full shift details even if none of the specific fields matched.
  if (parts.length === 1 && shift.rawText) {
    parts.push(shift.rawText);
  }

  return parts.join(' | ').slice(0, 300); // SMS gateways truncate long messages
}

async function sendViaEmailToSms(shift) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_PHONE_NUMBER, CARRIER_GATEWAY } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !ALERT_PHONE_NUMBER || !CARRIER_GATEWAY) {
    throw new Error('Missing GMAIL_USER/GMAIL_APP_PASSWORD/ALERT_PHONE_NUMBER/CARRIER_GATEWAY in .env');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    // Some hosts silently drop outbound SMTP instead of refusing it, which
    // leaves this hanging forever with no error. Fail fast instead.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });

  const to = `${ALERT_PHONE_NUMBER}@${CARRIER_GATEWAY}`;
  await transporter.sendMail({
    from: GMAIL_USER,
    to,
    subject: '', // most carrier gateways ignore subject; keep body short
    text: formatMessage(shift),
  });
}

async function sendViaTwilio(shift) {
  // Lazy require so the twilio package is only needed if you actually use this path.
  const twilio = require('twilio');
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !TWILIO_TO_NUMBER) {
    throw new Error('Missing TWILIO_* vars in .env');
  }
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body: formatMessage(shift),
    from: TWILIO_FROM_NUMBER,
    to: TWILIO_TO_NUMBER,
  });
}

async function sendShiftAlert(shift) {
  const method = (process.env.NOTIFY_METHOD || 'emailToSms').trim();
  try {
    if (method === 'twilio') {
      await sendViaTwilio(shift);
    } else {
      await sendViaEmailToSms(shift);
    }
    logger.info(`SMS alert sent for shift ${shift.id}`);
  } catch (err) {
    logger.error(`Failed to send SMS alert for ${shift.id}: ${err.message}`);
    throw err;
  }
}

module.exports = { sendShiftAlert, formatMessage };
