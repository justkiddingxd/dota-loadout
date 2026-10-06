// Fetches the game's files straight from Steam (no game install): what tools/extract-dota.ps1 packs
// from an installed game, plus every hero cosmetic (wearables, taunts, their styles, effects and
// inventory icons), unpacked into a game folder for tools/build-heroes.mjs --game.
//   node tools/fetch-dota.mjs [--out .cache/steam/game/dota] [--batch 40] [--defaults-only]
// Needs DepotDownloader in .cache/steam (or --steam <dir>) and a Steam account with Dota 2 in its
// library, logged in once by hand (it asks for the password and the Steam Guard code, then keeps a
// token): ./DepotDownloader -app 570 -depot 373301 -filelist files.txt -dir dl -username <login>
// -remember-password -no-mobile, with the login also written to username.txt.
// The packed files are spread over ~670 archives of ~100 MB; an archive is downloaded only when it
// holds a wanted file, its files are taken out, and it is deleted again.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseKV } from './lib/kv1.mjs';
import { references, Vpk } from './lib/vpk.mjs';

const exec = promisify(execFile);
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const STEAM = resolve(opt('steam', '.cache/steam')), OUT = resolve(opt('out', join(STEAM, 'game/dota'))), BATCH = +opt('batch', 40);
const DL = join(STEAM, 'dl'), MANIFESTS = join(STEAM, 'manifests');
const defaultsOnly = args.includes('--defaults-only');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const login = readFileSync(join(STEAM, 'username.txt'), 'utf8').trim();
const depot = async (extra) => {
  const { stdout } = await exec(join(STEAM, 'DepotDownloader'), ['-app', '570', '-username', login, '-remember-password', '-max-downloads', '16', ...extra], { cwd: STEAM, maxBuffer: 1 << 28 });
  if (/password|STEAM GUARD/i.test(stdout) && !/Done!/.test(stdout)) throw new Error('Steam login needs a password again: log in by hand (see the top of this file)');
  return stdout;
};

// Which depot has which file (the archives are spread over several).
log('Manifests…');
rmSync(MANIFESTS, { recursive: true, force: true });
await depot(['-manifest-only', '-os', 'windows', '-osarch', '64', '-dir', MANIFESTS]);
const depotOf = new Map();
for (const f of readdirSync(MANIFESTS).filter((f) => /^manifest_\d+_\d+\.txt$/.test(f))) {
  const id = f.split('_')[1];
  for (const line of readFileSync(join(MANIFESTS, f), 'utf8').split('\n')) { const m = /\s(game\/(?:dota|core)\/\S+)$/.exec(line); if (m) depotOf.set(m[1], id); }
}
const download = async (files) => {
  const byDepot = new Map(); for (const f of files) { const d = depotOf.get(f); if (!d) throw new Error(`No depot has ${f}`); (byDepot.get(d) || byDepot.set(d, []).get(d)).push(f); }
  for (const [d, list] of byDepot) {
    const fl = join(STEAM, `filelist_${d}.txt`); writeFileSync(fl, list.join('\n') + '\n');
    // Steam drops the connection now and then: three tries.
    for (let i = 1; ; i++) { try { await depot(['-depot', d, '-filelist', fl, '-dir', DL]); break; } catch (e) { if (i === 3 || /password/.test(e.message)) throw e; log(`depot ${d}: ${e.message.split('\n').find((l) => /Lost|cancel|error/i.test(l)) || 'failed'}, again`); } }
  }
};

const loose = ['game/dota/pak01_dir.vpk', 'game/dota/gameinfo.gi', 'game/dota/steam.inf'];
log('Directory…'); await download(loose);
mkdirSync(OUT, { recursive: true });
for (const f of loose.slice(1)) writeFileSync(join(OUT, f.replace('game/dota/', '')), readFileSync(join(DL, f)));
const vpk = new Vpk(join(DL, 'game/dota/pak01_dir.vpk'));
const archivePath = (a) => join(DL, 'game/dota', `pak01_${String(a).padStart(3, '0')}.vpk`);
log(`pak01: ${vpk.files.size} files`);

// Takes out the wanted files and all they reference, downloading the archives that hold them.
const SKIP = /\.(vsnd|vsndevts|vsndstck|vfx|vmap|vwrld|vrman|vpost|vsc)(_c)?$/;
const done = new Set(), missing = new Set();
let bytes = 0;
const size = (path) => { const e = vpk.files.get(path); return e.length + (e.preload ? e.preload.length : 0); };
const write = (path, data) => { const target = join(OUT, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data); };
// Files already taken out (by an earlier run too) are read from the game folder.
const local = (path) => { const target = join(OUT, path); return existsSync(target) && statSync(target).size === size(path); };
// What items and heroes draw on lives in these folders, an archive's files of which are all taken out
// at once: the references found later mostly point there, and their archives are gone by then.
const EAGER = /^(materials\/models\/(heroes|items)\/|materials\/particle\/|models\/(heroes|items|particle)\/|particles\/|panorama\/images\/econ\/items\/)/;
const eager = new Map();
for (const path of vpk.files.keys()) { if (!EAGER.test(path) || SKIP.test(path)) continue; const a = vpk.archiveOf(path); if (a !== null) (eager.get(a) || eager.set(a, []).get(a)).push(path); }
async function take(wanted, follow = true) {
  let queue = [...wanted], fetched = [];
  for (;;) {
    // Take all that the archives at hand hold; the rest waits for its archive.
    const waiting = new Map();
    while (queue.length) {
      let path = queue.pop().replace(/\\/g, '/').toLowerCase();
      if (SKIP.test(path)) continue;
      if (follow && !path.endsWith('_c') && !vpk.has(path)) path += '_c';
      if (done.has(path)) continue;
      if (!vpk.has(path)) { missing.add(path); done.add(path); continue; }
      const a = vpk.archiveOf(path), have = local(path);
      if (!have && a !== null && !existsSync(archivePath(a))) { (waiting.get(a) || waiting.set(a, new Set()).get(a)).add(path); continue; }
      done.add(path); const data = have ? readFileSync(join(OUT, path)) : vpk.read(path); if (!have) write(path, data); bytes += data.length;
      if (follow && path.endsWith('_c')) queue.push(...references(data));
    }
    vpk.close(); for (const a of fetched) rmSync(archivePath(a), { force: true });
    if (!waiting.size) return;
    // The next batch of archives, those with the most wanted files first.
    fetched = [...waiting.entries()].sort((x, y) => y[1].size - x[1].size).slice(0, BATCH).map(([a]) => a);
    log(`${waiting.size} archives to go; downloading ${fetched.length} (${done.size} files, ${(bytes / 2 ** 30).toFixed(2)} GB taken)`);
    await download(fetched.map((a) => `game/dota/pak01_${String(a).padStart(3, '0')}.vpk`));
    for (const a of fetched) for (const path of eager.get(a) || []) if (!local(path)) write(path, vpk.read(path));
    queue = [...waiting.values()].flatMap((s) => [...s]);
  }
}

