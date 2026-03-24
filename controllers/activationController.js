require('dotenv').config();

const { supabase } = require('../utils/supabase');
const { encrypt } = require('../utils/encryption');
const { generateOTP, sendOTP, storeOTP, verifyOTP } = require('../utils/otp');

function validatePhoneNumber(phone) {
  return /^\d{10}$/.test(phone);
}

async function requestOTP(req, res) {
  const { serial_number: serialNumber, phone_number: phoneNumber } = req.body || {};

  if (!serialNumber || !phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'serial_number and phone_number are required',
    });
  }

  if (!validatePhoneNumber(phoneNumber)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid phone number',
    });
  }

  // Validate tag exists and is unactivated
  const { data: tag, error: fetchError } = await supabase
    .from('tags')
    .select('*')
    .eq('serial_number', serialNumber)
    .eq('status', 'unactivated')
    .maybeSingle();

  if (fetchError) {
    // eslint-disable-next-line no-console
    console.error('Error fetching tag for OTP:', fetchError);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }

  if (!tag) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or already activated tag',
    });
  }

  const otp = generateOTP();
await storeOTP(phoneNumber, otp);
const sent = await sendOTP(phoneNumber, otp);

  if (!sent) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
    });
  }

  return res.json({
    success: true,
    message: 'OTP sent',
  });
}

async function verifyOTPController(req, res) {
  const {
    serial_number: serialNumber,
    phone_number: phoneNumber,
    otp,
  } = req.body || {};

  if (!serialNumber || !phoneNumber || !otp) {
    return res.status(400).json({
      success: false,
      message: 'serial_number, phone_number, and otp are required',
    });
  }

  if (!validatePhoneNumber(phoneNumber)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid phone number',
    });
  }

  const valid = await verifyOTP(phoneNumber, otp);

  if (!valid) {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP',
    });
  }

  const encryptedPhone = encrypt(phoneNumber);

  const { error: updateError } = await supabase
    .from('tags')
    .update({
      owner_phone_encrypted: encryptedPhone,
      status: 'active',
      activated_at: new Date().toISOString(),
    })
    .eq('serial_number', serialNumber);

  if (updateError) {
    // eslint-disable-next-line no-console
    console.error('Error updating tag on OTP verify:', updateError);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }

  return res.json({
    success: true,
    message: 'Tag activated',
  });
}

module.exports = {
  requestOTP,
  verifyOTP: verifyOTPController,
  requestOTPUid: async (req, res) => {
    const { uid, phone_number: phoneNumber } = req.body || {};

    if (!uid || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'uid and phone_number are required',
      });
    }

    if (!validatePhoneNumber(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number',
      });
    }

    const { data: tag, error: fetchError } = await supabase
      .from('tags')
      .select('uid, status')
      .eq('uid', uid)
      .maybeSingle();

    if (fetchError) {
      // eslint-disable-next-line no-console
      console.error('Error fetching tag for OTP (uid):', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }

    if (!tag) {
      return res.status(400).json({
        success: false,
        message: 'Tag not found',
      });
    }

    const statusLower =
      typeof tag.status === 'string' ? tag.status.toLowerCase().trim() : '';

    if (statusLower === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Tag already activated',
      });
    }

    const otp = generateOTP();
    await storeOTP(phoneNumber, otp);

    // eslint-disable-next-line no-console
    console.log(`Mock OTP for ${phoneNumber}: ${otp}`);
    await sendOTP(phoneNumber, otp);

    return res.json({
      success: true,
      message: 'OTP sent',
    });
  },
  verifyOTPUid: async (req, res) => {
    const {
      uid,
      phone_number: phoneNumber,
      otp,
      label,
      name,
    } = req.body || {};

    if (!uid || !phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'uid, phone_number, and otp are required',
      });
    }

    if (!validatePhoneNumber(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number',
      });
    }

    const valid = await verifyOTP(phoneNumber, String(otp));

    if (!valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    const encryptedPhone = encrypt(phoneNumber);

    const safeLabel = typeof label === 'string' ? label.trim().slice(0, 20) : null;
    const safeName = typeof name === 'string' ? name.trim().slice(0, 20) : null;

    const { error: updateError } = await supabase
      .from('tags')
      .update({
        owner_phone_encrypted: encryptedPhone,
        object_label: safeLabel,
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .eq('uid', uid);

    if (updateError) {
      // eslint-disable-next-line no-console
      console.error('Error updating tag on OTP verify (uid):', updateError);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }

    return res.json({
      success: true,
      message: 'Tag activated',
    });
  },
};

