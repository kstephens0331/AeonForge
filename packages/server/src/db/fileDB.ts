import fs from 'fs';
import path from 'path';

export class FileDB {
  private dataDir: string;
  
  constructor() {
    this.dataDir = path.join(__dirname, '../../../data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  async getTools(): Promise<any[]> {
    const filePath = path.join(this.dataDir, 'tools.json');
    if (!fs.existsSync(filePath)) return [];
    
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  
  async saveTools(tools: any[]): Promise<void> {
    const filePath = path.join(this.dataDir, 'tools.json');
    fs.writeFileSync(filePath, JSON.stringify(tools, null, 2));
  }
  
  async getTool(id: string): Promise<any | null> {
    const tools = await this.getTools();
    return tools.find(t => t.id === id) || null;
  }
  
  async updateTool(id: string, updates: any): Promise<void> {
    const tools = await this.getTools();
    const index = tools.findIndex(t => t.id === id);
    
    if (index >= 0) {
      tools[index] = { ...tools[index], ...updates };
      await this.saveTools(tools);
    }
  }
}