// Zips build/ as dist/choom-extension-<version>.zip, the file a release attaches and the Web Store
// receives. Deterministic on any machine: entries sorted by path, stored (no compression, so no
// zlib version can change the bytes), and every timestamp fixed at 1980-01-01.
//   npm run build && npm run package
import { crc32 } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = 'build';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (manifest.version !== version) throw new Error(`build/ is version ${manifest.version}, package.json says ${version}: run npm run build`);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(relative(root, path).split(sep).join('/'));
  }
};
walk(root);
files.sort();

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const parts = [];
const central = [];
let offset = 0;
for (const name of files) {
  const data = readFileSync(join(root, name));
  const nameBytes = Buffer.from(name, 'utf8');
  const crc = crc32(data) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);
  parts.push(local, nameBytes, data);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4); // made by
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(0, 10);
  entry.writeUInt16LE(DOS_TIME, 12);
  entry.writeUInt16LE(DOS_DATE, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(nameBytes.length, 28);
  entry.writeUInt32LE(0, 30); // extra, comment lengths
  entry.writeUInt16LE(0, 34); // disk
  entry.writeUInt16LE(0, 36); // internal attributes
  entry.writeUInt32LE(0, 38); // external attributes
  entry.writeUInt32LE(offset, 42);
  central.push(entry, nameBytes);
  offset += local.length + nameBytes.length + data.length;
}
const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync('dist', { recursive: true });
const out = join('dist', `choom-extension-${version}.zip`);
writeFileSync(out, Buffer.concat([...parts, ...central, end]));
console.log(`[package] ${out}: ${files.length} files`);
