import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import { config } from '../../config';

export class AuthService {
  static generateTokens(userId: string) {
    const accessToken = jwt.sign(
      { userId },
      config.jwtSecret,
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { userId, tokenType: 'refresh' },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    
    return { accessToken, refreshToken };
  }

  static async verifyJWT(token: string): Promise<string> {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
      const user = await User.findById(decoded.userId);
      if (!user) throw new Error('User not found');
      return user._id.toString();
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  static async login(email: string, password: string) {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      throw new Error('Invalid credentials');
    }
    
    const tokens = this.generateTokens(user._id.toString());
    await user.updateLastLogin();
    
    return {
      ...tokens,
      user: {
        _id: user._id,
        email: user.email,
        storageQuota: user.storageQuota
      }
    };
  }
}