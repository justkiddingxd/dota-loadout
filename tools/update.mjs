// Keeps the site up with the game, by itself (a timer runs it): takes what Steam has new
// (tools/fetch-dota.mjs), builds the items not built yet and the heroes they are for — a hero again
// when one of them changes his model (an arcana, a persona), new heroes whole — and deploys.
//   node tools/update.mjs [--no-fetch] [--no-deploy] [--dry]
// It remembers the items it has seen in .cache/update-state.json; the first run takes those of the
// built catalogs as seen. Steam's login token lasts weeks: when it asks for the password again,
// fetch-dota stops with that, and so does this (log in by hand, see the top of fetch-dota.mjs).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseKV } from './lib/kv1.mjs';

const args = process.argv.slice(2), flag = (name) => args.includes(`--${name}`);
const ROOT = resolve(import.meta.dirname, '..'), GAME = join(ROOT, '.cache/steam/game/dota'), ASSETS = join(ROOT, 'assets'), CLI = join(ROOT, '.cache/vrf-20.0/Source2Viewer-CLI');
const STATE = join(ROOT, '.cache/update-state.json');
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);
const run = (script, ...rest) => { log('→', script, ...rest.map((a) => (a.length > 80 ? `${a.slice(0, 77)}…` : a))); if (!flag('dry')) execFileSync('node', [join(ROOT, 'tools', script), ...rest], { cwd: ROOT, stdio: 'inherit' }); };

if (!flag('no-fetch')) run('fetch-dota.mjs');

// The game's heroes and the items for them that the site shows (wearables and defaults).
const ig = parseKV(readFileSync(join(GAME, 'scripts/items/items_game.txt'), 'utf8')).data.items_game;
const heroesOf = (item) => Object.keys(item.used_by_heroes || {}).filter((k) => k.startsWith('npc_dota_hero_')).map((k) => k.slice(14));
const items = Object.entries(ig.items).filter(([, i]) => (i.prefab === 'wearable' || i.prefab === 'default_item') && i.used_by_heroes && typeof i.used_by_heroes === 'object');
const built = JSON.parse(readFileSync(join(ASSETS, 'heroes/index.json'), 'utf8')).heroes.map((h) => h.id);
const npc = parseKV(readFileSync(join(GAME, 'scripts/npc/npc_heroes.txt'), 'utf8')).data.DOTAHeroes;
const gameHeroes = Object.entries(npc).filter(([k, h]) => k.startsWith('npc_dota_hero_') && h && typeof h === 'object' && h.Enabled !== '0' && k !== 'npc_dota_hero_base').map(([k]) => k.slice(14));

// What was seen: the last run's, or at first what the built catalogs have.
const seen = new Set(existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')).items : built.flatMap((h) => {
  const f = join(ASSETS, 'heroes', h, 'items.json'); return existsSync(f) ? Object.keys(JSON.parse(readFileSync(f, 'utf8')).items) : [];
}));
const fresh = items.filter(([id]) => !seen.has(id));
const newHeroes = gameHeroes.filter((h) => !built.includes(h));
// A new item that puts the hero in another model (entity_model on him, a persona): his forms are built with him.
const changesHim = (item) => Object.entries(item.visuals || {}).some(([k, m]) => /^asset_modifier/.test(k) && m && ((m.type === 'entity_model' && /^npc_dota_hero_/.test(m.asset || '')) || m.type === 'persona'));
const reform = [...new Set(fresh.filter(([, i]) => changesHim(i)).flatMap(([, i]) => heroesOf(i)))].filter((h) => built.includes(h));
const forItems = [...new Set(fresh.flatMap(([, i]) => heroesOf(i)))].filter((h) => built.includes(h) || newHeroes.includes(h));
log(`${fresh.length} new items (${fresh.slice(0, 8).map(([id, i]) => `${id} ${i.name}`).join(', ')}${fresh.length > 8 ? ', …' : ''}); new heroes: ${newHeroes.join(', ') || 'none'}; heroes in a new form: ${reform.join(', ') || 'none'}`);

if (newHeroes.length || reform.length) run('build-heroes.mjs', '--game', GAME, '--cli', CLI, '--only', [...newHeroes, ...reform].join(','));
if (newHeroes.length) run('build-portraits.mjs', '--game', GAME, '--cli', CLI);
const heroes = [...new Set([...forItems, ...newHeroes])];
if (heroes.length) run('build-items.mjs', '--game', GAME, '--cli', CLI, '--only', heroes.join(','), '--keep', '--items', fresh.map(([id]) => id).join(','));
if (heroes.length && !flag('no-deploy') && !flag('dry')) { log('→ deploy'); execFileSync('sh', [join(ROOT, 'tools/deploy.sh')], { cwd: ROOT, stdio: 'inherit' }); }
if (!flag('dry')) writeFileSync(STATE, JSON.stringify({ updated: new Date().toISOString(), items: items.map(([id]) => id) }));
log(heroes.length ? `done: ${heroes.length} heroes` : 'nothing new');
