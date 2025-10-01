import { FileDB } from '../db/fileDB';

export class ToolService {
  private db = new FileDB();
  
  async getTools(category?: string, search?: string) {
    let tools = await this.db.getTools();
    
    if (category) {
      tools = tools.filter(t => t.category === category);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      tools = tools.filter(t => 
        t.name.toLowerCase().includes(searchLower) || 
        t.description.toLowerCase().includes(searchLower)
      );
    }
    
    return tools.sort((a, b) => b.usageCount - a.usageCount);
  }
  
  async executeTool(toolId: string, params: any) {
    const tool = await this.db.getTool(toolId);
    if (!tool) throw new Error('Tool not found');
    
    // In a real implementation, this would execute the tool
    const result = { 
      status: 'success', 
      output: `Executed ${tool.name} with params`
    };
    
    // Update usage count
    await this.db.updateTool(toolId, {
      usageCount: tool.usageCount + 1
    });
    
    return result;
  }
}