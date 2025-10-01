import { exec } from 'child_process';
import { promisify } from 'util';
import { temporaryWrite } from 'tempy';
import { readFileSync, unlinkSync } from 'fs';

const execAsync = promisify(exec);

export class PdfTools {
  static async merge(files: Buffer[]): Promise<Buffer> {
    const inputPaths = await Promise.all(
      files.map(file => temporaryWrite(file, { extension: 'pdf' }))
    );
    const outputPath = await temporaryWrite('', { extension: 'pdf' });
    
    await execAsync(
      `pdftk ${inputPaths.join(' ')} cat output ${outputPath}`
    );
    
    const result = readFileSync(outputPath);
    
    // Cleanup
    inputPaths.concat(outputPath).forEach(path => unlinkSync(path));
    
    return result;
  }

  static async createFillableForm(template: Buffer, fields: Array<{
    name: string;
    type: 'text' | 'checkbox';
    position: { x: number; y: number; width: number; height: number };
  }>): Promise<Buffer> {
    // Implementation using pdftk + FDF generation
  }
}