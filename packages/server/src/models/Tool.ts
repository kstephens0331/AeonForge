import { Schema, model, Document } from 'mongoose';

interface ITool extends Document {
  id: string;
  name: string;
  description: string;
  category: string;
  endpoint: string;
  isPremium: boolean;
  version: string;
  usageStats: {
    count: number;
    lastUsed?: Date;
  };
}

const ToolSchema = new Schema<ITool>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  endpoint: { type: String, required: true },
  isPremium: { type: Boolean, default: false },
  version: { type: String, default: '1.0.0' },
  usageStats: {
    count: { type: Number, default: 0 },
    lastUsed: { type: Date }
  }
});

// Create indexes
ToolSchema.index({ name: 'text', description: 'text' });
ToolSchema.index({ category: 1, 'usageStats.count': -1 });

export const Tool = model<ITool>('Tool', ToolSchema);