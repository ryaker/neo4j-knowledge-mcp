// convert-to-esm.js
// This script converts CommonJS modules to ES modules
const fs = require('fs');
const path = require('path');

// Directories to process
const dirs = [
  '.',
  './knowledge',
  './extractors',
  './schemas',
  './utils'
];

// Files to skip
const skipFiles = [
  'convert-to-esm.js',
  'node_modules'
];

// Process each directory
dirs.forEach(dir => {
  const files = fs.readdirSync(dir).filter(file => 
    file.endsWith('.js') && 
    !skipFiles.some(skip => file.includes(skip))
  );
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    console.log(`Processing ${filePath}...`);
    
    // Replace require with import
    content = content.replace(/const\s+(\w+)\s+=\s+require\(['"](.*)['"]\);/g, 'import $1 from "$2.js";');
    
    // Replace destructured require with import
    content = content.replace(/const\s+\{\s+([\w\s,]+)\s+\}\s+=\s+require\(['"](.*)['"]\);/g, 'import { $1 } from "$2.js";');
    
    // Replace module.exports with export default
    content = content.replace(/module\.exports\s+=\s+(\w+);/g, 'export default $1;');
    
    // Replace destructured exports
    content = content.replace(/module\.exports\s+=\s+\{\s+([\w\s,]+)\s+\};/g, 'export { $1 };');
    
    // Write the updated content back to the file
    fs.writeFileSync(filePath, content);
  });
});

console.log('Conversion complete!');
