/**
 * Emergency notification via Twilio. Only ever triggered for a "critical"
 * level alert in a "hazard" (fire-risk) zone — see rulesEngine.js's
 * requiresEmergencyCall flag. Never called for worker-zone alerts alone;
 * those escalate to a supervisor notification instead (see notifySupervisor).
 *
 * Free trial: Twilio gives real trial credit and a real phone number you can
 * call/SMS from during a demo — no card required for a trial account, though
 * trial numbers can usually only call/text verified numbers until upgraded.
 */

const twilio = require("twilio");

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set.");
  }
  return twilio(sid, token);
}

async function callEmergencyContact({ toNumber, zoneId, zoneLabel, reasoning }) {
  const client = getClient();
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  const message = `ThermalGuard alert. Critical fire risk detected in ${zoneLabel}, zone ${zoneId}. ${reasoning} Please respond immediately.`;

  // Voice call using Twilio's <Say> TwiML via a simple inline URL-less approach:
  // Twilio requires a TwiML endpoint or Bin for voice; simplest hackathon path
  // is to send an SMS (below) plus optionally a call using a hosted TwiML Bin
  // URL you create in the Twilio console pointing to a <Say> verb.
  await client.messages.create({
    to: toNumber,
    from: fromNumber,
    body: message,
  });

  return { notified: true, method: "sms", to: toNumber };
}

async function notifySupervisor({ toNumber, zoneId, zoneLabel, level, action }) {
  const client = getClient();
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  const message = `ThermalGuard: ${zoneLabel} (zone ${zoneId}) is at "${level}" level. Recommended action: ${action}`;

  await client.messages.create({ to: toNumber, from: fromNumber, body: message });
  return { notified: true, method: "sms", to: toNumber };
}

module.exports = { callEmergencyContact, notifySupervisor };
