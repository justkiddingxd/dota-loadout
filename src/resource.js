// Source 2's compiled resources (_c files): a header and blocks (DATA, RERL, ASEQ…), read apart and
// written back with some of them changed, each block at a 16-byte boundary as the game's compiler
// puts them. RERL (the resources a file refers to) is its own format: read and written here too.
export function readResource(bytes) {
  // A plain view (a node Buffer's slice would not copy).
  const b = bytes instanceof Uint8Array ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const size = dv.getUint32(0, true), header = dv.getUint16(4, true), version = dv.getUint16(6, true), offset = dv.getUint32(8, true), count = dv.getUint32(12, true);
  if (header !== 12) throw new Error(`resource: header version ${header}`);
  if (size !== b.length) throw new Error(`resource: ${b.length} bytes, its header says ${size}`);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const at = 8 + offset + i * 12, type = String.fromCharCode(...b.subarray(at, at + 4)), from = at + 4 + dv.getUint32(at + 4, true), len = dv.getUint32(at + 8, true);
    blocks.push({ type, data: b.slice(from, from + len) });
  }
  return { version, blocks };
}

export function writeResource({ version, blocks }) {
  let at = 16 + blocks.length * 12; const places = [];
  for (const block of blocks) { at = (at + 15) & -16; places.push(at); at += block.data.length; }
  const out = new Uint8Array(at), dv = new DataView(out.buffer);
  dv.setUint32(0, at, true); dv.setUint16(4, 12, true); dv.setUint16(6, version, true); dv.setUint32(8, 8, true); dv.setUint32(12, blocks.length, true);
  blocks.forEach((block, i) => {
    const e = 16 + i * 12; for (let k = 0; k < 4; k++) out[e + k] = block.type.charCodeAt(k);
    dv.setUint32(e + 4, places[i] - (e + 4), true); dv.setUint32(e + 8, block.data.length, true); out.set(block.data, places[i]);
  });
  return out;
}

// RERL: [{ id (a 64-bit hash, as a BigInt), name }]. Entries of 16 bytes (the id, then the name's
// offset from its own field), the names after them.
export function readRERL(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength), at = dv.getUint32(0, true), count = dv.getUint32(4, true), dec = new TextDecoder(), out = [];
  for (let i = 0; i < count; i++) {
    const e = at + i * 16, s = e + 8 + dv.getUint32(e + 8, true); let z = s; while (data[z]) z++;
    out.push({ id: dv.getBigUint64(e, true), name: dec.decode(data.subarray(s, z)) });
  }
  return out;
}
export function writeRERL(list) {
  const enc = new TextEncoder(), names = list.map((r) => enc.encode(`${r.name}\0`)), start = 8, table = list.length * 16;
  const out = new Uint8Array(start + table + names.reduce((n, x) => n + x.length, 0)), dv = new DataView(out.buffer);
  dv.setUint32(0, start, true); dv.setUint32(4, list.length, true);
  let s = start + table;
  list.forEach((r, i) => { const e = start + i * 16; dv.setBigUint64(e, r.id, true); dv.setUint32(e + 8, s - (e + 8), true); dv.setUint32(e + 12, 0, true); out.set(names[i], s); s += names[i].length; });
  return out;
}

// The id the game gives a resource's name (RERL): MurmurHash64B of it, seed 0xEDABCDEF.
export function resourceId(name) {
  const data = new TextEncoder().encode(name.toLowerCase()), dv = new DataView(data.buffer), m = 0x5bd1e995, mul = (a, b) => Math.imul(a, b) >>> 0;
  let h1 = (0xedabcdef ^ data.length) >>> 0, h2 = 0, i = 0, len = data.length;
  const mix = (k) => { k = mul(k, m); k ^= k >>> 24; return mul(k, m); };
  while (len >= 8) { h1 = (mul(h1, m) ^ mix(dv.getUint32(i, true))) >>> 0; h2 = (mul(h2, m) ^ mix(dv.getUint32(i + 4, true))) >>> 0; i += 8; len -= 8; }
  if (len >= 4) { h1 = (mul(h1, m) ^ mix(dv.getUint32(i, true))) >>> 0; i += 4; len -= 4; }
  if (len) { if (len >= 3) h2 ^= data[i + 2] << 16; if (len >= 2) h2 ^= data[i + 1] << 8; h2 ^= data[i]; h2 = mul(h2 >>> 0, m); }
  h1 ^= h2 >>> 18; h1 = mul(h1, m); h2 ^= h1 >>> 22; h2 = mul(h2, m); h1 ^= h2 >>> 17; h1 = mul(h1, m); h2 ^= h1 >>> 19; h2 = mul(h2, m);
  return (BigInt(h1 >>> 0) << 32n) | BigInt(h2 >>> 0);
}
