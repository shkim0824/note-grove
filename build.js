// Build the deployable single-file app (index.html, guide.html at the repo root) from src/. Usage: node build.js
'use strict';
const fs = require('fs');
const path = require('path');
const VERSION = process.env.NG_VERSION || '2026.10.29-1';
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const md = src('md.js'), app = src('app.js');
for (const [name, code] of [['md.js', md], ['app.js', app]]) {
  for (const bad of ['</script', '<!--']) if (code.toLowerCase().includes(bad)) throw new Error(`${name} contains "${bad}", which would break the inline <script>`);
}
let html = src('index.template.html')
  .replace('/*__MD_JS__*/', () => md)
  .replace('/*__APP_JS__*/', () => app)
  .replace(/__VERSION__/g, VERSION)
  .replace('__CONNECT_SRC__', 'https://api.github.com https://raw.githubusercontent.com');
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
fs.writeFileSync(path.join(__dirname, 'guide.html'), src('guide.html').replace(/__VERSION__/g, VERSION));
fs.writeFileSync(path.join(__dirname, '.nojekyll'), '');
console.log(`index.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, version ${VERSION}`);
