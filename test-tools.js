const http = require('http');

// Test the server
http.get('http://localhost:3000/tools', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const tools = JSON.parse(data);
    console.log(`Found ${tools.length} tools`);
    console.log('First tool:', tools[0]);
    
    // Test category filter
    http.get('http://localhost:3000/tools/document', (res) => {
      let catData = '';
      res.on('data', (chunk) => {
        catData += chunk;
      });
      res.on('end', () => {
        const docTools = JSON.parse(catData);
        console.log(`Found ${docTools.length} document tools`);
        process.exit(0);
      });
    });
  });
}).on('error', (err) => {
  console.error('Error:', err);
  process.exit(1);
});