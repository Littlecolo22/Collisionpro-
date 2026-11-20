import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
const roots = ['src', 'public'];
const skip = new Set(['vendor', 'dist', 'node_modules']);
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory()) { if (!skip.has(e.name)) await walk(join(dir, e.name)); }
    else if (/\.(?:js|mjs)$/.test(e.name)) files.push(join(dir, e.name));
  }
}
for (const root of roots) await walk(root);
let errors = 0;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const refs = [...text.matchAll(/(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+|import\()(['"])(\.[^'"]+)\1/g)];
  for (const m of refs) {
    const target = resolve(dirname(file), m[2]);
    try { if (!(await stat(target)).isFile()) throw new Error('not a file'); }
    catch { errors++; console.error(`MISSING LOCAL MODULE: ${file} -> ${m[2]}`); }
  }
}
console.log(`Local module paths: ${errors ? 'failed' : 'passed'} (${files.length} JavaScript files scanned)`);
if (errors) process.exitCode = 1;
