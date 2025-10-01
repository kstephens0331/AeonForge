import { ToolRegistry } from './ToolRegistry';
import { User } from '../models/User';
import { ExternalAPI } from './ExternalAPI';
import { AIProcessor } from './AIProcessor';

export class ToolExecutor {
  static async execute(
    userId: string, 
    toolId: string, 
    parameters: any
  ) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const registry = ToolRegistry.getInstance();
    const result = await registry.executeTool(user, toolId, parameters);
    
    // Log tool usage for analytics
    await this.logToolUsage(userId, toolId);
    
    return result;
  }

  private static async logToolUsage(userId: string, toolId: string) {
    // Implementation would connect to analytics service
  }

  // Dynamic tool routing based on category
  static async routeToCategoryHandler(
    category: string, 
    toolId: string, 
    params: any
  ) {
    switch (category) {
      case 'finance':
        return FinanceToolHandler.execute(toolId, params);
      case 'development':
        return DevToolHandler.execute(toolId, params);
      case 'marketing':
        return MarketingToolHandler.execute(toolId, params);
      // Additional category handlers...
      default:
        throw new Error(`Unsupported tool category: ${category}`);
    }
  }
}