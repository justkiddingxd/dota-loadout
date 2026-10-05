// Builds every hero (or some) for the viewer from the game's files:
//   node tools/build-heroes.mjs --zip dota2heroes-6944.zip      the archive of tools/extract-dota.ps1
//   node tools/build-heroes.mjs --game <…/game/dota>            or an unpacked game folder
// Options: --only nevermore,axe   --jobs 3   --out assets/heroes   --cli <Source2Viewer-CLI>   --keep (skip built heroes)
// Needs cwebp (libwebp) on PATH. Source2Viewer-CLI is downloaded into .cache/ when not given.
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { loadGame } from './lib/game.mjs';
import { buildHero } from './lib/hero.mjs';

const exec = promisify(execFile);
const ROOT = resolve(new URL('..', import.meta.url).pathname), CACHE = join(ROOT, '.cache');
const VRF = '20.0';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const flag = (name) => args.includes(`--${name}`);
const out = resolve(opt('out', join(ROOT, 'assets/heroes'))), jobs = +opt('jobs', Math.max(1, Math.min(4, cpus().length - 1)));
const only = opt('only', '')?.split(',').filter(Boolean);

async function unpack(zip) {
  const game = join(CACHE, 'game', 'dota'), stamp = join(game, '.from');
  const id = `${resolve(zip)}:${statSync(zip).size}`;
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === id) return game;
  console.log(`Распаковываю ${zip}...`);
  rmSync(game, { recursive: true, force: true }); mkdirSync(game, { recursive: true });
  try { await exec('unzip', ['-q', '-o', zip, '-d', game], { maxBuffer: 1 << 26 }); } catch { await exec('python3', ['-m', 'zipfile', '-e', zip, game], { maxBuffer: 1 << 26 }); }
  writeFileSync(stamp, id);
  return game;
}

async function vrfCli() {
  const given = opt('cli'); if (given) return resolve(given);
  const platform = { linux: 'linux', darwin: 'macos', win32: 'windows' }[process.platform], arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const dir = join(CACHE, `vrf-${VRF}`), exe = join(dir, process.platform === 'win32' ? 'Source2Viewer-CLI.exe' : 'Source2Viewer-CLI');
  if (existsSync(exe)) return exe;
  console.log(`Скачиваю Source2Viewer-CLI ${VRF}...`); mkdirSync(dir, { recursive: true });
  const response = await fetch(`https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/${VRF}/cli-${platform}-${arch}.zip`);
  if (!response.ok) throw new Error(`Source2Viewer-CLI: ${response.status}`);
  const zip = join(dir, 'cli.zip'); writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  try { await exec('unzip', ['-q', '-o', zip, '-d', dir]); } catch { await exec('python3', ['-m', 'zipfile', '-e', zip, dir]); }
  rmSync(zip); chmodSync(exe, 0o755); return exe;
}

const zip = opt('zip'), game = zip ? await unpack(zip) : resolve(opt('game', join(CACHE, 'game', 'dota')));
if (!existsSync(join(game, 'gameinfo.gi'))) throw new Error(`Нет ${join(game, 'gameinfo.gi')}: укажи --zip или --game.`);
// Source2Viewer-CLI resolves dependencies through gameinfo.gi's «Game dota»: the files must sit in a folder named dota.
if (!/[\\/]dota$/.test(game)) throw new Error(`Папка игры должна называться dota: ${game}`);
const cli = await vrfCli();
const { heroes } = loadGame(game);
const build = heroes.filter((h) => !only.length || only.includes(h.id));
console.log(`Героев: ${heroes.length}, собираю ${build.length} в ${jobs} потока → ${out}`);
mkdirSync(out, { recursive: true });

const results = {}, started = Date.now();
let next = 0, done = 0;
async function worker() {
  while (next < build.length) {
    const hero = build[next++], dir = join(out, hero.id);
    if (flag('keep') && existsSync(join(dir, 'hero.json'))) { results[hero.id] = { kept: true }; done++; continue; }
    const t = Date.now(), log = [];
    try {
      const r = await buildHero({ game, cli, hero, out: dir, temp: join(CACHE, 'temp', hero.id), log: (line) => log.push(line) });
      results[hero.id] = r;
      console.log(`[${++done}/${build.length}] ${hero.name.en}: ${r.models.join(', ')}; ${r.materials} материалов, ${r.animations} анимаций, ${r.systems} систем частиц (${((Date.now() - t) / 1000).toFixed(0)} с)`);
    } catch (e) {
      results[hero.id] = { error: e.message };
      console.log(`[${++done}/${build.length}] ${hero.name.en}: ОШИБКА ${e.message.split('\n')[0]}`);
    }
    for (const line of log) console.log(line);
  }
}
await Promise.all(Array.from({ length: jobs }, worker));

// The roster: every hero with a built folder, in the game's order.
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
const steam = existsSync(join(game, 'steam.inf')) ? /ClientVersion=(\d+)/.exec(readFileSync(join(game, 'steam.inf'), 'utf8'))?.[1] : null;
const index = {
  version: 1, game: steam ? +steam : null, built: new Date().toISOString().slice(0, 10),
  heroes: heroes.filter((h) => existsSync(join(out, h.id, 'hero.json'))).map((h) => {
    const m = JSON.parse(readFileSync(join(out, h.id, 'hero.json'), 'utf8'));
    return {
      id: h.id, heroId: h.heroId, name: h.name, attribute: h.attribute, roles: h.roles, complexity: h.complexity, hype: h.hype,
      abilities: h.abilities, animations: m.animations.list, size: size(join(out, h.id)),
    };
  }),
};
writeFileSync(join(out, 'index.json'), JSON.stringify(index));
const failed = Object.entries(results).filter(([, r]) => r.error);
console.log(`Готово за ${((Date.now() - started) / 60000).toFixed(1)} мин: ${index.heroes.length} героев в index.json${failed.length ? `, ошибки: ${failed.map(([id]) => id).join(', ')}` : ''}`);
