const crypto = require('crypto');

const RAW_KEY = process.env.ENCRYPTION_KEY;

if (!RAW_KEY) {
  throw new Error('Missing ENCRYPTION_KEY in environment variables');
}

// Support hex-encoded 32-byte keys (64 chars) or raw utf8 32-char keys
let key;
if (/^[0-9a-fA-F]{64}$/.test(RAW_KEY)) {
  key = Buffer.from(RAW_KEY, 'hex');
} else {
  key = Buffer.from(RAW_KEY, 'utf8');
}

if (key.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (256 bits) after decoding');
}

function encrypt(text) {
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const ivHex = iv.toString('hex');
  const encryptedHex = encrypted.toString('hex');
  const authTagHex = authTag.toString('hex');

  // Return iv, encryptedData, authTag as a single hex string
  return `${ivHex}:${encryptedHex}:${authTagHex}`;
}

function decrypt(hash) {
  const [ivHex, encryptedHex, authTagHex] = hash.split(':');

  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encryptedData = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

  return decrypted.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
};

