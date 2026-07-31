const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distPath = path.join(__dirname, 'dist', 'index.js');

if (!fs.existsSync(distPath)) {
  console.log('dist/index.js missing. Building TypeScript project...');
  execSync('npx tsc', { stdio: 'inherit' });
}

require('./dist/index.js');
