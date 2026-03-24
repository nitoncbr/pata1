require('dotenv').config();

const express = require('express');
const twilio = require('twilio');
const { supabase } = require('../utils/supabase');
const { generateToken, callOwner } = require('../utils/twilio');

const router = express.Router();

router.get('/token', (req, res) => {
  try {
    const identity = `finder-${Math.random().toString(36).slice(2, 10)}`;
    const token = generateToken(identity);

    return res.json({
      token,
      identity,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error generating Twilio token:', err.message || err);
    return res.status(500).json({
      token: null,
      identity: null,
      error: 'Failed to generate token',
    });
  }
});

router.post('/call-owner', async (req, res) => {
  const { uid } = req.body || {};

  if (!uid) {
    return res.status(400).json({
      success: false,
      message: 'uid is required',
    });
  }

  const { data: tag, error: tagError } = await supabase
    .from('tags')
    .select('uid, status, owner_phone_encrypted')
    .eq('uid', uid)
    .maybeSingle();

  if (tagError) {
    // eslint-disable-next-line no-console
    console.error('Error fetching tag for Twilio call:', tagError);
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

  const { error: incidentError } = await supabase.from('incidents').insert({
    tag_uid: uid,
    call_status: 'initiated',
    created_at: new Date().toISOString(),
  });

  if (incidentError) {
    // eslint-disable-next-line no-console
    console.error('Error logging Twilio incident:', incidentError);
  }

  const result = await callOwner(tag.owner_phone_encrypted);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate owner call',
    });
  }

  return res.json({
    success: true,
  });
});

router.post('/twiml', express.urlencoded({ extended: false }), (req, res) => {
  const { To } = req.body || {};

  const twiml = new twilio.twiml.VoiceResponse();

  if (To) {
    const dial = twiml.dial();
    dial.number(To);
  } else {
    twiml.say('No destination number provided.');
  }

  res.type('text/xml');
  return res.send(twiml.toString());
});

module.exports = router;