// Scripts and localization, as they are.
const scripts = ['scripts/npc/npc_heroes.txt', 'scripts/items/items_game.txt', 'scripts/npc/portraits_full_body_loadout.txt',
  ...['dota', 'abilities', 'hero_lore', 'items'].flatMap((f) => ['english', 'russian'].map((l) => `resource/localization/${f}_${l}.txt`)),
  ...[...vpk.files.keys()].filter((p) => /^scripts\/npc\/heroes\/npc_dota_hero_.*\.txt$/.test(p)).sort()];
log('Scripts…'); await take(scripts, false);
const text = (p) => readFileSync(join(OUT, p), 'utf8');

// Roots: each hero's model, the items for heroes (defaults, or every wearable and taunt with its
// styles and effects, and its inventory icon), the loadout portraits.
const roots = new Set();
for (const f of scripts.filter((p) => p.startsWith('scripts/npc/heroes/'))) { const m = /"Model"\s+"([^"]+\.vmdl)"/.exec(text(f)); if (m) roots.add(m[1]); }
const assets = (o, into) => { for (const v of Object.values(o || {})) { if (typeof v === 'string') { if (/\.(vmdl|vpcf|vmat)$/i.test(v)) into.add(v); } else if (v && typeof v === 'object') assets(v, into); } };
const items = parseKV(text('scripts/items/items_game.txt')).data.items_game.items; let count = 0;
for (const item of Object.values(items)) {
  if (!item.used_by_heroes || typeof item.used_by_heroes !== 'object') continue;
  if (!(item.prefab === 'default_item' || (!defaultsOnly && (item.prefab === 'wearable' || item.prefab === 'taunt')))) continue;
  assets(item, roots); count++;
  if (!defaultsOnly && item.image_inventory) roots.add(`panorama/images/${item.image_inventory.toLowerCase()}_png.vtex_c`);
}
assets(parseKV(text('scripts/npc/portraits_full_body_loadout.txt')).data.DOTAFullBodyLoadoutPortraitInfo, roots);
// The site's pictures of the heroes: their portraits (wide, tall for the picker, small icons) and
// the attributes' icons.
for (const p of vpk.files.keys()) if (/^panorama\/images\/(heroes\/(selection\/|icons\/)?npc_dota_hero_[a-z_0-9]+_png|primary_attribute_icons\/[a-z_]+_psd)\.vtex_c$/.test(p)) roots.add(p);
log(`${count} items, ${roots.size} roots`);
await take(roots);
// What the game's archives lack and the engine's (game/core) have — the game mounts both: shared
// particle textures (light_glow_01 of 362 items' glows). Taken with what they reference there.
await download(['game/core/pak01_dir.vpk']);
const core = new Vpk(join(DL, 'game/core/pak01_dir.vpk')), corePath = (a) => join(DL, 'game/core', `pak01_${String(a).padStart(3, '0')}.vpk`);
const fromCore = new Set([...missing].map((p) => (core.has(p) ? p : `${p}_c`)).filter((p) => core.has(p)));
const coreArchives = [...new Set([...fromCore].map((p) => core.archiveOf(p)).filter((a) => a !== null))];
if (fromCore.size) {
  log(`${fromCore.size} files from the engine's archives (${coreArchives.length} of them)…`);
  await download(coreArchives.map((a) => `game/core/pak01_${String(a).padStart(3, '0')}.vpk`));
  const queue = [...fromCore], seen = new Set();
  while (queue.length) {
    const path = queue.pop(); if (seen.has(path) || !core.has(path) || SKIP.test(path)) continue; seen.add(path);
    const a = core.archiveOf(path); if (a !== null && !existsSync(corePath(a))) continue;
    const data = core.read(path); if (!existsSync(join(OUT, path))) write(path, data); missing.delete(path.replace(/_c$/, '')); missing.delete(path);
    if (path.endsWith('_c')) for (const r of references(data)) { const c = `${r.toLowerCase()}_c`; if (!vpk.has(c) && !existsSync(join(OUT, c))) queue.push(c); }
  }
  core.close(); for (const a of coreArchives) rmSync(corePath(a), { force: true });
}
writeFileSync(join(OUT, '.from'), `steam ${readFileSync(join(OUT, 'steam.inf'), 'utf8').match(/ClientVersion=(\d+)/)?.[1] || ''}`);
log(`Done: ${done.size} files, ${(bytes / 2 ** 30).toFixed(2)} GB in ${OUT}; ${missing.size} references not in the game`);
