// An outfit of the site for the game itself: a pak01_dir.vpk with the game's items_game.txt in which
// the hero's default items look like what the address puts on him — the item's model and effects in
// its style, and its unusual effect. The game shows it once the folder is a search path of its own.
//   node tools/build-vpk.mjs '#shredder/weapon=12849!826' [--game .cache/steam/game/dota] [--out dota_loadout]
// (a whole link to the site does too). Prismatic and kinetic gems, couriers and wards are not in
// items_game.txt (the game keeps them with the item it is given): left out, and said so.
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseLoadout } from '../src/loadout.js';
import { parseKV } from './lib/kv1.mjs';
import { writeVpk } from './lib/vpk.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const address = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!address) { console.error("usage: node tools/build-vpk.mjs '#hero/slot=item.style!unusual,…' [--game <…/dota>] [--out <folder>]"); process.exit(1); }
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'dota_loadout'));
const look = parseLoadout(address.includes('#') ? address.slice(address.indexOf('#')) : address);
if (!look.hero) { console.error(`No hero in ${address}`); process.exit(1); }
const npc = `npc_dota_hero_${look.hero}`;

const file = 'scripts/items/items_game.txt', raw = readFileSync(join(game, file), 'utf8'), ig = parseKV(raw).data.items_game;
const slotOf = (item) => item.item_slot || ig.prefabs?.[item.prefab]?.item_slot || null;
// The hero's default item of each slot: the one that takes the look of what is worn there.
const defaults = new Map();
for (const [id, item] of Object.entries(ig.items)) if (item.prefab === 'default_item' && item.used_by_heroes?.[npc] && !defaults.has(slotOf(item))) defaults.set(slotOf(item), id);
if (!defaults.size) { console.error(`${npc}: no default items in ${file}`); process.exit(1); }

// An item as one look: its style's model and skin, the asset modifiers of that style (without
// their style: the default item has none), and an unusual effect made on it like an item's own.
function lookOf(item, style, unusual) {
  const visuals = item.visuals || {}, keys = visuals.styles ? Object.keys(visuals.styles).sort((a, b) => a - b) : [], key = keys[style] ?? '0', st = visuals.styles?.[key] || {};
  const v = {}; let n = 0;
  for (const [k, m] of Object.entries(visuals)) {
    if (k === 'styles' || k === 'alternate_icons') continue;
    if (!/^asset_modifier/.test(k)) { v[k] = m; continue; }
    if (!m || typeof m !== 'object' || (m.style !== undefined && m.style !== key)) continue;
    const { style: _, ...own } = m; v[`asset_modifier${n++}`] = own;
  }
  if (st.skin !== undefined) v.skin = st.skin;
  if (unusual) v[`asset_modifier${n++}`] = { type: 'particle_create', modifier: unusual };
  return { model: st.model_player || item.model_player || null, visuals: v };
}

// KeyValues text as items_game.txt has it: tabs, CRLF, quoted.
const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kv = (key, value, depth) => {
  const t = '\t'.repeat(depth), k = q(key.replace(/#\d+$/, ''));
  if (value && typeof value === 'object') return `${t}${k}\r\n${t}{\r\n${Object.entries(value).map(([a, b]) => kv(a, b, depth + 1)).join('')}${t}}\r\n`;
  return `${t}${k}\t\t${q(value)}\r\n`;
};

let text = raw;
const itemsAt = text.search(/\n\t"items"\r?\n\t\{/), done = [], skipped = [];
for (const [slot, [id, style]] of Object.entries(look.worn)) {
  const item = ig.items[id], why = (s) => skipped.push(`${slot}=${id}: ${s}`);
  if (slot === 'courier' || slot === 'ward') { why('couriers and wards are not dressed this way'); continue; }
  if (!item) { why('no such item'); continue; }
  if (!item.used_by_heroes?.[npc]) { why(`not ${look.hero}'s`); continue; }
  if (item.prefab === 'default_item') continue;
  const target = defaults.get(slotOf(item));
  if (!target) { why(`${look.hero} has no default item in the ${slotOf(item)} slot to take its look`); continue; }
  const u = look.unusual[slot], system = u != null ? ig.attribute_controlled_attached_particles?.[u]?.system : null;
  if (u != null && !system) why(`no unusual effect ${u}`);
  const { model, visuals } = lookOf(item, style, system), { model_player: _m, visuals: _v, ...own } = ig.items[target];
  const block = kv(target, { ...own, ...(model ? { model_player: model } : {}), visuals }, 2).replace(/\r\n$/, '');
  const start = text.indexOf(`\n\t\t"${target}"`, itemsAt), end = text.indexOf('\n\t\t}', start + 1);
  if (start < 0 || end < 0) { why(`default item ${target} not found in the text`); continue; }
  text = text.slice(0, start + 1) + block + text.slice(end + '\n\t\t}'.length);
  done.push(`${slot}: ${ig.items[target].name} (${target}) → ${item.name} (${id})${style ? `, style ${style}` : ''}${system ? `, unusual ${u} ${basename(system)}` : ''}`);
}
for (const [slot] of Object.entries(look.gems)) skipped.push(`${slot}: prismatic gem — the game gives it with the item`);
for (const [slot] of Object.entries(look.kinetic)) skipped.push(`${slot}: kinetic gem — the game gives it with the item`);

if (!done.length) { console.error(`Nothing to put on.${skipped.length ? `\n  ${skipped.join('\n  ')}` : ''}`); process.exit(1); }
mkdirSync(out, { recursive: true });
writeVpk(join(out, 'pak01_dir.vpk'), new Map([[file, Buffer.from(text, 'utf8')]]));
console.log(`${look.hero}:\n  ${done.join('\n  ')}`);
if (skipped.length) console.log(`left out:\n  ${skipped.join('\n  ')}`);
console.log(`→ ${join(out, 'pak01_dir.vpk')}
In the game: the folder to …/dota 2 beta/game/${basename(out)}, and in game/dota/gameinfo.gi, above "Game dota":
  Game\t\t\t\t${basename(out)}`);
