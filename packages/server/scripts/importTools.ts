import { Tool } from '../src/models/Tool';
import toolsData from './tools.json';

async function importTools() {
  try {
    await Tool.deleteMany({});
    
    const tools = toolsData.map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      tags: tool.tags,
      input: tool.input,
      output: tool.output,
      endpoint: `/tools/${tool.category}/${tool.id}`,
      isFree: tool.free
    }));
    
    await Tool.insertMany(tools);
    console.log(`Successfully imported ${tools.length} tools`);
  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    process.exit();
  }
}

importTools();