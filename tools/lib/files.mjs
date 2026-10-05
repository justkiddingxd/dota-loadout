// glTF binary files and PNGs, read and written without dependencies.
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readGlb(file) {
  const b = readFileSync(file), jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength, bin = binStart < b.length ? b.subarray(binStart + 8, binStart + 8 + b.readUInt32LE(binStart)) : Buffer.alloc(0);
  return { json, bin };
}
export function writeGlb(file, json, bin) {
  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(JSON.stringify(json)), 0x20), b = pad(bin, 0);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + j.length + (b.length ? 8 + b.length : 0), 8);
  const chunk = (buffer, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buffer.length, 0); h.writeUInt32LE(type, 4); return [h, buffer]; };
  writeFileSync(file, Buffer.concat([header, ...chunk(j, 0x4e4f534a), ...(b.length ? chunk(b, 0x004e4942) : [])]));
}
// Morph targets (facial flexes) are not used by the page: dropped, and the binary chunk rebuilt with
// only the buffer views still referenced.
export function compact(json, bin) {
  for (const mesh of json.meshes || []) { delete mesh.weights; delete mesh.extras; for (const p of mesh.primitives) delete p.targets; }
  const used = new Set();
  const mark = (i) => { if (i !== undefined) used.add(i); };
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) { Object.values(p.attributes).forEach(mark); mark(p.indices); }
  for (const skin of json.skins || []) mark(skin.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) { mark(s.input); mark(s.output); }
  const accessors = [], accessorMap = new Map(), views = [], viewMap = new Map(), chunks = []; let offset = 0;
  for (const [i, accessor] of (json.accessors || []).entries()) {
    if (!used.has(i)) continue;
    if (accessor.bufferView !== undefined && !viewMap.has(accessor.bufferView)) {
      const view = json.bufferViews[accessor.bufferView], data = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
      const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
      viewMap.set(accessor.bufferView, views.length); views.push({ ...view, buffer: 0, byteOffset: offset }); chunks.push(data); offset += data.length;
    }
    accessorMap.set(i, accessors.length); accessors.push({ ...accessor, bufferView: viewMap.get(accessor.bufferView) });
  }
  const remap = (i) => accessorMap.get(i);
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) { for (const k of Object.keys(p.attributes)) p.attributes[k] = remap(p.attributes[k]); if (p.indices !== undefined) p.indices = remap(p.indices); }
  for (const skin of json.skins || []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remap(skin.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) { s.input = remap(s.input); s.output = remap(s.output); }
  json.accessors = accessors; json.bufferViews = views; const out = Buffer.concat(chunks); json.buffers = [{ byteLength: out.length }];
  return out;
}

// Normal maps come with alpha 0, and canvas decoding premultiplies it away with the colour: they
// are read here straight from the PNG (8-bit RGB/RGBA, not interlaced) and made opaque.
export function readPng(file) {
  const b = readFileSync(file), idat = []; let width = 0, height = 0, type = 0;
  for (let at = 8; at < b.length;) { const length = b.readUInt32BE(at), kind = b.toString('latin1', at + 4, at + 8), data = b.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12]) throw new Error(`${file}: needs an 8-bit PNG without interlacing.`); }
    else if (kind === 'IDAT') idat.push(data); at += 12 + length; }
  const channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[type], raw = inflateSync(Buffer.concat(idat)), stride = width * channels, out = new Uint8ClampedArray(width * height * 4), prev = new Uint8Array(stride), row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0, up = prev[x], c = x >= channels ? prev[x - channels] : 0, v = line[x];
      const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c), paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      row[x] = filter === 1 ? v + a : filter === 2 ? v + up : filter === 3 ? v + ((a + up) >> 1) : filter === 4 ? v + paeth : v;
    }
    for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; out[o] = row[x * channels]; out[o + 1] = row[x * channels + (channels > 2 ? 1 : 0)]; out[o + 2] = row[x * channels + (channels > 2 ? 2 : 0)]; out[o + 3] = 255; }
    prev.set(row);
  }
  const canvas = createCanvas(width, height); canvas.getContext('2d').putImageData(new ImageData(out, width, height), 0, 0); return canvas;
}
