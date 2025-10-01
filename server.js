const http = require('http');
const net = require('net');

// Generate 10,000 tools
const categories = ['document', 'finance', 'development', 'marketing', 'productivity'];
const tools = Array.from({length: 10000}, (_, i) => ({
  id: `tool-${String(i+1).padStart(5, '0')}`,
  name: `${categories[i%5]} Tool ${i+1}`,
  description: `Automated ${categories[i%5]} solution`,
  category: categories[i%5],
  isPremium: i % 4 === 0,
  version: '1.0.0'
}));

// Check port availability
async function getAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(getAvailablePort(startPort + 1)));
    server.once('listening', () => {
      server.close(() => resolve(startPort));
    });
    server.listen(startPort);
  });
}

// Create HTTP server
async function startServer() {
  try {
    const PORT = await getAvailablePort(3000);
    
    const server = http.createServer((req, res) => {
      if (req.url === '/api/tools' && req.method === 'GET') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(tools));
      } else if (req.url?.startsWith('/api/tools/category/')) {
        const category = req.url.split('/').pop();
        const filtered = tools.filter(t => t.category === category);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(filtered));
      } else {
        res.writeHead(404).end('Not found');
      }
    });

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Access tools at http://localhost:${PORT}/api/tools`);
      
      // Write port to file for testing
      require('fs').writeFileSync('server.port', PORT.toString());
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();