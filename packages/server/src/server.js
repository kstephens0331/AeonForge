const http = require('http');
const path = require('path');
const fs = require('fs');

// Self-contained tool registry
class ToolRegistry {
  constructor() {
    this.tools = [];
    this.dataPath = path.join(__dirname, 'data/tools.json');
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        this.generateTools();
      } else {
        this.tools = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
      }
    } catch (err) {
      console.error('Error initializing tools:', err);
      this.tools = [];
    }
  }

  generateTools() {
    const categories = ['document', 'finance', 'development', 'marketing', 'productivity'];
    
    this.tools = Array.from({ length: 10000 }, (_, i) => ({
      id: `tool-${String(i+1).padStart(5, '0')}`,
      name: `Tool ${i+1}`,
      description: `Automated ${categories[i%categories.length]} tool`,
      category: categories[i%categories.length],
      isPremium: i % 4 === 0
    }));

    fs.mkdirSync(path.dirname(this.dataPath), { recursive: true });
    fs.writeFileSync(this.dataPath, JSON.stringify(this.tools, null, 2));
  }

  getTools(category) {
    return category 
      ? this.tools.filter(t => t.category === category) 
      : this.tools;
  }
}

// Create server
const toolRegistry = new ToolRegistry();
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/tools') && req.method === 'GET') {
    const parts = req.url.split('/');
    const category = parts.length >= 4 ? parts[3] : null;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(toolRegistry.getTools(category)));
  } else {
    res.writeHead(404).end('Not found');
  }
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
  console.log(`Loaded ${toolRegistry.tools.length} tools`);
});