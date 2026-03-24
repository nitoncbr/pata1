require('dotenv').config();

const express = require('express');
const { supabase } = require('../utils/supabase');
const { getScanPage } = require('../controllers/scanController');

const router = express.Router();

router.get('/:uid', async (req, res) => {
  const { uid } = req.params;

  let state = 'inactive';
  let objectType = null;
  let objectLabel = null;
  let status = null;

  if (uid) {
    const { data: tag, error } = await supabase
      .from('tags')
      .select('uid, serial_number, status, object_type, object_label')
      .eq('uid', uid)
      .maybeSingle();

    console.log('Supabase error:', error);
    console.log('Tag found:', tag);

    if (error) {
      console.error('Error looking up tag for scan:', error);
    } else if (tag) {
      status = tag.status || null;
      console.log('Status value:', status);

      const statusLower = typeof status === 'string' 
        ? status.toLowerCase().trim() 
        : '';

      console.log('Status lower:', statusLower);

      if (statusLower === 'unactivated') {
        return res.redirect(`/activate/${uid}`);
      }

      if (statusLower === 'active') {
        state = 'active';
      } else if (statusLower === 'lost') {
        state = 'lost';
      } else {
        state = 'inactive';
      }

      objectType = tag.object_type || 'car';
      objectLabel = tag.object_label || tag.serial_number || tag.uid;
    }
  }

  console.log('Final state:', state);

  req.pataData = {
    state,
    object_type: objectType,
    object_label: objectLabel,
    uid,
  };

  return getScanPage(req, res);
});

module.exports = router;