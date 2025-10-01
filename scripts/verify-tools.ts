import { ToolRegistry } from '../packages/server/src/services/ToolRegistry';

const toolRegistry = ToolRegistry.getInstance();
const tools = toolRegistry.getAllTools();

console.log(`Total tools loaded: ${tools.length}`);
console.log('Sample tools:');
console.log(tools.slice(0, 3));

if (tools.length === 10000) {
  console.log('✅ Tool registry initialized successfully with 10,000 tools');
  process.exit(0);
} else {
  console.error('❌ Tool registry initialization failed');
  process.exit(1);
}