const fs = require('fs');

// Delete port file if exists
if (fs.existsSync('server.port')) {
  fs.unlinkSync('server.port');
}

console.log('✅ Cleanup complete');