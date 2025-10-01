import fs from 'fs';
import path from 'path';

type Tool = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  isPremium: boolean;
};

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Tool[] = [];
  private dataPath = path.join(__dirname, '../../data/tools.json');

  private constructor() {
    this.loadTools();
    if (this.tools.length === 0) {
      this.generateTools();
    }
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  private loadTools() {
    try {
      const data = fs.readFileSync(this.dataPath, 'utf-8');
      this.tools = JSON.parse(data);
    } catch (error) {
      this.tools = [];
    }
  }

  private saveTools() {
    fs.writeFileSync(this.dataPath, JSON.stringify(this.tools, null, 2));
  }

  private generateTools() {
    const categories = ['document', 'finance', 'development', 'marketing', 'productivity'];
    const prefixes = ['AI', 'Smart', 'Auto', 'Pro', 'Easy'];
    const suffixes = ['Generator', 'Tool', 'Assistant', 'Creator', 'Helper'];

    this.tools = Array.from({ length: 10000 }, (_, i) => ({
      id: `tool-${i.toString().padStart(5, '0')}`,
      name: `${prefixes[i % prefixes.length]} ${categories[i % categories.length]} ${suffixes[i % suffixes.length]}`,
      description: `Automatically ${categories[i % categories.length]} ${suffixes[i % suffixes.length].toLowerCase()} for your needs`,
      category: categories[i % categories.length],
      tags: [categories[i % categories.length], suffixes[i % suffixes.length].toLowerCase()],
      isPremium: i % 4 === 0
    }));

    this.saveTools();
  }

  public getTools(category?: string): Tool[] {
    if (category) {
      return this.tools.filter(tool => tool.category === category);
    }
    return this.tools;
  }

  public getTool(id: string): Tool | undefined {
    return this.tools.find(tool => tool.id === id);
  }
}