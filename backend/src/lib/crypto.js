import crypto from 'crypto';

function getKey(){
  // Accept a real 32-byte base64 key when provided.
  const raw = process.env.SESSION_ENC_KEY_BASE64;
  if (raw && raw.length > 0) {
    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 32) return decoded;
    } catch {
      // Fall through to deterministic hashing below.
    }

    // Fallback: derive a stable 32-byte key from the provided value.
    return crypto.createHash('sha256').update(raw).digest();
  }

  // dev fallback (not for prod)
  return crypto.createHash('sha256').update(process.env.JWT_REFRESH_SECRET || 'dev').digest();
}

export function encryptString(plain){
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptString(b64){
  const key = getKey();
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString('utf8');
}

export function randomToken(bytes=32){
  return crypto.randomBytes(bytes).toString('base64url');
}
