import { mongoose } from '../lib/db.js';

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, index: true },
  username: String,
  firstName: String,
  lastName: String,
  photoUrl: String,
  languageCode: String,
  balanceStars: { type: Number, default: 0 },
  totalDepositedStars: { type: Number, default: 0 },
  totalWithdrawnStars: { type: Number, default: 0 },
  totalWageredStars: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLoginAt: Date
});

userSchema.pre('save', function save(next) {
  this.updatedAt = new Date();
  next();
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
