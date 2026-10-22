// The game's packed files (pak01_dir.vpk and its numbered archives), as tools/extract-dota.ps1
// reads them on Windows: the directory lists every file with its archive, offset and length.
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';

export class Vpk {
  constructor(dirFile) {
    this.dir = dirFile; this.files = new Map(); this.handles = new Map();
    const b = readFileSync(dirFile), version = b.readUInt32LE(4), tree = b.readUInt32LE(8);
    let p = version === 2 ? 28 : 12;
    this.embeddedBase = p + tree;
    const str = () => { const s = p; while (b[p] !== 0) p++; return b.toString('utf8', s, p++); };
    for (;;) {
      const ext = str(); if (!ext) break;
      for (;;) {
        const path = str(); if (!path) break;
        for (;;) {
          const name = str(); if (!name) break;
          const pre = b.readUInt16LE(p + 4), archive = b.readUInt16LE(p + 6), offset = b.readUInt32LE(p + 8), length = b.readUInt32LE(p + 12);
          p += 18;
          const preload = pre ? b.subarray(p, p + pre) : null; p += pre;
          const full = (path === ' ' ? '' : `${path}/`) + name + (ext === ' ' ? '' : `.${ext}`);
          this.files.set(full.toLowerCase(), { archive, offset, length, preload });
        }
      }
    }
  }
  archiveFile(index) { return index === 0x7fff ? this.dir : this.dir.replace(/_dir\.vpk$/, `_${String(index).padStart(3, '0')}.vpk`); }
  // The archives a file needs (none for one wholly in the directory).
  archiveOf(path) { const e = this.files.get(path.toLowerCase()); return !e || !e.length || e.archive === 0x7fff ? null : e.archive; }
  has(path) { return this.files.has(path.toLowerCase()); }
  read(path) {
    const e = this.files.get(path.toLowerCase()); if (!e) return null;
    const pre = e.preload ? e.preload.length : 0, out = Buffer.alloc(pre + e.length);
    if (pre) e.preload.copy(out, 0);
    if (e.length) {
      const file = this.archiveFile(e.archive); if (!existsSync(file)) return null;
      let fd = this.handles.get(file); if (fd === undefined) { fd = openSync(file, 'r'); this.handles.set(file, fd); }
      const offset = e.offset + (e.archive === 0x7fff ? this.embeddedBase : 0);
      let read = 0; while (read < e.length) { const n = readSync(fd, out, pre + read, e.length - read, offset + read); if (n <= 0) throw new Error(`Short read: ${path}`); read += n; }
    }
    return out;
  }
  close() { for (const fd of this.handles.values()) closeSync(fd); this.handles.clear(); }
}

// External references of a compiled resource (its RERL block).
export function references(b) {
  const refs = [];
  try {
    let at = 8 + b.readUInt32LE(8); const count = b.readUInt32LE(12);
    for (let i = 0; i < count; i++, at += 12) {
      if (b.toString('ascii', at, at + 4) !== 'RERL') continue;
      const data = at + 4 + b.readUInt32LE(at + 4), entries = data + b.readUInt32LE(data), n = b.readUInt32LE(data + 4);
      for (let k = 0; k < n; k++) {
        const e = entries + 16 * k, s = e + 8 + b.readUInt32LE(e + 8); let z = s;
        while (z < b.length && b[z] !== 0) z++;
        refs.push(b.toString('utf8', s, z));
      }
    }
  } catch { /* not a resource with references */ }
  return refs;
}
