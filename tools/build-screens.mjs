// The heroes' loading screens, as backdrops for the site: those for a hero or sold with his items
// (tools/lib/game.mjs heroScreens). Each into <out>/screens/<id>.webp (1920 px wide at most) with a
// small one for the picker (<id>-s.webp), and each hero's list into <out>/heroes/<hero>/screens.json.
//   node tools/build-screens.mjs [--game <…/dota>] [--cli <Source2Viewer-CLI>] [--out assets] [--jobs 6]
// Screens built before are kept.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { heroScreens, loadGame, localization, screenFile } from './lib/game.mjs';
import { parseKV } from './lib/kv1.mjs';

const exec = promisify(execFile);
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'assets')), cli = resolve(opt('cli', '.cache/vrf-20.0/Source2Viewer-CLI')), jobs = +opt('jobs', 6);
const temp = resolve('.cache/temp/screens');

const ig = parseKV(readFileSync(join(game, 'scripts/items/items_game.txt'), 'utf8')).data.items_game;
const loc = { en: localization(game, 'english'), ru: localization(game, 'russian') };
const text = (key) => { const k = (key || '').replace(/^#/, '').toLowerCase(), en = loc.en[k] ?? null; return en || loc.ru[k] ? { en, ru: loc.ru[k] ?? en } : null; };
const screens = heroScreens(ig).map((s) => ({ ...s, file: screenFile(s.image, (p) => existsSync(join(game, p))) })).filter((s) => s.file);

mkdirSync(join(out, 'screens'), { recursive: true });
const made = new Map(); let next = 0, done = 0;
const webp = async (img, w, quality, file) => { const h = Math.round((img.height / img.width) * w), c = createCanvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h); writeFileSync(file, await c.encode('webp', quality)); return h; };
const worker = async () => {
  while (next < screens.length) {
    const s = screens[next++], big = join(out, 'screens', `${s.id}.webp`), small = join(out, 'screens', `${s.id}-s.webp`);
    try {
      if (!existsSync(big) || !existsSync(small)) {
        const dir = join(temp, String(s.id)); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
        await exec(cli, ['-i', join(game, s.file), '-d', '-o', join(dir, 'x.png')], { maxBuffer: 1 << 28 });
        const png = readdirSync(dir).find((f) => f.endsWith('.png')), img = await loadImage(readFileSync(join(dir, png)));
        await webp(img, Math.min(1920, img.width), 80, big); await webp(img, 400, 75, small); rmSync(dir, { recursive: true, force: true });
      }
      const img = await loadImage(readFileSync(small));
      made.set(s.id, { id: s.id, name: text(s.item.item_name) || { en: s.item.name, ru: s.item.name }, ratio: +(img.width / img.height).toFixed(3) });
    } catch (e) { console.log(`${s.id}: ${e.message.split('\n')[0]}`); }
    if (++done % 50 === 0) console.log(`${done}/${screens.length}`);
  }
};
await Promise.all(Array.from({ length: jobs }, worker));
rmSync(temp, { recursive: true, force: true });

// Each hero's, newest first.
const { heroes } = loadGame(game);
for (const h of heroes) {
  const dir = join(out, 'heroes', h.id); if (!existsSync(dir)) continue;
  const list = screens.filter((s) => s.npcs.includes(h.npc) && made.has(s.id)).sort((a, b) => b.id - a.id).map((s) => made.get(s.id));
  writeFileSync(join(dir, 'screens.json'), JSON.stringify({ version: 1, screens: list }));
}
console.log(`${made.size} of ${screens.length} screens, for ${heroes.length} heroes`);
