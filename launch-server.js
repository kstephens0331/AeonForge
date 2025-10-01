const { spawn } = require('child_process');

// Start the server directly without changing directories
const server = spawn('node', ['packages/server/src/server.js'], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
});