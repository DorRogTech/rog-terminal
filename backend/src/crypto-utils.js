const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

// In production, enforce ENCRYPTION_KEY at startup
if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_KEY) {
  const generated = crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = generated;
  console.error('='.repeat(70));
  console.error('[CRITICAL] ENCRYPTION_KEY is NOT set in production!');
  console.error('[CRITICAL] A random key has been generated for this session.');
  console.error('[CRITICAL] Data encrypted with this key will be LOST on restart.');
  console.error('[CRITICAL] Set ENCRYPTION_KEY env var to a 64-char hex string.');
  console.error('='.repeat(70));
}

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.warn('[Security] ENCRYPTION_KEY not set - API keys will be stored in plaintext');
    return null;
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: enc:<iv>:<tag>:<ciphertext>
  return ENCRYPTED_PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;

  // If not encrypted (legacy plaintext), return as-is
  if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) {
    return ciphertext;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY required to decrypt API keys');
  }

  const parts = ciphertext.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function isEncrypted(value) {
  return value && value.startsWith(ENCRYPTED_PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
