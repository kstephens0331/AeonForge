import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { verifyJWT } from './authService';
import { ConversationMemory } from './memoryManager';

export class WebSocketManager {
  private wss: WebSocket.Server;
  private connections: Map<string, WebSocket> = new Map();
  private userMemories: Map<string, ConversationMemory> = new Map();

  constructor(server: any) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      try {
        const token = req.url?.split('token=')[1];
        if (!token) throw new Error('Unauthorized');

        const userId = await verifyJWT(token);
        this.connections.set(userId, ws);

        if (!this.userMemories.has(userId)) {
          this.userMemories.set(userId, new ConversationMemory());
        }

        ws.on('message', async (message: string) => {
          const memory = this.userMemories.get(userId)!;
          await memory.addToMemory(`User: ${message}`);
          
          // Broadcast to all project collaborators if in project mode
          if (req.url?.includes('/project/')) {
            const projectId = req.url.split('/project/')[1].split('?')[0];
            this.broadcastToProject(projectId, userId, message);
          }
        });

        ws.on('close', () => {
          this.connections.delete(userId);
        });

      } catch (error) {
        ws.close(1008, 'Authentication failed');
      }
    });
  }

  private broadcastToProject(projectId: string, senderId: string, message: string) {
    // Implementation would query project members from DB
    // and broadcast to all connected collaborators
  }

  public sendToUser(userId: string, message: string) {
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}