import mongoose from 'mongoose';

const ExecutionSchema = new mongoose.Schema({
  tool: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Tool',
    required: true 
  },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  project: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Project' 
  },
  inputHash: { type: String }, // For caching
  executionTimeMs: { type: Number },
  success: { type: Boolean },
  error: { type: String },
  resultSizeBytes: { type: Number },
  apiCalls: [{
    endpoint: String,
    durationMs: Number
  }]
}, { timestamps: true });

// Indexes for analytics
ExecutionSchema.index({ tool: 1, createdAt: -1 });
ExecutionSchema.index({ user: 1, success: 1 });

export const ToolExecution = mongoose.model('ToolExecution', ExecutionSchema);