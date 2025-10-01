const net = require('net');
const { exec } = require('child_process');

const PORT = 3000;

// Check if port is in use
const server = net.createServer();
server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is in use, attempting to free it...`);
    
    // Platform-specific commands to find and kill process
    const cmd = process.platform === 'win32' 
      ? `netstat -ano | findstr :${PORT}` 
      : `lsof -i :${PORT} | grep LISTEN`;
    
    exec(cmd, (err, stdout) => {
      if (err) {
        console.error('Failed to find process:', err);
        process.exit(1);
      }
      
      const matches = stdout.match(/\d+$/);
      if (matches) {
        const pid = matches[0];
        console.log(`Found process with PID ${pid}, killing...`);
        process.kill(pid, 'SIGTERM');
        console.log(`Port ${PORT} should now be free`);
      } else {
        console.log('No process found using port', PORT);
      }
    });
  }
});

server.listen(PORT, () => {
  server.close();
  console.log(`Port ${PORT} is available`);
});