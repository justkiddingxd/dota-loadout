// Builds the cosmetics of some heroes (or all) for the viewer, after tools/build-heroes.mjs built the
// heroes: each item into <out>/items/<id>/ (tools/lib/item.mjs), and each hero's catalog into
// <out>/heroes/<hero>/items.json — his slots, the items for each, their styles and sets.
//   node tools/build-items.mjs --game <…/dota> --only marci,juggernaut --cli <Source2Viewer-CLI>
// Options: --out assets   --jobs 4   --keep (skip built items)   --items <id,…> (build these even with --keep)
// Left out for now: slots not worn on the hero (pets, voices, personas, ability effects,
// statues) and items that change the hero himself (arcanas, personas: loadCosmetics' unsupported).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readGlb } from './lib/files.mjs';
import { loadCosmetics, loadGame } from './lib/game.mjs';
import { prismaticColors, SOCKETS } from './lib/gems.mjs';
import { buildItem } from './lib/item.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }, flag = (name) => args.includes(`--${name}`);
const game = resolve(opt('game', '.cache/game/dota')), out = resolve(opt('out', 'assets')), jobs = +opt('jobs', 4), cli = opt('cli') && resolve(opt('cli'));
const only = (opt('only', '') || '').split(',').filter(Boolean), redo = new Set((opt('items', '') || '').split(',').filter(Boolean).map(Number));
if (!cli) throw new Error('--cli <Source2Viewer-CLI> is needed');
const CACHE = resolve('.cache');
const NOT_WORN = /voice|ability_effects|effigy|costume|ward|courier|loading_screen|announcer|music|hud|cursor|weather|terrain|emblem|multikill|streak|death_effects/;

