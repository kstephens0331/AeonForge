import { ToolDefinition } from '../types';
import { DockerRunner } from './DockerRunner';
import { Logger } from './Logger';

export class ToolEngine {
  private static instance: ToolEngine;
  private toolCache = new Map<string, ToolDefinition>();
  private executionQueue = new Map<string, Promise<any>>();

  private constructor() {}

  public static getInstance(): ToolEngine {
    if (!ToolEngine.instance) {
      ToolEngine.instance = new ToolEngine();
    }
    return ToolEngine.instance;
  }

  async executeTool(userId: string, toolId: string, params: any) {
    const executionKey = `${userId}-${toolId}-${JSON.stringify(params)}`;
    
    if (this.executionQueue.has(executionKey)) {
      return this.executionQueue.get(executionKey);
    }

    const promise = (async () => {
      try {
        const tool = await this.getToolDefinition(toolId);
        const runner = new DockerRunner({
          image: `tools/${tool.category}:latest`,
          timeout: tool.timeout || 30000,
          memoryLimit: '1g',
          network: 'none'
        });

        const result = await runner.execute(
          tool.entryPoint,
          params
        );

        Logger.logToolUsage(userId, toolId);
        return result;
      } finally {
        this.executionQueue.delete(executionKey);
      }
    })();

    this.executionQueue.set(executionKey, promise);
    return promise;
  }

  private async getToolDefinition(toolId: string): Promise<ToolDefinition> {
    if (!this.toolCache.has(toolId)) {
      const tool = await ToolDB.getById(toolId);
      this.toolCache.set(toolId, tool);
    }
    return this.toolCache.get(toolId)!;
  }
}