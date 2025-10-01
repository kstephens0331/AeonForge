import express from 'express';
import { User } from '../../models/User';
import { verifyJWT } from '../../services/authService';

const router = express.Router();

// Available hologram presets
const PRESETS = {
  'professional': {
    model: 'hologram-pro-v1',
    voice: 'en-us-01',
    animations: ['nod', 'listen', 'explain']
  },
  'casual': {
    model: 'hologram-casual-v2',
    voice: 'en-us-03',
    animations: ['gesture', 'laugh', 'ponder']
  },
  'technical': {
    model: 'hologram-tech-v1',
    voice: 'en-us-05',
    animations: ['diagram', 'point', 'calculate']
  }
};

router.post('/customize', async (req, res) => {
  try {
    const userId = await verifyJWT(req.headers.authorization?.split(' ')[1] || '');
    const { preset, customSettings } = req.body;
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    if (preset && PRESETS[preset as keyof typeof PRESETS]) {
      user.hologramSettings = PRESETS[preset as keyof typeof PRESETS];
    } else if (customSettings) {
      user.hologramSettings = {
        ...user.hologramSettings,
        ...customSettings
      };
    } else {
      throw new Error('Invalid customization request');
    }
    
    await user.save();
    
    res.json({
      success: true,
      settings: user.hologramSettings
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Customization failed'
    });
  }
});

export default router;