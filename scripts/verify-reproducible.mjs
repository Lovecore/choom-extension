// The same commit must give the same bytes: build and package twice, and compare every file and
// the zip. Anyone can then check a release's zip against a build of its tag.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const hashes = (dir, out = {}) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) hashes(path, out);
    else out[path] = sha(path);
  }
  return out;
};
const once = () => {
  execSync('node build.mjs && node scripts/package.mjs', { stdio: 'ignore' });
  return { files: hashes('build'), zip: sha(join('dist', `choom-extension-${version}.zip`)) };
};
const a = once();
const b = once();
const differ = Object.keys({ ...a.files, ...b.files }).filter((f) => a.files[f] !== b.files[f]);
if (differ.length || a.zip !== b.zip) {
  console.error(`[verify-reproducible] two builds differ: ${differ.join(', ') || 'the zip'}`);
  process.exit(1);
}
console.log(`[verify-reproducible] two builds agree byte for byte; choom-extension-${version}.zip sha256 ${a.zip}`);
