import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectDb() {
  if (!env.mongoUri) throw new Error('MONGODB_URI təyin edilməyib');
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 15000
  });
  return mongoose.connection;
}

export { mongoose };
