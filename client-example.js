const http = require('http');

// Example: Get all document tools
http.get('http://localhost:3000/api/tools/category/document', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const tools = JSON.parse(data);
    console.log('Document Tools:');
    tools.slice(0, 5).forEach(tool => {
      console.log(`- ${tool.name} (${tool.id})`);
    });
    console.log(`Showing 5 of ${tools.length} document tools`);
  });
}).on('error', console.error);