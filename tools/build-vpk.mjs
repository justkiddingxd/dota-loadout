// An outfit of the site for the game itself (src/vpk.js, as the site's «To the game» builds it):
// a pak01_dir.vpk with the game's items_game.txt in which the hero's default items look like what
// the address puts on him — items in their styles, unusual effects, kinetic and prismatic gems.
//   node tools/build-vpk.mjs '#shredder/weapon=12849!826' [--game .cache/steam/game/dota] [--out dota_loadout]
// (a whole link to the site does too). The folder goes to …/dota 2 beta/game/, and a line
// "Game <folder>" above "Game dota" in game/dota/gameinfo.gi.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseLoadout } from '../src/loadout.js';
import { gameVpk } from '../src/vpk.js';
import { prismaticColors, SOCKETS } from './lib/gems.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const address = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!address) { console.error("usage: node tools/build-vpk.mjs '#hero/slot=item.style~gem!unusual^kinetic,…' [--game <…/dota>] [--out <folder>]"); process.exit(1); }
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'dota_loadout'));
const look = parseLoadout(address.includes('#') ? address.slice(address.indexOf('#')) : address);
if (!look.hero) { console.error(`No hero in ${address}`); process.exit(1); }

// Gems by colour: the one asked for, else the one the item comes with.
const hex = Object.fromEntries(prismaticColors(game).map((g) => [g.key, g.hex]));
const colors = Object.fromEntries(Object.entries(look.worn).map(([slot, [id]]) => [slot, hex[look.gems[slot] || SOCKETS[id]]]).filter(([, c]) => c));
const { file, done, skipped } = gameVpk(readFileSync(join(game, 'scripts/items/items_game.txt'), 'utf8'), { ...look, colors });

const WHY = { pet: 'couriers and wards are not dressed this way', unknown: 'no such item', 'other hero': `not ${look.hero}'s`, 'no default': `${look.hero} has no default item there to take its look` };
for (const g of Object.keys(look.gems)) if (!colors[g]) skipped.push({ slot: g, item: look.worn[g]?.[0], reason: `no gem ${look.gems[g]}` });
if (!file) { console.error(`Nothing to put on.${skipped.map((s) => `\n  ${s.slot}=${s.item}: ${WHY[s.reason] || s.reason}`).join('')}`); process.exit(1); }
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'pak01_dir.vpk'), file);
console.log(`${look.hero}:\n${done.map((d) => `  ${d.slot}: ${d.default} → ${d.item}${d.style ? ` style ${d.style}` : ''}${d.unusual != null ? `, unusual ${d.unusual}` : ''}${d.kinetic != null ? `, kinetic ${d.kinetic}` : ''}${d.color ? `, gem ${d.color}` : ''}`).join('\n')}`);
if (skipped.length) console.log(`left out:${skipped.map((s) => `\n  ${s.slot}=${s.item}: ${WHY[s.reason] || s.reason}`).join('')}`);
console.log(`→ ${join(out, 'pak01_dir.vpk')}
In the game: the folder to …/dota 2 beta/game/${basename(out)}, and in game/dota/gameinfo.gi, above "Game dota":
  Game\t\t\t\t${basename(out)}`);
