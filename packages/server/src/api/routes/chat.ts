import express from 'express';
import { ConversationMemory } from '../services/memoryManager';
import { processWithTogetherAI } from '../lib/aiIntegration';

const router = express.Router();

// In-memory store for demo (replace with DB in production)
const userSessions = new Map<string, ConversationMemory>();

router.post('/chat', async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userSessions.has(userId)) {
      userSessions.set(userId, new ConversationMemory());
    }
    
    const memory = userSessions.get(userId)!;
    await memory.addToMemory(`User: ${message}`);
    
    const context = memory.getMemoryContext();
    const aiResponse = await processWithTogetherAI(context);
    
    await memory.addToMemory(`AI: ${aiResponse}`);
    
    res.json({
      response: aiResponse,
      tokensUsed: memory.getCurrentTokenCount(),
      storageQuota: 1073741824, // 1GB in bytes
      storageUsed: 0 // Will implement later
    });
  } catch (error) {
    res.status(500).json({ error: 'Chat processing failed' });
  }
});

export default router;