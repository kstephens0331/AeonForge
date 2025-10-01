import mongoose from 'mongoose';
import { Tool } from '../models/Tool';

export async function ensureToolIndexes() {
  await Tool.collection.createIndexes([
    {
      key: { category: 1, subcategory: 1, 'usageStats.count': -1 },
      name: 'category_popularity'
    },
    { 
      key: { isPremium: 1, category: 1 },
      name: 'premium_filter' 
    },
    {
      key: { 'compatibility.web': 1, 'compatibility.mobile': 1 },
      name: 'platform_availability'
    }
  ]);

  console.log('Tool indexes verified');
}