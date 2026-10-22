// Binary KeyValues3 (the blocks of compiled resources: a model's sequences, its keyvalues), versions 1
// to 5 read, 4 and 5 written back as they were (older ones as 5): every value keeps its type (an int8, a typed array, a
// flagged string), so an untouched document writes the same bytes. Values read as { type, value }
// nodes (objects: [[name, node], …], arrays: [node, …]); a change to one is a change to its value.
// After ValveResourceFormat's BinaryKV3 (the game's own reader is the judge of what is valid).
//
//   const doc = readKV3(bytes); find(doc.root, 'm_modelInfo') …; const out = writeKV3(doc);
export const T = { NULL: 1, BOOLEAN: 2, INT64: 3, UINT64: 4, DOUBLE: 5, STRING: 6, BLOB: 7, ARRAY: 8, OBJECT: 9, ARRAY_TYPED: 10, INT32: 11, UINT32: 12,
  TRUE: 13, FALSE: 14, INT64_ZERO: 15, INT64_ONE: 16, DOUBLE_ZERO: 17, DOUBLE_ONE: 18, FLOAT: 19, INT16: 20, UINT16: 21, INT8: 22, UINT8: 23,
  ARRAY_BYTE_LENGTH: 24, ARRAY_AUX: 25, UINT32_ZERO: 26, UINT32_ONE: 27 };
const CONST = { [T.NULL]: null, [T.TRUE]: true, [T.FALSE]: false, [T.INT64_ZERO]: 0n, [T.INT64_ONE]: 1n, [T.DOUBLE_ZERO]: 0, [T.DOUBLE_ONE]: 1, [T.UINT32_ZERO]: 0, [T.UINT32_ONE]: 1 };
// Primitive types: their lane (bytes) and how to read and write one.
const LANES = {
  [T.BOOLEAN]: [1, (v, o) => v.getUint8(o) !== 0, (v, o, x) => v.setUint8(o, x ? 1 : 0)],
  [T.INT8]: [1, (v, o) => v.getInt8(o), (v, o, x) => v.setInt8(o, x)], [T.UINT8]: [1, (v, o) => v.getUint8(o), (v, o, x) => v.setUint8(o, x)],
  [T.INT16]: [2, (v, o) => v.getInt16(o, true), (v, o, x) => v.setInt16(o, x, true)], [T.UINT16]: [2, (v, o) => v.getUint16(o, true), (v, o, x) => v.setUint16(o, x, true)],
  [T.INT32]: [4, (v, o) => v.getInt32(o, true), (v, o, x) => v.setInt32(o, x, true)], [T.UINT32]: [4, (v, o) => v.getUint32(o, true), (v, o, x) => v.setUint32(o, x, true)],
  [T.FLOAT]: [4, (v, o) => v.getFloat32(o, true), (v, o, x) => v.setFloat32(o, x, true)],
  [T.INT64]: [8, (v, o) => v.getBigInt64(o, true), (v, o, x) => v.setBigInt64(o, x, true)], [T.UINT64]: [8, (v, o) => v.getBigUint64(o, true), (v, o, x) => v.setBigUint64(o, x, true)],
  [T.DOUBLE]: [8, (v, o) => v.getFloat64(o, true), (v, o, x) => v.setFloat64(o, x, true)],
};
const TRAILER = 0xffeedd00;
const align = (n, a) => (n + a - 1) & -a;

