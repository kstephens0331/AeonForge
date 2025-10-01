import mongoose from 'mongoose';
import { User } from './User';

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer'],
      default: 'editor'
    }
  }],
  chatSessions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatSession'
  }],
  storageUsed: {
    type: Number,
    default: 0
  },
  settings: {
    defaultModel: {
      type: String,
      default: 'togethercomputer/llama-2-70b-chat'
    },
    hologramSettings: {
      avatarId: String,
      voiceId: String,
      animationProfile: String
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
ProjectSchema.index({ owner: 1 });
ProjectSchema.index({ 'collaborators.user': 1 });

// Middleware to cascade delete related data
ProjectSchema.pre('deleteOne', { document: true }, async function(next) {
  await mongoose.model('ChatSession').deleteMany({ project: this._id });
  next();
});

export const Project = mongoose.model('Project', ProjectSchema);