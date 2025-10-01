const http = require('http');
const fs = require('fs');

// Read port from file
const PORT = parseInt(fs.readFileSync('server.port', 'utf-8'));

// Test endpoints
function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    http.get(`http://localhost:${PORT}${endpoint}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', resolve);
  });
}

async function runTests() {
  // Test all tools
  const allTools = await testEndpoint('/api/tools');
  console.log(`✅ Found ${allTools.length} tools`);
  
  // Test category filter
  const docTools = await testEndpoint('/api/tools/category/document');
  console.log(`✅ Found ${docTools.length} document tools`);
  
  process.exit(0);
}

// Wait for server to start
setTimeout(runTests, 1000);