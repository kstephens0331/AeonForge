const { execSync } = require('child_process');
try {
  execSync('npm install --prefix packages/server', { stdio: 'inherit' });
  console.log('Dependencies installed successfully');
} catch (error) {
  console.error('Failed to install dependencies:', error);
}