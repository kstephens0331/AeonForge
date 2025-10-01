const http = require('http');

// Test the server
function testServer() {
  http.get('http://localhost:3000/api/tools', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      const tools = JSON.parse(data);
      console.log(`Server responded with ${tools.length} tools`);
      
      // Test category filter
      http.get('http://localhost:3000/api/tools/document', (res) => {
        let catData = '';
        res.on('data', (chunk) => catData += chunk);
        res.on('end', () => {
          const docTools = JSON.parse(catData);
          console.log(`Found ${docTools.length} document tools`);
          process.exit(0);
        });
      });
    });
  }).on('error', (err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

// Wait 1 second for server to start
setTimeout(testServer, 1000);