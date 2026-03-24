require('dotenv').config();

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const UID = '4GE7M81B';
const BATCH_DIR = path.join(__dirname, '..', 'qr-batch');
const OUTPUT_PATH = path.join(BATCH_DIR, 'test.png');

function ensureEnv() {
  if (!process.env.BASE_URL) {
    console.error('Missing BASE_URL in environment variables.');
    process.exit(1);
  }
}

function ensureBatchDir() {
  if (!fs.existsSync(BATCH_DIR)) {
    fs.mkdirSync(BATCH_DIR, { recursive: true });
  }
}

async function main() {
  ensureEnv();
  ensureBatchDir();

  const baseUrl = process.env.BASE_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/q/${UID}`;

  const options = {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 1200,
    margin: 2,
  };

  await QRCode.toFile(OUTPUT_PATH, url, options);

  console.log(`UID: ${UID}`);
  console.log(`URL: ${url}`);
  console.log(`Saved: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error in test-qr script:', err);
  process.exit(1);
});

