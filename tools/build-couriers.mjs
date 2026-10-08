// Couriers and wards, for the site's courier mode: each into <out>/items/<id>/ as an item whose styles
// are companions (tools/lib/item.mjs; a courier's flying model a style of its own), and the list of
// them into <out>/couriers.json.
//   node tools/build-couriers.mjs [--game <…/dota>] [--cli <Source2Viewer-CLI>] [--out assets] [--jobs 4] [--keep] [--only <id,…>] [--items <id,…>: built again even with --keep]
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCosmetics } from './lib/game.mjs';
import { buildItem } from './lib/item.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }, flag = (name) => args.includes(`--${name}`);
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'assets')), cli = resolve(opt('cli', '.cache/vrf-20.0/Source2Viewer-CLI')), jobs = +opt('jobs', 4);
const only = (opt('only', '') || '').split(',').filter(Boolean).map(Number), redo = new Set((opt('items', '') || '').split(',').filter(Boolean).map(Number));
const { couriers, wards } = loadCosmetics(game), all = [...couriers, ...wards].filter((i) => !only.length || only.includes(i.id));

let next = 0, done = 0; const ok = new Set();
const worker = async () => {
  while (next < all.length) {
    const item = all[next++], dir = join(out, 'items', String(item.id));
    // Kept, it takes where it stands as the game's list has it now.
    if (flag('keep') && !redo.has(item.id) && existsSync(join(dir, 'item.json'))) {
      const m = JSON.parse(readFileSync(join(dir, 'item.json'), 'utf8'));
      m.styles.forEach((st, k) => { const c = item.styles[k]?.companion; if (st.companion && c) Object.assign(st.companion, { offset: c.offset, scale: c.scale }); });
      writeFileSync(join(dir, 'item.json'), JSON.stringify(m)); ok.add(item.id); done++; continue;
    }
    const log = [];
    try { const r = await buildItem({ game, cli, item, heroBones: new Set(), out: dir, temp: resolve('.cache/temp', `item${item.id}`), log: (l) => log.push(l) }); if (r.worn) ok.add(item.id); else rmSync(dir, { recursive: true, force: true }); console.log(`[${++done}/${all.length}] ${item.id} ${item.name.en}: ${r.models} models, ${r.systems} systems`); }
    catch (e) { console.log(`[${++done}/${all.length}] ${item.id} ${item.name.en}: ERROR ${e.message.split('\n')[0]}`); }
    for (const l of log) console.log(`  ${l}`);
  }
};
await Promise.all(Array.from({ length: jobs }, worker));

// The list: the default first, then the newest.
const entry = (i) => { const m = JSON.parse(readFileSync(join(out, 'items', String(i.id), 'item.json'), 'utf8'));
  return { id: i.id, name: i.name, rarity: i.rarity, ...(i.default ? { default: true } : {}), styles: m.styles.map((s) => ({ name: s.name, icon: s.icon })) }; };
const list = (items) => items.filter((i) => ok.has(i.id) || existsSync(join(out, 'items', String(i.id), 'item.json'))).sort((a, b) => b.default - a.default || b.id - a.id).map(entry);
writeFileSync(join(out, 'couriers.json'), JSON.stringify({ version: 1, couriers: list(couriers), wards: list(wards) }));
console.log(`${list(couriers).length} couriers, ${list(wards).length} wards`);
