const http = require('http');

function testEndpoint(url) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000${url}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    }).on('error', () => resolve({ error: true }));
  });
}

async function runTests() {
  // Test all tools endpoint
  const allTools = await testEndpoint('/api/tools');
  console.log(`All tools: ${allTools.data.length} tools returned`);
  
  // Test category filter
  const docTools = await testEndpoint('/api/tools/category/document');
  console.log(`Document tools: ${docTools.data.length} tools returned`);
  
  // Test single tool
  const firstTool = await testEndpoint('/api/tools/tool-00001');
  console.log('First tool:', firstTool.data);
  
  process.exit(0);
}

runTests();