// LZ4 blocks: the buffers the game compresses, and the frames of its binary blobs, chained (a frame
// may copy from the blobs before it): decoded into one running output.
function lz4Into(src, out, o) {
  let i = 0;
  while (i < src.length) {
    const token = src[i++]; let len = token >> 4;
    if (len === 15) for (let b = 255; b === 255;) { b = src[i++]; len += b; }
    out.set(src.subarray(i, i + len), o); i += len; o += len;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2; let m = token & 15;
    if (m === 15) for (let b = 255; b === 255;) { b = src[i++]; m += b; }
    m += 4; for (let k = 0; k < m; k++, o++) out[o] = out[o - off];
  }
  return o;
}
function lz4Decode(src, size) { const out = new Uint8Array(size), o = lz4Into(src, out, 0); if (o !== size) throw new Error(`LZ4: ${o} bytes, not ${size}`); return out; }
// A greedy LZ4 block (a hash of four bytes, the last five bytes literals), each one on its own.
export function lz4Encode(src) {
  const n = src.length, out = new Uint8Array(n + Math.ceil(n / 255) + 16), table = new Int32Array(1 << 16).fill(-1);
  const r32 = (p) => src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24), hash = (x) => Math.imul(x, 2654435761) >>> 16;
  let o = 0, anchor = 0, i = 0;
  const length = (x) => { while (x >= 255) { out[o++] = 255; x -= 255; } out[o++] = x; };
  const emit = (lit, off, match) => {
    const l = lit.length; out[o++] = (Math.min(l, 15) << 4) | (match ? Math.min(match - 4, 15) : 0);
    if (l >= 15) length(l - 15); out.set(lit, o); o += l;
    if (match) { out[o++] = off & 255; out[o++] = off >> 8; if (match - 4 >= 15) length(match - 19); }
  };
  while (i < n - 12) {
    const x = r32(i), h = hash(x), ref = table[h]; table[h] = i;
    if (ref >= 0 && i - ref < 65536 && r32(ref) === x) {
      let len = 4; while (i + len < n - 5 && src[ref + len] === src[i + len]) len++;
      emit(src.subarray(anchor, i), i - ref, len); i += len; anchor = i;
    } else i++;
  }
  emit(src.subarray(anchor, n), 0, 0);
  return out.slice(0, o);
}

