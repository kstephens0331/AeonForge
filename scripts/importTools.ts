import { Tool } from '../packages/server/src/models/Tool';
import toolManifest from './tool-manifest.json';

async function importTools() {
  const batchSize = 100;
  
  for (let i = 0; i < toolManifest.length; i += batchSize) {
    const batch = toolManifest.slice(i, i + batchSize);
    await Tool.insertMany(batch, { ordered: false });
    console.log(`Imported batch ${i/batchSize + 1}`);
  }
}

importTools().catch(console.error);