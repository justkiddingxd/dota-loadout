// An outfit of the site for the game itself, as mods are made: a VPK of the game's own files put in
// place of the hero's defaults, for the language folder (no game file changed, nothing patched).
//   node tools/build-vpk.mjs '#juggernaut/hero_base=9059,head=30261' [--game .cache/steam/game/dota] [--out dota_loadout]
// (a whole link to the site does too). What goes in:
//   – each worn item's model (in its style's skin) at its slot's default model, with its effects in it
//     (a model's particle_cfg_list, as the game's own models have them) and its unusual effect;
//     the default item's effects emptied (particles/dev/empty_particle);
//   – the effects it puts in place of the hero's (an ability's), the models it refits, its ability icons;
//   – the hero's model (an arcana's form, in its skin) with the activity modifiers of his items and
//     kinetic gems made his plain animations (gamemod.heroModel).
// Prismatic gems, extra models (additional_wearable), couriers and wards are left out, and said so.
// Files the game has but this machine has not fetched are left out too, named.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { heroModel, itemModel } from '../src/gamemod.js';
import { member, readKV3 } from '../src/kv3bin.js';
import { parseKV } from '../src/kv.js';
import { parseLoadout } from '../src/loadout.js';
import { readResource } from '../src/resource.js';
import { writeVpk } from '../src/vpk.js';
import { Vpk } from './lib/vpk.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const address = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!address) { console.error("usage: node tools/build-vpk.mjs '#hero/slot=item.style!unusual^kinetic,…' [--game <…/dota>] [--out <folder>]"); process.exit(1); }
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'dota_loadout')), NAME = 'pak88_dir.vpk';
const look = parseLoadout(address.includes('#') ? address.slice(address.indexOf('#')) : address);
if (!look.hero) { console.error(`No hero in ${address}`); process.exit(1); }
const npc = `npc_dota_hero_${look.hero}`, zstd = (d) => zstdDecompressSync(d);

// The game's files: those fetched (the game folder), else from its packs if their archive is here.
const packFile = resolve(opt('pak', '.cache/steam/dl/game/dota/pak01_dir.vpk')), pak = existsSync(packFile) ? new Vpk(packFile) : null;
const missing = new Set();
const file = (path) => { const p = path.toLowerCase(); if (existsSync(join(game, p))) return readFileSync(join(game, p)); const b = pak?.read(p); if (b) return b; missing.add(p); return null; };
const compiled = (path) => `${path.toLowerCase().replace(/\\/g, '/')}_c`;

const ig = parseKV(readFileSync(join(game, 'scripts/items/items_game.txt'), 'utf8')).data.items_game;
const heroModelPath = parseKV(readFileSync(join(game, `scripts/npc/heroes/${npc}.txt`), 'utf8')).data.DOTAHeroes?.[npc]?.Model;
const slotOf = (item) => item.item_slot || ig.prefabs?.[item.prefab]?.item_slot || null;
const modsOf = (item, key) => Object.values(item.visuals || {}).filter((m) => m && typeof m === 'object' && m.type && (m.style === undefined || m.style === key));
// An item in a style: the style's key and settings, and the modifiers of that style.
const styled = (item, style) => { const keys = item.visuals?.styles ? Object.keys(item.visuals.styles).sort((a, b) => a - b) : [], key = keys[style] ?? '0'; return { key, st: item.visuals?.styles?.[key] || {}, mods: modsOf(item, key) }; };
const effects = (mods) => mods.filter((m) => m.type === 'particle_create' && !m.asset && /\.vpcf$/.test(m.modifier || '') && m.spawn_in_loadout_only !== '1').map((m) => m.modifier);
const defaults = new Map();
for (const [id, item] of Object.entries(ig.items)) if (item.prefab === 'default_item' && item.used_by_heroes?.[npc] && !defaults.has(slotOf(item))) defaults.set(slotOf(item), { id, item });

// A particle's control point configuration for a model to play it with: «preview», as the game's do.
const configOf = (name) => {
  const b = file(compiled(name)); if (!b) return 'preview';
  try { const doc = readKV3(readResource(b).blocks.find((x) => x.type === 'DATA').data, { zstd }), names = (member(doc.root, 'm_controlPointConfigurations')?.value || []).map((c) => member(c, 'm_name')?.value);
    return names.includes('preview') || !names.length ? 'preview' : names[0]; } catch { return 'preview'; }
};
// An ability icon's file, as the game names it (…_png.vtex_c mostly).
const iconFile = (name) => ['_png', '_psd', '_tga', ''].map((s) => `panorama/images/spellicons/${name}${s}.vtex_c`).find((p) => existsSync(join(game, p)) || pak?.has(p)) || null;

