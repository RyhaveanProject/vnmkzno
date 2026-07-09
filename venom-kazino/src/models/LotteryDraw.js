import { mongoose } from '../lib/db.js';

const lotteryDrawSchema = new mongoose.Schema({
  drawNo: Number,
  drawAt: Date,
  prizePoolStars: { type: Number, default: 0 },
  winningNumbers: { type: Array, default: [] },
  tickets: { type: Array, default: [] },
  status: { type: String, default: 'open' },
  createdAt: { type: Date, default: Date.now },
  closedAt: Date
});

export const LotteryDraw = mongoose.models.LotteryDraw || mongoose.model('LotteryDraw', lotteryDrawSchema);
