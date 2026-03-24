require('dotenv').config();

const twilio = require('twilio');
const { decrypt } = require('./encryption');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} = process.env;

const client =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

function randomId(prefix) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = prefix || '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

function generateToken(identity) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Missing Twilio configuration for token generation');
  }

  const keySid = TWILIO_ACCOUNT_SID;
  const keySecret = TWILIO_AUTH_TOKEN;

  const ident = identity || randomId('finder-');

  const token = new AccessToken(TWILIO_ACCOUNT_SID, keySid, keySecret, {
    identity: ident,
  });

  const grant = new VoiceGrant({
    // For now we just allow client-initiated calls; app SID can be wired later
  });

  token.addGrant(grant);

  return token.toJwt();
}

async function callOwner(ownerPhoneEncrypted) {
  if (!client || !TWILIO_PHONE_NUMBER) {
    return {
      success: false,
      error: 'Call service not configured',
    };
  }

  try {
    const ownerPhonePlain = decrypt(ownerPhoneEncrypted);
    const to = ownerPhonePlain;

    console.log('Calling owner:', to);
console.log('From:', TWILIO_PHONE_NUMBER);

const response = await client.calls.create({
  to,
  from: TWILIO_PHONE_NUMBER,
  twiml: '<Response><Say voice="alice">Someone scanned your Pata tag. Please hold.</Say></Response>',
});

console.log('Twilio call SID:', response.sid);

    return {
      success: true,
      callSid: response && response.sid,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error initiating Twilio owner call:', err.message || err);
    return {
      success: false,
      error: 'Failed to initiate owner call',
    };
  }
}

module.exports = {
  generateToken,
  callOwner,
};