const files = new Map(), done = [], left = [];
const put = (path, bytes, why) => { if (bytes) { files.set(path, bytes); done.push(`${path}  ← ${why}`); } };
const on = []; let heroBase = heroModelPath, heroSkin = 0; const heroFx = [];
const worn = Object.entries(look.worn), wornModels = new Map();
for (const [slot, [id, style]] of worn) {
  const item = ig.items[id], skip = (why) => left.push(`${slot}=${id}: ${why}`);
  if (slot === 'courier' || slot === 'ward') { skip('couriers and wards are not in this'); continue; }
  if (!item?.used_by_heroes?.[npc]) { skip(`not ${look.hero}'s`); continue; }
  if (item.prefab === 'default_item') continue;
  const { st, mods } = styled(item, style), def = defaults.get(slotOf(item)), unusual = look.unusual[slot];
  const fx = effects(mods), defFx = def ? effects(modsOf(def.item, '0')) : [];
  const form = mods.find((m) => m.type === 'entity_model' && m.asset === npc && /\.vmdl$/.test(m.modifier || ''));
  if (form) {
    heroBase = form.modifier; heroSkin = +(st.skin ?? mods.find((m) => m.type === 'model_skin')?.skin ?? 0);
    heroFx.push(...fx.filter((f) => !defFx.includes(f)));
  } else {
    const model = st.model_player || item.model_player;
    if (!model) skip('it has no model of its own');
    else if (!def?.item.model_player) skip(`${look.hero} has no default model in the ${slotOf(item)} slot`);
    else {
      const particles = [...fx.filter((f) => !defFx.includes(f)), ...(unusual != null && ig.attribute_controlled_attached_particles?.[unusual]?.system ? [ig.attribute_controlled_attached_particles[unusual].system] : [])];
      const src = file(compiled(model));
      if (src) { put(compiled(def.item.model_player), itemModel(src, { particles: particles.map((name) => ({ name, config: configOf(name) })), skin: +(st.skin ?? 0) }), `${item.name}${particles.length ? ` + ${particles.length} effect(s)` : ''}`); wornModels.set(model.toLowerCase(), def.item.model_player); }
    }
  }
  // The default's own effects go empty, those the item has too stay.
  const empty = file('particles/dev/empty_particle.vpcf_c');
  for (const f of defFx) if (!fx.includes(f)) put(compiled(f), empty, `empty (${def.item.name}'s effect)`);
  for (const m of mods) {
    if (m.type === 'particle' && /\.vpcf$/.test(m.asset || '') && /\.vpcf$/.test(m.modifier || '')) put(compiled(m.asset), file(compiled(m.modifier)), m.modifier);
    if (m.type === 'activity' && m.modifier) on.push([m.asset || 'ALL', m.modifier]);
    if (m.type === 'ability_icon' && m.asset && m.modifier) { const from = iconFile(m.modifier), to = iconFile(m.asset) || `panorama/images/spellicons/${m.asset}_png.vtex_c`; if (from) put(to, file(from), `icon ${m.modifier}`); else missing.add(`icon ${m.modifier}`); }
    if (m.type === 'additional_wearable') skip(`its extra model ${m.asset} is not in this`);
  }
  if (look.gems[slot]) skip('prismatic gems are not in this');
  if (look.kinetic[slot] != null) for (const m of Object.values(ig.asset_modifiers?.[look.kinetic[slot]] || {})) if (m?.type === 'activity' && m.modifier) on.push([m.asset || 'ALL', m.modifier]);
}
// Models refitted by what is worn (an arcana's mask on the default head): at the default's place, or the worn item's.
for (const [slot, [id, style]] of worn) {
  const item = ig.items[id]; if (!item?.used_by_heroes?.[npc]) continue;
  for (const m of styled(item, style).mods) if (m.type === 'model' && /\.vmdl$/.test(m.asset || '') && /\.vmdl$/.test(m.modifier || '')) {
    const at = wornModels.get(m.asset.toLowerCase()) || ([...defaults.values()].some((d) => d.item.model_player?.toLowerCase() === m.asset.toLowerCase() && !worn.some(([s]) => defaults.get(s) === d)) ? m.asset : null);
    if (at) put(compiled(at), file(compiled(m.modifier)), `refit ${m.modifier}`);
  }
}
// The hero's model: his form's, moving as his outfit makes him, with the form's effects and skin.
if (heroModelPath && (on.length || heroBase !== heroModelPath || heroFx.length)) {
  const src = file(compiled(heroBase));
  if (src) {
    const r = heroModel(src, on, { zstd });
    const bytes = heroFx.length || heroSkin ? itemModel(r.bytes, { particles: heroFx.map((name) => ({ name, config: configOf(name) })), skin: heroSkin }) : r.bytes;
    put(compiled(heroModelPath), bytes, `${heroBase}: ${r.changed} animations freed of ${[...new Set(on.map(([, m]) => m))].join(', ') || 'nothing'}, ${r.dropped} set aside${heroFx.length ? `, ${heroFx.length} effect(s)` : ''}${heroSkin ? `, skin ${heroSkin}` : ''}`);
  }
}

if (!files.size) { console.error(`Nothing to put in.${left.map((l) => `\n  ${l}`).join('')}${[...missing].map((m) => `\n  not here: ${m}`).join('')}`); process.exit(1); }
mkdirSync(out, { recursive: true });
const vpk = writeVpk(files); writeFileSync(join(out, NAME), vpk);
console.log(`${look.hero}: ${files.size} files, ${(vpk.length / 1048576).toFixed(1)} MB\n${done.map((d) => `  ${d}`).join('\n')}`);
if (left.length) console.log(`left out:\n${left.map((l) => `  ${l}`).join('\n')}`);
if (missing.size) console.log(`not on this machine (not fetched):\n${[...missing].map((m) => `  ${m}`).join('\n')}`);
console.log(`→ ${join(out, NAME)}
In the game: the file to …/dota 2 beta/game/dota_russian/ (make the folder), and -language russian in Dota's launch options
(a language folder that has mods already will do: put it next to them).`);
