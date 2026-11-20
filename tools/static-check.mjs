import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'pages', 'pages_cust', 'public', 'ui', 'android/src', 'test', 'tests'];
const skip = new Set(['vendor', 'dist', 'node_modules']);
const files = [];
async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!skip.has(entry.name)) await walk(join(dir, entry.name));
    } else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(join(dir, entry.name));
  }
}
for (const root of roots) await walk(root);
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    process.stderr.write(`FAIL ${file}\n${result.stderr}`);
  }
}
console.log(`JavaScript syntax: ${files.length - failed}/${files.length} files passed`);
if (failed) process.exitCode = 1;
