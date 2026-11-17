#!/usr/bin/env node
// Imperial Rotor Cipher. Copyright (C) 2026 Antonio. SPDX-License-Identifier: GPL-3.0-or-later
// Builds the single-file app: src/template.html + styles.css + core.js + ui.js -> index.html
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8').trimEnd();
const html = read('template.html')
  .replace('/*@@CSS@@*/', () => read('styles.css'))
  .replace('/*@@CORE@@*/', () => read('core.js'))
  .replace('/*@@UI@@*/', () => read('ui.js'));
if (/@@[A-Z]+@@/.test(html)) throw new Error('Unfilled placeholder in template');
const out = `${html}\n`;
const target = path.join(root, 'index.html');
if (process.argv.includes('--check')) {          // used by the tests: is index.html up to date with src/?
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== out) { console.error('index.html is out of date: run node tools/build.js'); process.exit(1); }
  console.log('index.html matches src/');
} else {
  fs.writeFileSync(target, out);
  console.log(`index.html: ${Buffer.byteLength(out)} bytes`);
}