// options.zstd(data, size): a zstd decoder (the game's animation blocks use it; node's zlib has one).
export function readKV3(bytes, options = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = dv.getUint32(0, true), version = magic & 255;
  if ((magic & 0xffffff00) !== 0x4b563300 || version < 1 || version > 5) throw new Error(`KV3: version ${version} of ${magic.toString(16)} not read`);
  let p = 4; const u32 = () => { const x = dv.getUint32(p, true); p += 4; return x; }, u16 = () => { const x = dv.getUint16(p, true); p += 2; return x; };
  const format = b.slice(p, p + 16); p += 16;
  // The header grew with the versions: 1 had no compression details, 4 added 2-byte values, 5 a second buffer.
  const compression = u32(), dictionary = version >= 2 ? u16() : 0, frameSize = version >= 2 ? u16() : 0;
  const h = version === 1 ? { bytes1: u32(), bytes4: u32(), bytes8: u32(), total: u32(), blobs: 0, blobBytes: 0, bytes2: 0 }
    : { bytes1: u32(), bytes4: u32(), bytes8: u32(), types: u32(), objects: u16(), arrays: u16(), total: u32(), compressed: u32(), blobs: u32(), blobBytes: u32(), ...(version >= 4 ? { bytes2: u32(), blockSizes: u32() } : { bytes2: 0 }) };
  if (version === 1) h.compressed = b.length - p;
  if (version >= 5) Object.assign(h, { size1: u32(), csize1: u32(), size2: u32(), csize2: u32(), b1_2: u32(), b2_2: u32(), b4_2: u32(), b8_2: u32(), nodes: u32(), objects2: u32(), arrays2: u32(), elements: u32() });
  if (dictionary || compression > 2) throw new Error(`KV3: compression ${compression} not read`);
  const zstd = (data, size) => { if (!options.zstd) throw new Error('KV3: zstd data needs options.zstd'); const out = new Uint8Array(options.zstd(data, size)); if (out.length !== size) throw new Error('KV3: zstd size'); return out; };
  // Before version 5 a zstd buffer and the blobs are one frame (the blobs after the buffer).
  const v4zstd = version < 5 && compression === 2;
  const take = (size, csize) => {
    const full = v4zstd ? size + h.blobBytes : size;
    const raw = compression === 1 ? lz4Decode(b.subarray(p, p + csize), size) : compression === 2 ? zstd(b.subarray(p, p + csize), full) : b.slice(p, p + size);
    p += compression ? csize : size; return raw;
  };
  // Lanes: each a view and a position.
  const lane = (buf, at, count, size) => ({ v: new DataView(buf.buffer, buf.byteOffset + at, count * size), p: 0 });
  const ctx = { strings: [], types: null, t: 0, lengths: null };
  let main, aux;
  if (version <= 4) {
    const buf = take(h.total, h.compressed); let o = 0;
    const L = {}; L[1] = lane(buf, o, h.bytes1, 1); o += h.bytes1;
    if (h.bytes2) o = align(o, 2); L[2] = lane(buf, o, h.bytes2, 2); o += h.bytes2 * 2;
    if (h.bytes4) o = align(o, 4); L[4] = lane(buf, o, h.bytes4, 4); o += h.bytes4 * 4;
    o = align(o, 8); L[8] = lane(buf, o, h.bytes8, 8); o += h.bytes8 * 8;
    const nStrings = L[4].v.getInt32(0, true); L[4].p = 4;
    const start = o, dec = new TextDecoder();
    for (let i = 0; i < nStrings; i++) { const z = buf.indexOf(0, o); ctx.strings.push(dec.decode(buf.subarray(o, z))); o = z + 1; }
    const typesEnd = version === 1 ? h.total - 4 : start + h.types;
    ctx.types = buf.subarray(o, typesEnd); o = typesEnd;
    ctx.tail = { buf, at: o, blobsAt: h.total };
    main = aux = L;
  } else {
    const buf1 = take(h.size1, h.csize1), buf2 = take(h.size2, h.csize2); let o = 0;
    aux = {}; aux[1] = lane(buf1, 0, h.bytes1, 1); o = h.bytes1;
    if (h.bytes2) o = align(o, 2); aux[2] = lane(buf1, o, h.bytes2, 2); o += h.bytes2 * 2;
    if (h.bytes4) o = align(o, 4); aux[4] = lane(buf1, o, h.bytes4, 4); o += h.bytes4 * 4;
    if (h.bytes8) o = align(o, 8); aux[8] = lane(buf1, o, h.bytes8, 8);
    const nStrings = aux[4].v.getInt32(0, true); aux[4].p = 4; const dec = new TextDecoder();
    for (let i = 0, s = 0; i < nStrings; i++) { const z = buf1.indexOf(0, s); ctx.strings.push(dec.decode(buf1.subarray(s, z))); s = z + 1; aux[1].p = s; }
    let q = h.objects2 * 4; ctx.lengths = lane(buf2, 0, h.objects2, 4);
    main = {}; main[1] = lane(buf2, q, h.b1_2, 1); q += h.b1_2;
    if (h.b2_2) q = align(q, 2); main[2] = lane(buf2, q, h.b2_2, 2); q += h.b2_2 * 2;
    if (h.b4_2) q = align(q, 4); main[4] = lane(buf2, q, h.b4_2, 4); q += h.b4_2 * 4;
    if (h.b8_2) q = align(q, 8); main[8] = lane(buf2, q, h.b8_2, 8); q += h.b8_2 * 8;
    ctx.types = buf2.subarray(q, q + h.types);
    ctx.tail = { buf: buf2, at: q + h.types };
  }
  // After the types: the trailer, or the blobs' lengths, the trailer and (LZ4) their frames' sizes;
  // the blobs follow the buffers, then a trailer.
  const tv = new DataView(ctx.tail.buf.buffer, ctx.tail.buf.byteOffset), blobs = [];
  if (!h.blobs) { if (tv.getUint32(ctx.tail.at, true) !== TRAILER) throw new Error('KV3: no trailer'); }
  else {
    let at = ctx.tail.at; const lengths = []; for (let i = 0; i < h.blobs; i++, at += 4) lengths.push(tv.getInt32(at, true));
    if (tv.getUint32(at, true) !== TRAILER) throw new Error('KV3: no blob trailer'); at += 4;
    const all = new Uint8Array(h.blobBytes);
    if (compression === 0) { all.set(b.subarray(p, p + h.blobBytes)); p += h.blobBytes; }
    else if (compression === 1) { let o = 0; while (o < h.blobBytes) { const c = tv.getUint16(at, true); at += 2; o = lz4Into(b.subarray(p, p + c), all, o); p += c; } }
    else if (version >= 5) { const c = h.compressed - h.csize1 - h.csize2; all.set(zstd(b.subarray(p, p + c), h.blobBytes)); p += c; }
    else all.set(ctx.tail.buf.subarray(ctx.tail.blobsAt, ctx.tail.blobsAt + h.blobBytes));
    if (dv.getUint32(p, true) !== TRAILER) throw new Error('KV3: no end trailer');
    let o = 0; for (const n of lengths) { blobs.push(all.slice(o, o + n)); o += n; }
  }
  ctx.blobs = blobs; ctx.blob = 0;
  const get = (L, size, read) => { const x = read(L[size].v, L[size].p); L[size].p += size; return x; };
  const int = (L) => get(L, 4, (v, o) => v.getInt32(o, true));
  // Before version 3 a flag was a bit field (the lowest bit set wins, as ValveResourceFormat reads it).
  const legacy = (f) => (f & 1 ? 1 : f & 2 ? 2 : f & 8 ? 3 : f & 16 ? 4 : f & 32 ? 5 : undefined);
  const type = () => {
    const t = { type: ctx.types[ctx.t++] };
    if (version < 3) { if (t.type & 0x80) { const f = legacy(ctx.types[ctx.t++]); if (f !== undefined) t.flag = f; } t.type &= 0x7f; return t; }
    if (t.type & 0x80) t.flag = ctx.types[ctx.t++]; if (t.type & 0x40) t.extra = ctx.types[ctx.t++]; t.type &= 0x3f; return t;
  };
  const str = (id) => (id >= 0 && id < ctx.strings.length ? ctx.strings[id] : { empty: id });
  const value = (t, L) => {
    if (t.type in CONST) return { ...t, value: CONST[t.type] };
    if (LANES[t.type]) { const [size, read] = LANES[t.type]; return { ...t, value: get(L, size, read) }; }
    switch (t.type) {
      case T.STRING: return { ...t, value: str(int(main)) };
      case T.BLOB: if (version < 2) { const n = int(main), at = main[1].p; main[1].p += n; return { ...t, value: new Uint8Array(main[1].v.buffer, main[1].v.byteOffset + at, n).slice() }; }
        return { ...t, value: ctx.blobs[ctx.blob++] };
      case T.ARRAY: { const n = int(main), out = []; for (let i = 0; i < n; i++) out.push(value(type(), main)); return { ...t, value: out }; }
      case T.ARRAY_TYPED: case T.ARRAY_BYTE_LENGTH: case T.ARRAY_AUX: {
        const n = t.type === T.ARRAY_TYPED ? int(main) : get(main, 1, (v, o) => v.getUint8(o)), sub = type(), from = t.type === T.ARRAY_AUX ? aux : main, out = [];
        for (let i = 0; i < n; i++) out.push(value({ ...sub }, from));
        return { ...t, sub, value: out };
      }
      case T.OBJECT: { const n = version >= 5 ? int({ 4: ctx.lengths }) : int(main), out = []; for (let i = 0; i < n; i++) { const name = str(int(main)); out.push([name, value(type(), main)]); } return { ...t, value: out }; }
      default: throw new Error(`KV3: type ${t.type}`);
    }
  };
  if (version >= 5) ctx.lengths = { v: ctx.lengths.v, p: 0 };
  const root = value(type(), main);
  return { version, format, compression, frameSize, root };
}

