import { ChatHistory } from '../models/ChatHistory';
import diff from 'deep-diff';

export class ChatVersioning {
  static async createVersion(historyId: string, userId: string) {
    const original = await ChatHistory.findById(historyId);
    if (!original) throw new Error('Chat history not found');
    
    if (original.owner.toString() !== userId) {
      throw new Error('Not authorized to version this chat');
    }
    
    const version = {
      originalContent: original.content,
      timestamp: new Date(),
      versionNumber: (original.versions?.length || 0) + 1
    };
    
    original.versions = [...(original.versions || []), version];
    await original.save();
    
    return version;
  }

  static async restoreVersion(historyId: string, versionNumber: number, userId: string) {
    const history = await ChatHistory.findById(historyId);
    if (!history) throw new Error('Chat history not found');
    
    if (history.owner.toString() !== userId) {
      throw new Error('Not authorized to modify this chat');
    }
    
    const version = history.versions?.find(v => v.versionNumber === versionNumber);
    if (!version) throw new Error('Version not found');
    
    // Store current version before restoring
    await this.createVersion(historyId, userId);
    
    history.content = version.originalContent;
    await history.save();
    
    return history;
  }

  static async getDiff(historyId: string, version1: number, version2: number) {
    const history = await ChatHistory.findById(historyId);
    if (!history) throw new Error('Chat history not found');
    
    const v1 = history.versions?.find(v => v.versionNumber === version1);
    const v2 = history.versions?.find(v => v.versionNumber === version2);
    
    if (!v1 || !v2) throw new Error('One or both versions not found');
    
    return diff.diff(v1.originalContent, v2.originalContent);
  }
}