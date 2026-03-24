require('dotenv').config();

const express = require('express');
const {
  requestOTP,
  verifyOTP,
  requestOTPUid,
  verifyOTPUid,
} = require('../controllers/activationController');

const router = express.Router();

router.post('/api/activate/request-otp', requestOTP);
router.post('/api/activate/verify-otp', verifyOTP);

router.post('/api/activate/request-otp-uid', requestOTPUid);
router.post('/api/activate/verify-otp-uid', verifyOTPUid);

module.exports = router;

