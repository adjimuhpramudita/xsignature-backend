const { spawn } = require('child_process');
const path = require('path');

// Start the backend server
console.log('Starting backend server...');
const backendServer = spawn('node', ['src/index.js'], {
  stdio: 'inherit',
  shell: true
});

backendServer.on('error', (error) => {
  console.error('Failed to start backend server:', error);
});

// Start the frontend server
console.log('Starting frontend server...');
const frontendPath = path.join(__dirname, '..', 'xsignature-frontend');
const frontendServer = spawn('npm', ['start'], {
  cwd: frontendPath,
  stdio: 'inherit',
  shell: true
});

frontendServer.on('error', (error) => {
  console.error('Failed to start frontend server:', error);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Stopping servers...');
  backendServer.kill();
  frontendServer.kill();
  process.exit();
});

console.log('Servers started. Press Ctrl+C to stop.'); 