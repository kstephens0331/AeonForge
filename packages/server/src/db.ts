import mongoose from 'mongoose';
import { Tool } from './models/Tool';

export async function initDB() {
  // Use MongoDB Atlas or local connection
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/aeonforge';
  
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000
  });
  
  // Verify connection
  await mongoose.connection.db.admin().ping();
  console.log('Database connected successfully');
  
  // Apply indexes
  await Tool.initIndexes();
}

export { Tool };