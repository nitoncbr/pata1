require('dotenv').config();

const axios = require('axios');
const { decrypt } = require('./encryption');

function formatIndianNumber(num) {
  if (!num) return null;
  const digits = String(num).replace(/\D+/g, '').slice(-10);
  if (digits.length !== 10) return null;
  return `+91${digits}`;
}

async function initiateCall(finderPhone, ownerPhoneEncrypted) {
  try {
    const {
      EXOTEL_API_KEY,
      EXOTEL_API_TOKEN,
      EXOTEL_SID,
      EXOTEL_CALLER_ID,
    } = process.env;

    if (!EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_SID || !EXOTEL_CALLER_ID) {
      // eslint-disable-next-line no-console
      console.error('Missing Exotel configuration in environment variables');
      return {
        success: false,
        error: 'Call service not configured',
      };
    }

    const ownerPhonePlain = decrypt(ownerPhoneEncrypted);

    const from = formatIndianNumber(finderPhone);
    const to = formatIndianNumber(ownerPhonePlain);

    if (!from || !to) {
      return {
        success: false,
        error: 'Invalid phone numbers',
      };
    }

    const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect.json`;

    const params = new URLSearchParams();
    params.append('From', from);
    params.append('To', to);
    params.append('CallerId', EXOTEL_CALLER_ID);
    params.append('TimeLimit', '180');
    params.append('Record', 'false');

    const auth = {
      username: EXOTEL_API_KEY,
      password: EXOTEL_API_TOKEN,
    };

    const response = await axios.post(url, params, {
      auth,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const callSid =
      response &&
      response.data &&
      response.data.Call &&
      (response.data.Call.sid || response.data.Call.Sid);

    return {
      success: true,
      callSid: callSid || null,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Exotel full error:', JSON.stringify(err.response?.data, null, 2));
console.error('Exotel status:', err.response?.status);
console.error('Exotel message:', err.message);
    return {
      success: false,
      error: 'Failed to initiate call',
    };
  }
}

module.exports = {
  initiateCall,
};

