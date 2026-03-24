require('dotenv').config();

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { supabase } = require('../utils/supabase');

const TOTAL_TAGS = 500;
const BATCH_DIR = path.join(__dirname, '..', 'qr-batch');
const CSV_PATH = path.join(BATCH_DIR, 'mapping.csv');

const UID_LENGTH = 8;
const UID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

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

function generateUid() {
  let uid = '';
  for (let i = 0; i < UID_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * UID_CHARS.length);
    uid += UID_CHARS[idx];
  }
  return uid;
}

function generateUniqueUids(total) {
  const set = new Set();
  while (set.size < total) {
    set.add(generateUid());
  }
  return Array.from(set);
}

function serialNumberFromIndex(index) {
  const n = index + 1;
  return `TAG-${n.toString().padStart(3, '0')}`;
}

async function generateQr(uid, url, outputPath) {
  const options = {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 1200,
    margin: 2,
  };

  return QRCode.toFile(outputPath, url, options);
}

function writeCsv(rows) {
  const header = 'serial_number,uid,url,status';
  const lines = [header];

  for (const row of rows) {
    const { serial_number, uid, url, status } = row;
    const safeSerial = `"${serial_number.replace(/"/g, '""')}"`;
    const safeUid = `"${uid.replace(/"/g, '""')}"`;
    const safeUrl = `"${url.replace(/"/g, '""')}"`;
    const safeStatus = `"${status.replace(/"/g, '""')}"`;
    lines.push([safeSerial, safeUid, safeUrl, safeStatus].join(','));
  }

  fs.writeFileSync(CSV_PATH, `${lines.join('\n')}\n`, 'utf8');
}

async function insertIntoSupabase(rows) {
  const payload = rows.map((row) => ({
    uid: row.uid,
    serial_number: row.serial_number,
    status: row.status,
    object_type: 'car',
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('tags').insert(payload);

  if (error) {
    console.error('Error inserting into Supabase:', error.message || error);
    process.exit(1);
  }
}

async function main() {
  ensureEnv();
  ensureBatchDir();

  const baseUrl = process.env.BASE_URL.replace(/\/+$/, '');

  console.log(`Generating ${TOTAL_TAGS} QR codes into ${BATCH_DIR}...`);

  const uids = generateUniqueUids(TOTAL_TAGS);
  const rows = [];

  for (let i = 0; i < TOTAL_TAGS; i += 1) {
    const uid = uids[i];
    const serial_number = serialNumberFromIndex(i);
    const url = `${baseUrl}/q/${uid}`;
    const status = 'unactivated';

    const pngPath = path.join(BATCH_DIR, `${uid}.png`);

    // eslint-disable-next-line no-await-in-loop
    await generateQr(uid, url, pngPath);

    rows.push({ serial_number, uid, url, status });

    if ((i + 1) % 50 === 0) {
      console.log(`Generated ${i + 1} / ${TOTAL_TAGS} tags...`);
    }
  }

  console.log('Writing CSV mapping file...');
  writeCsv(rows);

  console.log('Inserting rows into Supabase...');
  await insertIntoSupabase(rows);

  console.log('All done.');
}

main().catch((err) => {
  console.error('Fatal error in generate-qr script:', err);
  process.exit(1);
});

