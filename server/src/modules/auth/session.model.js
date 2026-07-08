import mongoose from 'mongoose';
import env from '../../config/env.js';

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    user: {
      type: Object,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: env.sessionMaxAgeDays * 24 * 60 * 60 // Auto-delete document when session expires
    }
  }
);

export const Session = mongoose.model('Session', sessionSchema);
