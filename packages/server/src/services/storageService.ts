import { User } from '../models/user';
import { ChatHistory } from '../models/chatHistory';
import { calculateObjectSize } from '../lib/storageCalculator';

export class StorageService {
  private static BASE_QUOTA = 1073741824; // 1GB
  private static PRICE_PER_GB = 9.99;

  static async checkUserQuota(userId: string): Promise<{
    used: number;
    quota: number;
    requiresUpgrade: boolean;
  }> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const history = await ChatHistory.find({ userId });
    const used = history.reduce((sum, item) => {
      return sum + calculateObjectSize(item);
    }, 0);

    return {
      used,
      quota: user.storageQuota || this.BASE_QUOTA,
      requiresUpgrade: used >= (user.storageQuota || this.BASE_QUOTA)
    };
  }

  static async upgradeStorage(userId: string, additionalGB: number) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const newQuota = (user.storageQuota || this.BASE_QUOTA) + (additionalGB * 1073741824);
    user.storageQuota = newQuota;
    await user.save();

    // In production: Hook up to payment system here
    const chargeAmount = additionalGB * this.PRICE_PER_GB;
    
    return {
      newQuota,
      chargeAmount
    };
  }

  static async cleanupOldMessages(userId: string, targetReductionBytes: number) {
    const messages = await ChatHistory.find({ userId })
      .sort({ createdAt: 1 }); // Oldest first
    
    let bytesFreed = 0;
    const deletedIds = [];
    
    for (const message of messages) {
      if (bytesFreed >= targetReductionBytes) break;
      
      const messageSize = calculateObjectSize(message);
      await message.deleteOne();
      
      bytesFreed += messageSize;
      deletedIds.push(message._id);
    }
    
    return { bytesFreed, deletedIds };
  }
}