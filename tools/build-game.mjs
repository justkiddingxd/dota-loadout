// What the site's «To the game» needs to put an outfit into the game (src/gamevpk.js): each hero's
// game data (<out>/heroes/<id>/game.json, tools/lib/gamedata.mjs) and the game's compiled files it
// uses, as they are, at <out>/game/<path> (items' models, the heroes' and their forms', the effects
// and models items put in place of others, ability icons). Files already there and unchanged stay.
//   node tools/build-game.mjs [--game .cache/steam/game/dota] [--out assets] [--only juggernaut,shredder]
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { decompress } from 'fzstd';
import { parseKV } from '../src/kv.js';
import { gameData } from './lib/gamedata.mjs';
import { Vpk } from './lib/vpk.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'assets')), only = opt('only', null)?.split(',');
const packFile = join(game, '../../dl/game/dota/pak01_dir.vpk'), pak = existsSync(packFile) ? new Vpk(packFile) : null;
const local = (p) => join(game, p);
const files = { has: (p) => existsSync(local(p)) || !!pak?.has(p), read: (p) => (existsSync(local(p)) ? readFileSync(local(p)) : pak?.read(p) || null), zstd: (d) => decompress(d) };

const ig = parseKV(readFileSync(join(game, 'scripts/items/items_game.txt'), 'utf8')).data.items_game;
const heroes = JSON.parse(readFileSync(join(out, 'heroes/index.json'), 'utf8')).heroes.map((h) => h.id).filter((h) => !only || only.includes(h));
const configs = new Map(), wanted = new Set();
for (const hero of heroes) {
  const npc = `npc_dota_hero_${hero}`, script = join(game, `scripts/npc/heroes/${npc}.txt`);
  const model = existsSync(script) ? parseKV(readFileSync(script, 'utf8')).data.DOTAHeroes?.[npc]?.Model : null;
  const { data, files: need } = gameData(ig, npc, model, files, configs);
  writeFileSync(join(out, 'heroes', hero, 'game.json'), JSON.stringify(data));
  for (const f of need) wanted.add(f);
}
// The files, copied when new or changed (by size); those this machine lacks are named.
let copied = 0, bytes = 0; const missing = [];
for (const f of wanted) {
  const to = join(out, 'game', f);
  if (existsSync(local(f))) {
    const size = statSync(local(f)).size; bytes += size;
    if (!existsSync(to) || statSync(to).size !== size) { mkdirSync(dirname(to), { recursive: true }); copyFileSync(local(f), to); copied++; }
  } else { const b = pak?.read(f); if (b) { bytes += b.length; if (!existsSync(to) || statSync(to).size !== b.length) { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, b); copied++; } } else missing.push(f); }
}
console.log(`${heroes.length} heroes; ${wanted.size} files (${(bytes / 2 ** 30).toFixed(2)} GB), ${copied} copied; ${missing.length} not on this machine${missing.length ? `: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}` : ''}`);
