// An outfit for the game itself: a pak01_dir.vpk with the game's items_game.txt in which the hero's
// default items look like what he wears — in the browser (the site's «To the game») and in node
// (tools/build-vpk.mjs). Each default item of a worn slot takes the worn item's model and visuals in
// its style (effects, animations, ability icons, the hero's form) and its static sockets; the
// outfit's unusual effect, kinetic gem and prismatic gem go in as static sockets of its own, as the
// game writes them (CProtoItemSocket_Effect, _AssetModifier, _Color). Only the blocks it needs are
// read: the whole file is 50 MB.
//
//   const { file, done, skipped } = gameVpk(text, { hero: 'shredder', worn: { weapon: [12849, 0] }, unusual: { weapon: 826 } });
import { parseKV } from './kv.js';

const PETS = ['courier', 'ward'];
// The gems the sockets name: an unusual effect, a kinetic gem, a prismatic gem.
const UNUSUAL_GEM = 3045, KINETIC_GEM = 3005, PRISMATIC_GEM = 3001;

// outfit: { hero, worn: { slot: [id, style] }, unusual: { slot: effect }, kinetic: { slot: asset
// modifier }, colors: { slot: '#rrggbb' } } (a Loadout has all but colors: its gems are keys).
// done: [{ slot, item, default, style, unusual, kinetic, color }]; skipped: [{ slot, item, reason }],
// reason 'pet' | 'unknown' | 'other hero' | 'no default'.
export function gameVpk(text, { hero, worn = {}, unusual = {}, kinetic = {}, colors = {} }) {
  const npc = `npc_dota_hero_${hero}`, nl = text.includes('\r\n') ? '\r\n' : '\n';
  const at = text.search(/\n\t"items"\r?\n\t\{/); if (at < 0) throw new Error('items_game.txt: no items');
  const end = text.indexOf('\n\t}', at + 1);
  // An item's block: where it starts (its line) and ends (its closing brace), and what it says.
  const block = (start) => { const stop = text.indexOf('\n\t\t}', start + 1) + 4; return { start: start + 1, stop, id: /^\t\t"(\d+)"/.exec(text.slice(start + 1, start + 20))?.[1], get data() { return Object.values(parseKV(text.slice(start + 1, stop)).data)[0] || {}; } }; };
  const find = (id) => { const i = text.indexOf(`\n\t\t"${id}"${nl}`, at); return i < 0 || i > end ? null : block(i); };
  const section = (name) => { const i = text.search(new RegExp(`\\n\\t"${name}"\\r?\\n\\t\\{`)); return i < 0 ? {} : Object.values(parseKV(text.slice(i + 1, text.indexOf('\n\t}', i + 1) + 3)).data)[0] || {}; };
  const prefabs = section('prefabs'), slotOf = (item) => item.item_slot || prefabs[item.prefab]?.item_slot || null;

  // The hero's default items by slot: the items whose lines name him, those that are defaults.
  const defaults = new Map(), seen = new Set();
  for (let i = text.indexOf(`"${npc}"`, at); i > 0 && i < end; i = text.indexOf(`"${npc}"`, i + 1)) {
    const start = text.lastIndexOf('\n\t\t"', i); if (seen.has(start)) continue; seen.add(start);
    const b = block(start), item = b.data;
    if (item.prefab === 'default_item' && item.used_by_heroes?.[npc] && !defaults.has(slotOf(item))) defaults.set(slotOf(item), { ...b, item });
  }

  const done = [], skipped = [], edits = [];
  for (const [slot, [id, style = 0]] of Object.entries(worn)) {
    const skip = (reason) => skipped.push({ slot, item: +id, reason });
    if (PETS.includes(slot)) { skip('pet'); continue; }
    const b = find(id), item = b?.data; if (!item) { skip('unknown'); continue; }
    if (!item.used_by_heroes?.[npc]) { skip('other hero'); continue; }
    if (item.prefab === 'default_item') continue;
    const target = defaults.get(slotOf(item)); if (!target) { skip('no default'); continue; }
    if (edits.some((e) => e.start === target.start)) { skip('no default'); continue; }
    // The worn item in its style: the style's model and skin, the modifiers of that style.
    const visuals = item.visuals || {}, keys = visuals.styles ? Object.keys(visuals.styles).sort((a, b) => a - b) : [], key = keys[style] ?? '0', st = visuals.styles?.[key] || {};
    const v = {}; let n = 0;
    for (const [k, m] of Object.entries(visuals)) {
      if (k === 'styles' || k === 'alternate_icons') continue;
      if (!/^asset_modifier/.test(k)) { v[k] = m; continue; }
      if (!m || typeof m !== 'object' || (m.style !== undefined && m.style !== key)) continue;
      const { style: _, ...own } = m; v[`asset_modifier${n++}`] = own;
    }
    if (st.skin !== undefined) v.skin = st.skin;
    // Its static attributes (sockets it comes with: a kinetic gem of its own), then the outfit's.
    const attrs = { ...(item.static_attributes || {}) }, sockets = [];
    const u = unusual[slot], k = kinetic[slot], c = /^#?([0-9a-f]{6})$/i.exec(colors[slot] || '')?.[1];
    if (u != null) sockets.push(`socket { required_type: 1 gem_def_index: ${UNUSUAL_GEM} } effect: ${+u}`);
    if (k != null) sockets.push(`socket { required_hero: '${npc}' gem_def_index: ${KINETIC_GEM} } asset_modifier: ${+k}`);
    if (c) { const rgb = parseInt(c, 16); sockets.push(`socket { required_type: 2 gem_def_index: ${PRISMATIC_GEM} } red: ${rgb >> 16} green: ${(rgb >> 8) & 255} blue: ${rgb & 255}`); }
    for (const value of sockets) { let s = 1; while (attrs[`static socket ${s}`]) s++; attrs[`static socket ${s}`] = { attribute_class: 'socket', value }; }
    const { model_player: _m, visuals: _v, static_attributes: _s, ...own } = target.item, model = st.model_player || item.model_player;
    const data = { ...own, ...(model ? { model_player: model } : {}), ...(Object.keys(attrs).length ? { static_attributes: attrs } : {}), visuals: v };
    edits.push({ start: target.start, stop: target.stop, text: kv(target.id, data, 2, nl).slice(0, -nl.length) });
    done.push({ slot, item: +id, default: +target.id, style, ...(u != null ? { unusual: +u } : {}), ...(k != null ? { kinetic: +k } : {}), ...(c ? { color: `#${c.toLowerCase()}` } : {}) });
  }
  // The edits from the end back, the text between them as it was.
  const parts = []; let last = text.length;
  for (const e of edits.sort((a, b) => b.start - a.start)) { parts.push(text.slice(e.stop, last), e.text); last = e.start; }
  parts.push(text.slice(0, last));
  const file = done.length ? writeVpk(new Map([['scripts/items/items_game.txt', new TextEncoder().encode(parts.reverse().join(''))]])) : null;
  return { file, done, skipped };
}

// KeyValues text as items_game.txt has it: tabs, quoted, a repeated asset modifier's #n gone.
const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
function kv(key, value, depth, nl) {
  const t = '\t'.repeat(depth), k = q(String(key).replace(/#\d+$/, ''));
  if (value && typeof value === 'object') return `${t}${k}${nl}${t}{${nl}${Object.entries(value).map(([a, b]) => kv(a, b, depth + 1, nl)).join('')}${t}}${nl}`;
  return `${t}${k}\t\t${q(value)}${nl}`;
}

// A VPK of its own (version 2, the files in the directory file itself, as a mod's pak01_dir.vpk):
// files is a Map of path → Uint8Array. The tree, then the data; the MD5s of the tree, of the (empty)
// archive section and of the whole file before them, as the game's vpk tool writes them.
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
