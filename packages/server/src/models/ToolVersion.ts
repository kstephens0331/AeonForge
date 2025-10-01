import mongoose from 'mongoose';

const ToolVersionSchema = new mongoose.Schema({
  toolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true },
  version: { type: String, required: true },
  changelog: { type: String, required: true },
  deprecated: { type: Boolean, default: false },
  breakingChanges: { type: Boolean, default: false },
  endpoint: { type: String, required: true },
  inputSchema: { type: mongoose.Schema.Types.Mixed, required: true },
  releaseDate: { type: Date, default: Date.now },
  compatibility: {
    minAppVersion: String,
    maxAppVersion: String
  }
}, { timestamps: true });

ToolVersionSchema.index({ toolId: 1, version: 1 }, { unique: true });

export const ToolVersion = mongoose.model('ToolVersion', ToolVersionSchema);