// Written as LZ4 when it was compressed (zstd too: the browser has no zstd writer), uncompressed if not.
export function writeKV3({ version: read, format, compression: was, root }) {
  // Versions before 4 are written as 5 (as ValveResourceFormat does); their flags were read as 5's.
  const version = read >= 4 ? read : 5;
  const compression = was ? 1 : 0, frameSize = compression ? 16384 : 0, blobs = [];
  // Lanes as growing byte lists; the main ones, the auxiliary ones (v5: buffer 1), types, object lengths.
  const mk = () => ({ 1: [], 2: [], 4: [], 8: [] }), main = mk(), aux = version >= 5 ? mk() : main, types = [], lengths = [];
  const strings = new Map(), enc = new TextEncoder();
  const sid = (s) => { if (typeof s === 'object' && s) return s.empty; if (!strings.has(s)) strings.set(s, strings.size); return strings.get(s); };
  const put = (L, size, write, x) => { const a = new Uint8Array(size); write(new DataView(a.buffer), 0, x); L[size].push(a); };
  const int = (L, x) => put(L, 4, (v, o, y) => v.setInt32(o, y, true), x);
  const count = { nodes: 0, objects: 0, arrays: 0, elements: 0 };
  // A string table first: names and values in the order they are met (the counts need it before the lanes).
  aux[4].push(new Uint8Array(4));
  const type = (t) => { types.push(t.type | (t.flag !== undefined ? 0x80 : 0) | (t.extra !== undefined ? 0x40 : 0)); if (t.flag !== undefined) types.push(t.flag); if (t.extra !== undefined) types.push(t.extra); };
  const value = (n, L, typed) => {
    count.nodes++;
    if (!typed) type(n);
    if (n.type in CONST) return;
    if (LANES[n.type]) { const [size, , write] = LANES[n.type]; return put(L, size, write, n.value); }
    switch (n.type) {
      case T.STRING: return int(main, sid(n.value));
      case T.BLOB: blobs.push(n.value); return;
      case T.ARRAY: count.arrays++; count.elements += Math.max(n.value.length, 1); int(main, n.value.length); for (const x of n.value) value(x, main); return;
      case T.ARRAY_TYPED: case T.ARRAY_BYTE_LENGTH: case T.ARRAY_AUX: {
        count.arrays++; count.elements += Math.max(n.value.length, 1);
        if (n.type === T.ARRAY_TYPED) int(main, n.value.length); else put(main, 1, (v, o, y) => v.setUint8(o, y), n.value.length);
        type(n.sub); for (const x of n.value) value(x, n.type === T.ARRAY_AUX ? aux : main, true); return;
      }
      case T.OBJECT: count.objects++; if (version >= 5) lengths.push(n.value.length); else int(main, n.value.length);
        for (const [name, x] of n.value) { int(main, sid(name)); value(x, main); } return;
      default: throw new Error(`KV3: type ${n.type}`);
    }
  };
  value(root, main);
  new DataView(aux[4][0].buffer).setInt32(0, strings.size, true);
  const cat = (parts) => { const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of parts) { out.set(x, o); o += x.length; } return out; };
  const pad = (parts, len, a) => { const n = align(len, a) - len; if (n) parts.push(new Uint8Array(n)); return len + n; };
  const lanes = (L, parts, len, skipEmptyAlign8) => {
    for (const s of [1, 2, 4, 8]) { const bytes = cat(L[s]); if (!bytes.length && !(s === 8 && skipEmptyAlign8 === false)) continue; len = pad(parts, len, s); parts.push(bytes); len += bytes.length; }
    return len;
  };
  const strBytes = cat([...strings.keys()].flatMap((s) => [enc.encode(s), new Uint8Array(1)]));
  const trailer = new Uint8Array([0x00, 0xdd, 0xee, 0xff]), n = (L, s) => L[s].length;
  const head = [], H = (x, bytes = 4) => { const a = new Uint8Array(bytes), v = new DataView(a.buffer); if (bytes === 4) v.setUint32(0, x, true); else v.setUint16(0, x, true); head.push(a); };
  const pack = (raw) => (compression ? lz4Encode(raw) : raw);
  // The blobs: their lengths (and trailer) in the buffer, then LZ4 frames of up to 16 KB, each on its own.
  const blobLens = new Uint8Array(blobs.length * 4); blobs.forEach((x, i) => new DataView(blobLens.buffer).setInt32(i * 4, x.length, true));
  const frames = [], frameSizes = [];
  if (blobs.length) for (const x of blobs) for (let o = 0; o < x.length; o += 16384) { const f = compression ? lz4Encode(x.subarray(o, o + 16384)) : x.subarray(o, o + 16384); frames.push(f); frameSizes.push(f.length); }
  const sizes = new Uint8Array(compression ? frameSizes.length * 2 : 0); if (compression) frameSizes.forEach((x, i) => new DataView(sizes.buffer).setUint16(i * 2, x, true));
  const blobBytes = blobs.reduce((t, x) => t + x.length, 0), blobTail = blobs.length ? [...frames, trailer] : [];
  let body;
  if (version === 4) {
    const parts = []; lanes(main, parts, 0, false);
    parts.push(strBytes, new Uint8Array(types)); if (blobs.length) parts.push(blobLens); parts.push(trailer, sizes);
    const raw = cat(parts), packed = pack(raw);
    H(0x4b563304); head.push(format); H(compression); H(0, 2); H(frameSize, 2);
    H(n(main, 1)); H(n(main, 4)); H(n(main, 8)); H(strBytes.length + types.length); H(Math.min(count.objects, 65535), 2); H(Math.min(count.arrays, 65535), 2);
    H(raw.length); H(packed.length); H(blobs.length); H(blobBytes); H(n(main, 2)); H(0);
    body = [packed, ...blobTail];
  } else {
    const p1 = [strBytes]; let l1 = strBytes.length;
    for (const s of [1, 2, 4, 8]) { const bytes = cat(aux[s]); if (!bytes.length) continue; l1 = pad(p1, l1, s); p1.push(bytes); l1 += bytes.length; }
    const raw1 = cat(p1);
    const objLens = new Uint8Array(lengths.length * 4); lengths.forEach((x, i) => new DataView(objLens.buffer).setInt32(i * 4, x, true));
    const p2 = [objLens]; lanes(main, p2, objLens.length, true); p2.push(new Uint8Array(types), blobLens, trailer, sizes);
    const raw2 = cat(p2), c1 = pack(raw1), c2 = pack(raw2), packed = compression === 1;
    H(0x4b563305); head.push(format); H(compression); H(0, 2); H(frameSize, 2);
    H(strBytes.length + aux[1].length); H(n(aux, 4)); H(n(aux, 8)); H(types.length); H(Math.min(lengths.length, 65535), 2); H(Math.min(count.arrays, 65535), 2);
    H(raw1.length + raw2.length); H(packed ? c1.length + c2.length : 0); H(blobs.length); H(blobBytes); H(n(aux, 2)); H(sizes.length);
    H(raw1.length); H(packed ? c1.length : 0); H(raw2.length); H(packed ? c2.length : 0);
    H(n(main, 1)); H(n(main, 2)); H(n(main, 4)); H(n(main, 8)); H(count.nodes); H(lengths.length); H(count.arrays); H(count.elements);
    body = [c1, c2, ...blobTail];
  }
  return cat([...head, ...body]);
}

// An object's member by name (null if none), and the nodes of a path.
export const member = (node, name) => node?.value?.find?.(([k]) => k === name)?.[1] ?? null;
export const path = (node, ...names) => names.reduce((n, k) => member(n, k), node);
