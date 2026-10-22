// An outfit of the site for the game itself (src/gamevpk.js, as the site's «To the game» builds it):
// a VPK of the game's own files put in place of the hero's defaults, for the language folder.
//   node tools/build-vpk.mjs '#juggernaut/hero_base=9059,head=30261' [--game .cache/steam/game/dota] [--out dota_loadout]
// (a whole link to the site does too). The file goes to …/dota 2 beta/game/dota_russian/, with
// -language russian in Dota's launch options.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decompress } from 'fzstd';
import { outfitVpk } from '../src/gamevpk.js';
import { parseKV } from '../src/kv.js';
import { parseLoadout } from '../src/loadout.js';
import { gameData } from './lib/gamedata.mjs';
import { Vpk } from './lib/vpk.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const address = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!address) { console.error("usage: node tools/build-vpk.mjs '#hero/slot=item.style!unusual^kinetic,…' [--game <…/dota>] [--out <folder>]"); process.exit(1); }
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'dota_loadout')), NAME = 'pak88_dir.vpk';
const look = parseLoadout(address.includes('#') ? address.slice(address.indexOf('#')) : address);
if (!look.hero) { console.error(`No hero in ${address}`); process.exit(1); }
const npc = `npc_dota_hero_${look.hero}`, zstd = (d) => decompress(d);

// The game's files: those fetched (the game folder), else from its packs if their archive is here.
const packFile = join(game, '../../dl/game/dota/pak01_dir.vpk'), pak = existsSync(packFile) ? new Vpk(packFile) : null;
const read = (p) => (existsSync(join(game, p)) ? readFileSync(join(game, p)) : pak?.read(p) || null);
const ig = parseKV(readFileSync(join(game, 'scripts/items/items_game.txt'), 'utf8')).data.items_game;
const model = parseKV(readFileSync(join(game, `scripts/npc/heroes/${npc}.txt`), 'utf8')).data.DOTAHeroes?.[npc]?.Model;
const { data } = gameData(ig, npc, model, { has: (p) => existsSync(join(game, p)) || !!pak?.has(p), read, zstd });
const { file, done, left, missing } = await outfitVpk({ data, look, file: async (p) => read(p), zstd });

const WHY = { pet: 'couriers and wards are not in this', unknown: `not ${look.hero}'s`, 'no default': `${look.hero} has no default model there`, 'no model': 'it has no model of its own', gem: 'prismatic gems are not in this' };
const what = (w) => (w.item ? `item ${w.item}${w.effects ? ` + ${w.effects} effect(s)` : ''}${w.unusual ? ' + unusual' : ''}` : w.hero ? `${w.hero}: ${w.animations} animations freed of ${w.modifiers.join(', ') || 'nothing'}${w.effects ? `, ${w.effects} effect(s)` : ''}` : Object.entries(w).map(([k, v]) => `${k} ${v}`).join(' '));
if (!file) { console.error(`Nothing to put in.${left.map((l) => `\n  ${l.slot}=${l.item}: ${WHY[l.reason] || l.reason}`).join('')}`); process.exit(1); }
mkdirSync(out, { recursive: true }); writeFileSync(join(out, NAME), file);
console.log(`${look.hero}: ${done.length} files, ${(file.length / 1048576).toFixed(1)} MB\n${done.map((d) => `  ${d.path}  ← ${what(d.what)}`).join('\n')}`);
if (left.length) console.log(`left out:\n${left.map((l) => `  ${l.slot}=${l.item}: ${WHY[l.reason] || l.reason}`).join('\n')}`);
if (missing.length) console.log(`not on this machine (not fetched):\n${missing.map((m) => `  ${m}`).join('\n')}`);
console.log(`→ ${join(out, NAME)}\nIn the game: the file to …/dota 2 beta/game/dota_russian/ (make the folder), and -language russian in Dota's launch options.`);
