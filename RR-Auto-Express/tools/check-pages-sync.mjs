import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'pages', 'dist');

async function filesUnder(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(full, base));
    else if (entry.isFile()) files.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return files.sort();
}

const sourceFiles = await filesUnder(publicDir);
const distFiles = await filesUnder(distDir);
const missing = sourceFiles.filter(file => !distFiles.includes(file));
const mismatched = [];
for (const file of sourceFiles) {
  if (missing.includes(file)) continue;
  const [source, built] = await Promise.all([
    readFile(path.join(publicDir, file)),
    readFile(path.join(distDir, file)),
  ]);
  if (!source.equals(built)) mismatched.push(file);
}
if (missing.length || mismatched.length) {
  console.error('Pages public/dist synchronization check FAILED.');
  if (missing.length) console.error('Missing in pages/dist:', missing.join(', '));
  if (mismatched.length) console.error('Files differ:', mismatched.join(', '));
  console.error('Run `npm run pages:build` to regenerate pages/dist from public/.');
  process.exit(1);
}
console.log(`Pages public/dist sync check passed (${sourceFiles.length} files).`);
