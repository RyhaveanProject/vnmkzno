import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';

export async function changeBalance(telegramId, deltaStars, { type, source, title, meta = {} } = {}) {
  const user = await User.findOneAndUpdate(
    { telegramId },
    { $inc: { balanceStars: deltaStars }, $set: { updatedAt: new Date() } },
    { new: true }
  );
  if (!user) throw new Error('İstifadəçi tapılmadı');
  if (user.balanceStars < 0) {
    await User.findOneAndUpdate({ telegramId }, { $inc: { balanceStars: -deltaStars } });
    throw new Error('Balans kifayət etmir');
  }
  await Transaction.create({
    telegramId,
    type,
    amountStars: deltaStars,
    balanceAfter: user.balanceStars,
    source,
    title,
    meta
  });
  return user;
}

export async function recordWager(telegramId, amountStars) {
  return User.findOneAndUpdate({ telegramId }, { $inc: { totalWageredStars: amountStars } }, { new: true });
}
