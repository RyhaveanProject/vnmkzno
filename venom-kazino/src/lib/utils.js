import crypto from 'crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export function hmacSha256(key, text) {
  return crypto.createHmac('sha256', key).update(text).digest('hex');
}

export function base64Url(data) {
  return Buffer.from(data).toString('base64url');
}

export function signToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyToken(token, secret) {
  const [header, payload, signature] = String(token || '').split('.');
  if (!header || !payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  if (expected !== signature) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function integerAmount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function pickWeighted(entries, field = 'weight') {
  const total = entries.reduce((sum, item) => sum + Number(item[field] || 0), 0);
  if (!total) return null;
  let cursor = Math.random() * total;
  for (const item of entries) {
    cursor -= Number(item[field] || 0);
    if (cursor <= 0) return item;
  }
  return entries[entries.length - 1] || null;
}

export function randomInt(maxExclusive) {
  return crypto.randomInt(0, maxExclusive);
}

export function gameSeed(seed = '') {
  return crypto.createHash('sha256').update(`${seed}:${Date.now()}:${Math.random()}`).digest();
}
