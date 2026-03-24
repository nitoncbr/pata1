require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { initiateCall } = require('../utils/exotel');

const router = express.Router();

function isValidPhone(phone) {
  return /^\d{10}$/.test(String(phone).trim());
}

function generateSessionToken() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 16; i += 1) {
    const idx = crypto.randomInt(0, alphabet.length);
    token += alphabet[idx];
  }
  return token;
}

router.post('/initiate', async (req, res) => {
  const { uid, finder_phone: finderPhone } = req.body || {};

  if (!uid || !isValidPhone(finderPhone)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid finder_phone or uid',
    });
  }

  const { data: tag, error: tagError } = await supabase
    .from('tags')
    .select('uid, status, owner_phone_encrypted')
    .eq('uid', uid)
    .maybeSingle();

  if (tagError) {
    // eslint-disable-next-line no-console
    console.error('Error fetching tag for call:', tagError);
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

  if (statusLower !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'Tag is not active',
    });
  }

  const scannerIp = req.ip;
  const sessionToken = generateSessionToken();

  const { data: incident, error: insertError } = await supabase
    .from('incidents')
    .insert({
      tag_uid: uid,
      scanner_ip: scannerIp,
      call_status: 'initiated',
      session_token: sessionToken,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (insertError) {
    // eslint-disable-next-line no-console
    console.error('Error inserting incident:', insertError);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }

  const incidentId = incident?.id;

  const callResult = await initiateCall(finderPhone, tag.owner_phone_encrypted);

  if (callResult.success) {
    if (incidentId) {
      await supabase
        .from('incidents')
        .update({ call_status: 'answered' })
        .eq('id', incidentId);
    }

    return res.json({
      success: true,
      message: 'Call initiated',
    });
  }

  if (incidentId) {
    await supabase
      .from('incidents')
      .update({ call_status: 'missed' })
      .eq('id', incidentId);
  }

  return res.status(500).json({
    success: false,
    message: 'Call failed',
  });
});

module.exports = router;

