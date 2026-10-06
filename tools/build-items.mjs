// Builds the cosmetics of some heroes (or all) for the viewer, after tools/build-heroes.mjs built the
// heroes: each item into <out>/items/<id>/ (tools/lib/item.mjs), and each hero's catalog into
// <out>/heroes/<hero>/items.json — his slots, the items for each, their styles and sets.
//   node tools/build-items.mjs --game <…/dota> --only marci,juggernaut --cli <Source2Viewer-CLI>
// Options: --out assets   --jobs 4   --keep (skip built items)
// Left out for now: slots not worn on the hero (taunts, pets, voices, personas, ability effects,
// statues) and items that change the hero himself (arcanas, personas: loadCosmetics' unsupported).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readGlb } from './lib/files.mjs';
import { loadCosmetics, loadGame } from './lib/game.mjs';
import { buildItem } from './lib/item.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }, flag = (name) => args.includes(`--${name}`);
const game = resolve(opt('game', '.cache/game/dota')), out = resolve(opt('out', 'assets')), jobs = +opt('jobs', 4), cli = opt('cli') && resolve(opt('cli'));
const only = (opt('only', '') || '').split(',').filter(Boolean);
if (!cli) throw new Error('--cli <Source2Viewer-CLI> is needed');
const CACHE = resolve('.cache');
const NOT_WORN = /taunt|summon|voice|persona|ability_effects|hero_base|effigy|costume|selector|ward|courier|loading_screen|announcer|music|hud|cursor|weather|terrain|emblem|multikill|streak|death_effects|hero_effigy/;

const { heroes } = loadGame(game), cosmetics = loadCosmetics(game);
const list = heroes.filter((h) => !only.length || only.includes(h.id));
for (const hero of list) {
  const heroDir = join(out, 'heroes', hero.id), c = cosmetics.get(hero.npc);
  if (!existsSync(join(heroDir, 'hero.json')) || !c) { console.log(`${hero.id}: no hero build or no items, skipped`); continue; }
  const { json } = readGlb(join(heroDir, 'models/hero.glb'));
  const heroBones = new Set((json.skins || []).flatMap((s) => s.joints.map((j) => json.nodes[j].name?.toLowerCase())));
  const items = c.items.filter((i) => i.slot && !NOT_WORN.test(i.slot) && !i.unsupported);
  console.log(`${hero.name.en}: ${items.length} items of ${c.items.length}`);
  const built = {}, started = Date.now(); let next = 0, done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++], dir = join(out, 'items', String(item.id));
      if (flag('keep') && existsSync(join(dir, 'item.json'))) { built[item.id] = { worn: true }; done++; continue; }
      const log = [];
      try { built[item.id] = await buildItem({ game, cli, item, heroBones, out: dir, temp: join(CACHE, 'temp', `item${item.id}`), log: (l) => log.push(l) }); }
      catch (e) { built[item.id] = { error: e.message.split('\n')[0] }; }
      done++; const r = built[item.id]; if (!r.error && !r.worn) rmSync(dir, { recursive: true, force: true });
      console.log(`  [${done}/${items.length}] ${item.id} ${item.name.en}: ${r.error ? `ERROR ${r.error}` : `${r.models} models, ${r.systems} systems, ${r.icons} icons${r.worn ? '' : ', nothing worn'}`}`);
      for (const l of log) console.log(`  ${l}`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  // The catalog: slots in the game's order with their items, defaults first; sets of built items.
  const ok = items.filter((i) => built[i.id] && !built[i.id].error && built[i.id].worn);
  const manifests = Object.fromEntries(ok.map((i) => [i.id, JSON.parse(readFileSync(join(out, 'items', String(i.id), 'item.json'), 'utf8'))]));
  const catalog = {
    version: 1,
    slots: c.slots.filter((s) => ok.some((i) => i.slot === s.name)).map((s) => ({ name: s.name, text: s.text, items: ok.filter((i) => i.slot === s.name).sort((a, b) => b.default - a.default || b.id - a.id).map((i) => i.id) })),
    items: Object.fromEntries(ok.map((i) => [i.id, { name: i.name, slot: i.slot, rarity: i.rarity, default: i.default || undefined, set: i.set || undefined,
      styles: manifests[i.id].styles.map((s) => ({ name: s.name, icon: s.icon })) }])),
    sets: c.sets.map((s) => ({ ...s, items: s.items.filter((id) => manifests[id]) })).filter((s) => s.items.length > 1),
  };
  mkdirSync(heroDir, { recursive: true });
  writeFileSync(join(heroDir, 'items.json'), JSON.stringify(catalog));
  const failed = items.filter((i) => built[i.id]?.error);
  console.log(`${hero.name.en}: ${ok.length} items in ${catalog.slots.length} slots, ${catalog.sets.length} sets (${((Date.now() - started) / 60000).toFixed(1)} min)${failed.length ? `; errors: ${failed.map((i) => i.id).join(', ')}` : ''}`);
}
