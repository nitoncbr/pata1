require('dotenv').config();

const express = require('express');
const path = require('path');
const { validateProductionEnv } = require('./config/validateEnv');
const { securityHeaders } = require('./middleware/securityHeaders');

validateProductionEnv();

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));
// ngrok/proxies set X-Forwarded-For; tell Express to trust it so
// express-rate-limit can identify clients without throwing.
app.set('trust proxy', 1);
app.use(
  express.static('public', {
    maxAge: process.env.NODE_ENV === 'production' ? 3600000 : 0,
  }),
);

// Routes
const activationRoutes = require('./routes/activation');
const scanRoutes = require('./routes/scan');
const twilioRoutes = require('./routes/twilio');
const callRoutes = require('./routes/call');
const waitlistRoutes = require('./routes/waitlist');

app.use(activationRoutes);
app.use('/q', scanRoutes);
app.use('/api/twilio', twilioRoutes);
app.use('/api/call', callRoutes);
app.use('/api/waitlist', waitlistRoutes);

app.get('/waitlist', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'waitlist.html'));
});

app.get('/unsubscribe', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.send('Invalid link.');
  // eslint-disable-next-line global-require
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );
  await supabase
    .from('waitlist')
    .delete()
    .eq('email', email.toLowerCase());
  return res.send(
    '<html><body style="background:#09090C;color:#F0EDE6;font-family:sans-serif;text-align:center;padding:80px 24px;"><h2 style="color:#C9973A;">Unsubscribed.</h2><p style="color:rgba(240,237,230,0.5);margin-top:12px;">You have been removed from the PATA waitlist.</p></body></html>',
  );
});

app.get('/activate/:uid', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'activate.html'));
});

app.get('/activate', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'activate.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', product: 'Pata' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Pata server listening on port ${PORT}`);
});

