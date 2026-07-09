import crypto from 'crypto';

export function parseInitData(initData) {
  const params = new URLSearchParams(initData || '');
  const obj = {};
  for (const [key, value] of params.entries()) obj[key] = value;
  return obj;
}

export function validateTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'hash yoxdur' };

  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') entries.push(`${key}=${value}`);
  }
  entries.sort();
  const dataCheckString = entries.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return { ok: false, reason: 'hash uyğun gəlmədi' };

  const userRaw = params.get('user');
  if (!userRaw) return { ok: false, reason: 'user boşdur' };
  const user = JSON.parse(userRaw);
  return { ok: true, user, authDate: params.get('auth_date') };
}
