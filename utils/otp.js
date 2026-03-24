// In-memory OTP store for development
const otpStore = {};

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTP(phone, otp) {
  process.stdout.write(`\nMock OTP for ${phone}: ${otp}\n`);
  return true;
}


async function storeOTP(phone, otp) {
  otpStore[phone] = { 
    otp, 
    expires: Date.now() + 10 * 60 * 1000 
  };
}

async function verifyOTP(phone, otp) {
  const record = otpStore[phone];
  if (!record) return false;
  if (Date.now() > record.expires) return false;
  if (record.otp !== otp) return false;
  delete otpStore[phone];
  return true;
}

module.exports = { generateOTP, sendOTP, storeOTP, verifyOTP };