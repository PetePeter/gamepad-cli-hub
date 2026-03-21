/**
 * Electron startup script with tsx
 */
const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx');

// Set NODE_ENV to use tsx
process.env.NODE_ENV = 'development';

// Start Electron with tsx
const proc = spawn(electron, ['.', '--inspect'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});

proc.on('close', (code) => {
  process.exit(code ?? 0);
});
