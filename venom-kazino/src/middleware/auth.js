import { env } from '../config/env.js';
import { verifyToken } from '../lib/utils.js';
import { User } from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = verifyToken(token, env.jwtSecret);
    if (!payload?.telegramId) return res.status(401).json({ ok: false, error: 'Giriş tələb olunur' });
    const user = await User.findOne({ telegramId: payload.telegramId });
    if (!user) return res.status(401).json({ ok: false, error: 'İstifadəçi tapılmadı' });
    req.user = user;
    req.auth = payload;
    next();
  } catch (error) {
    res.status(401).json({ ok: false, error: error.message || 'Auth xətası' });
  }
}

export async function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ ok: false, error: 'Admin giriş lazımdır' });
  next();
}
