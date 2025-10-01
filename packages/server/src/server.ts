import http from 'http';
import { ToolRegistry } from './services/ToolRegistry';

// Initialize tool registry
const toolRegistry = ToolRegistry.getInstance();

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/tools') && req.method === 'GET') {
    const urlParts = req.url.split('/');
    
    if (urlParts.length === 3) {
      // GET /api/tools
      const tools = toolRegistry.getTools();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tools));
    } else if (urlParts.length === 4) {
      // GET /api/tools/{category}
      const category = urlParts[3];
      const tools = toolRegistry.getTools(category);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tools));
    } else if (urlParts.length === 5 && urlParts[3] === 'id') {
      // GET /api/tools/id/{toolId}
      const toolId = urlParts[4];
      const tool = toolRegistry.getTool(toolId);
      if (tool) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tool));
      } else {
        res.writeHead(404);
        res.end('Tool not found');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Total tools loaded: ${toolRegistry.getTools().length}`);
});