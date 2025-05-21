// fix-imports.cjs
// This script fixes incorrect imports in ES modules
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
  'fix-imports.cjs',
  'convert-to-esm.cjs',
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
    
    // Fix imports for node modules (they shouldn't have .js extension)
    content = content.replace(/import\s+(\w+)\s+from\s+["']([^./].*)\.js["'];/g, 'import $1 from "$2";');
    content = content.replace(/import\s+\{\s+([\w\s,]+)\s+\}\s+from\s+["']([^./].*)\.js["'];/g, 'import { $1 } from "$2";');
    
    // Write the updated content back to the file
    fs.writeFileSync(filePath, content);
  });
});

console.log('Import fixes complete!');
