// A VPK of its own (version 2, the files in the directory file itself, as a mod's pakNN_dir.vpk: the
// language folder's of src/gamevpk.js), in the browser and in node, with the MD5 and CRC32 it needs
// (the browser's crypto has no MD5). files is a Map of path → Uint8Array. The tree, then the data;
// the MD5s of the tree, of the (empty) archive section and of the whole file before them, as the
// game's vpk tool writes them.
export function writeVpk(files) {
  const enc = new TextEncoder(), tree = new Map(), parts = [], blobs = []; let offset = 0;
  for (const [path, data] of files) {
    const p = path.toLowerCase().replace(/\\/g, '/'), slash = p.lastIndexOf('/'), dir = slash < 0 ? ' ' : p.slice(0, slash), base = p.slice(slash + 1), dot = base.lastIndexOf('.');
    const ext = dot < 0 ? ' ' : base.slice(dot + 1), name = dot < 0 ? base : base.slice(0, dot);
    if (!tree.has(ext)) tree.set(ext, new Map()); const dirs = tree.get(ext);
    if (!dirs.has(dir)) dirs.set(dir, []); dirs.get(dir).push([name, data]);
  }
  const z = (s) => parts.push(enc.encode(`${s}\0`));
  for (const [ext, dirs] of tree) {
    z(ext);
    for (const [dir, names] of dirs) {
      z(dir);
      for (const [name, data] of names) {
        z(name); const e = new DataView(new ArrayBuffer(18));
        e.setUint32(0, crc32(data), true); e.setUint16(4, 0, true); e.setUint16(6, 0x7fff, true); e.setUint32(8, offset, true); e.setUint32(12, data.length, true); e.setUint16(16, 0xffff, true);
        parts.push(new Uint8Array(e.buffer)); blobs.push(data); offset += data.length;
      }
      z('');
    }
    z('');
  }
  z('');
  const treeData = concat(parts), header = new DataView(new ArrayBuffer(28));
  [0x55aa1234, 2, treeData.length, offset, 0, 48, 0].forEach((x, i) => header.setUint32(i * 4, x, true));
  const body = concat([new Uint8Array(header.buffer), treeData, ...blobs, md5(treeData), md5(new Uint8Array(0))]);
  return concat([body, md5(body)]);
}
const concat = (list) => { const out = new Uint8Array(list.reduce((n, b) => n + b.length, 0)); let p = 0; for (const b of list) { out.set(b, p); p += b.length; } return out; };

let CRC;
export function crc32(data) {
  CRC ||= Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// MD5 (RFC 1321): the browser's crypto has none.
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], K = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
export function md5(data) {
  const n = data.length, padded = new Uint8Array(((n + 8) >> 6 << 6) + 64); padded.set(data); padded[n] = 0x80;
  const view = new DataView(padded.buffer); view.setUint32(padded.length - 8, (n * 8) >>> 0, true); view.setUint32(padded.length - 4, Math.floor(n / 2 ** 29), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const m = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) m[j] = view.getUint32(off + j * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; } else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; } else { f = c ^ (b | ~d); g = (7 * i) & 15; }
      const x = (a + f + K[i] + m[g]) | 0, s = S[(i >> 4) * 4 + (i & 3)];
      a = d; d = c; c = b; b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const out = new DataView(new ArrayBuffer(16)); [a0, b0, c0, d0].forEach((x, i) => out.setUint32(i * 4, x, true));
  return new Uint8Array(out.buffer);
}
