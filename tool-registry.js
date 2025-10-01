const http = require('http');
const path = require('path');
const fs = require('fs');

// File-based tool database
const DATA_PATH = path.join(__dirname, 'tools-data.json');

class ToolRegistry {
  constructor() {
    this.tools = [];
    this.loadTools();
    if (this.tools.length === 0) {
      this.generateTools();
    }
  }

  loadTools() {
    try {
      this.tools = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (err) {
      this.tools = [];
    }
  }

  saveTools() {
    fs.writeFileSync(DATA_PATH, JSON.stringify(this.tools, null, 2));
  }

  generateTools() {
    const categories = ['document', 'finance', 'development', 'marketing', 'productivity'];
    
    this.tools = Array.from({ length: 10000 }, (_, i) => ({
      id: `tool-${String(i+1).padStart(5, '0')}`,
      name: `Tool ${i+1}`,
      description: `Automated ${categories[i%categories.length]} tool`,
      category: categories[i%categories.length],
      tags: [categories[i%categories.length], 'automated'],
      isPremium: i % 4 === 0,
      version: '1.0.0'
    }));
    
    this.saveTools();
  }

  getAllTools() {
    return this.tools;
  }

  getToolsByCategory(category) {
    return this.tools.filter(t => t.category === category);
  }

  getTool(id) {
    return this.tools.find(t => t.id === id);
  }
}

// Initialize registry
const registry = new ToolRegistry();

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(registry.getAllTools()));
  } 
  else if (req.url?.startsWith('/tools/') && req.method === 'GET') {
    const parts = req.url.split('/');
    if (parts.length === 3) {
      // /tools/{category}
      const tools = registry.getToolsByCategory(parts[2]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tools));
    } else if (parts.length === 4 && parts[2] === 'id') {
      // /tools/id/{toolId}
      const tool = registry.getTool(parts[3]);
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

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Total tools: ${registry.getAllTools().length}`);
});