const { heroes } = loadGame(game), cosmetics = loadCosmetics(game);
// The prismatic gems' colours, for the items that take one.
writeFileSync(join(out, 'gems.json'), JSON.stringify({ version: 1, prismatic: prismaticColors(game) }));
// Emblems: any hero's (the effect at his feet), built once, a slot of every catalog.
const emblems = [];
for (const item of cosmetics.emblems) {
  const dir = join(out, 'items', String(item.id));
  if (!(flag('keep') && !redo.has(item.id) && existsSync(join(dir, 'item.json')))) {
    try { const r = await buildItem({ game, cli, item, heroBones: new Set(), out: dir, temp: join(CACHE, 'temp', `item${item.id}`) }); if (!r.systems) { rmSync(dir, { recursive: true, force: true }); console.log(`emblem ${item.id}: no effect`); continue; } }
    catch (e) { console.log(`emblem ${item.id}: ERROR ${e.message.split('\n')[0]}`); continue; }
  }
  emblems.push(item);
}
console.log(`${emblems.length} emblems`);
const list = heroes.filter((h) => !only.length || only.includes(h.id));
for (const hero of list) {
  const heroDir = join(out, 'heroes', hero.id), c = cosmetics.get(hero.npc);
  if (!existsSync(join(heroDir, 'hero.json')) || !c) { console.log(`${hero.id}: no hero build or no items, skipped`); continue; }
  const bonesOf = (dir) => { const { json } = readGlb(join(dir, 'models/hero.glb')); return new Set((json.skins || []).flatMap((s) => s.joints.map((j) => json.nodes[j].name?.toLowerCase()))); };
  // A persona's slots dress the persona's skeleton.
  const skeletons = new Map(), heroBones = (slot) => {
    const n = /_persona_(\d+)$/.exec(slot)?.[1], dir = n && existsSync(join(heroDir, 'forms', `persona${n}`, 'models/hero.glb')) ? join(heroDir, 'forms', `persona${n}`) : heroDir;
    if (!skeletons.has(dir)) skeletons.set(dir, bonesOf(dir)); return skeletons.get(dir);
  };
  const items = c.items.filter((i) => i.slot && !NOT_WORN.test(i.slot) && !i.unsupported);
  // Styles that change the hero's model name his form by its key (a form built with him, or none).
  for (const i of items) for (const s of i.styles) if (s.form && typeof s.form === 'object') s.form = hero.forms?.find((f) => f.model === s.form.model)?.key || null;
  for (const i of items) for (const s of i.styles) if (s.form && !existsSync(join(heroDir, 'forms', s.form, 'hero.json'))) s.form = null;
  // Refits: the item and style each refitted model is worn by (any of the hero's, defaults too).
  const wornBy = new Map();
  for (const i of c.items) i.styles.forEach((s, k) => { for (const p of s.models) (wornBy.get(p.toLowerCase()) || wornBy.set(p.toLowerCase(), []).get(p.toLowerCase())).push({ item: i.id, style: i.styles.length > 1 ? k : null }); });
  for (const i of items) for (const s of i.styles) s.refitTo = Object.entries(s.refits || {}).flatMap(([from, to]) => (wornBy.get(from) || []).filter((t) => t.item !== i.id).map((t) => ({ ...t, model: to })));
  console.log(`${hero.name.en}: ${items.length} items of ${c.items.length}`);
  const built = {}, started = Date.now(); let next = 0, done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++], dir = join(out, 'items', String(item.id));
      if (flag('keep') && !redo.has(item.id) && existsSync(join(dir, 'item.json'))) { built[item.id] = { worn: true }; done++; continue; }
      const log = [];
      try { built[item.id] = await buildItem({ game, cli, item, heroBones: heroBones(item.slot), out: dir, temp: join(CACHE, 'temp', `item${item.id}`), log: (l) => log.push(l) }); }
      catch (e) { built[item.id] = { error: e.message.split('\n')[0] }; }
      done++; const r = built[item.id]; if (!r.error && !r.worn) rmSync(dir, { recursive: true, force: true });
      console.log(`  [${done}/${items.length}] ${item.id} ${item.name.en}: ${r.error ? `ERROR ${r.error}` : `${r.models} models, ${r.systems} systems, ${r.icons} icons${r.worn ? '' : ', nothing worn'}`}`);
      for (const l of log) console.log(`  ${l}`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  // The catalog: slots in the game's order with their items, defaults first; sets of built items.
  const ok = [...items.filter((i) => built[i.id] && !built[i.id].error && built[i.id].worn), ...emblems];
  const manifests = Object.fromEntries(ok.map((i) => [i.id, JSON.parse(readFileSync(join(out, 'items', String(i.id), 'item.json'), 'utf8'))]));
  const catalog = {
    version: 1,
    slots: [...c.slots, cosmetics.emblemSlot].filter((s) => ok.some((i) => i.slot === s.name)).map((s) => ({ name: s.name, text: s.text, ...(/_persona_(\d+)$/.test(s.name) ? { persona: +/_persona_(\d+)$/.exec(s.name)[1] } : {}), items: ok.filter((i) => i.slot === s.name).sort((a, b) => b.default - a.default || b.id - a.id).map((i) => i.id) })),
    items: Object.fromEntries(ok.map((i) => [i.id, { name: i.name, slot: i.slot, rarity: i.rarity, default: i.default || undefined, set: i.set || undefined,
      prismatic: (!i.default && SOCKETS[i.id]) || undefined,
      unusual: manifests[i.id].unusual?.map((u) => ({ id: u.id, name: u.name })),
      styles: manifests[i.id].styles.map((s) => ({ name: s.name, icon: s.icon, ...(s.form ? { form: s.form } : {}) })) }])),
    sets: c.sets.map((s) => ({ ...s, items: s.items.filter((id) => manifests[id]) })).filter((s) => s.items.length > 1),
  };
  mkdirSync(heroDir, { recursive: true });
  writeFileSync(join(heroDir, 'items.json'), JSON.stringify(catalog));
  const failed = items.filter((i) => built[i.id]?.error);
  console.log(`${hero.name.en}: ${ok.length} items in ${catalog.slots.length} slots, ${catalog.sets.length} sets (${((Date.now() - started) / 60000).toFixed(1)} min)${failed.length ? `; errors: ${failed.map((i) => i.id).join(', ')}` : ''}`);
}
