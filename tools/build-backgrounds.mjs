// The site's backdrops, from the game's own backgrounds (panorama/images/backgrounds): the dashboard's
// smoke, and the seasonal scenes (Crownfall's street, the Heroes' Hoards). Each into
// <out>/backgrounds/<key>.webp (2560 px wide at most), its layers drawn over each other, and
// <out>/backgrounds/index.json listing them with their names.
//   node tools/build-backgrounds.mjs --game <…/dota> --cli <Source2Viewer-CLI> [--out assets]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'assets')), cli = resolve(opt('cli', '.cache/vrf-20.0/Source2Viewer-CLI'));
const temp = resolve('.cache/temp/backgrounds');

// Key, names, the game's images (bottom first), and where the scene's floor is (0 top, 1 bottom):
// the site lines the pedestal up with it.
const BACKGROUNDS = [
  { key: 'dashboard', name: { en: 'Dashboard', ru: 'Главное меню' }, layers: ['dashboard_background_png'], floor: 0.82 },
  { key: 'mist', name: { en: 'Mist', ru: 'Туман' }, layers: ['generic_background_png'], floor: 0.82 },
  { key: 'crownfall', name: { en: 'Crownfall', ru: 'Crownfall' }, layers: ['cc2024_dashboard_backround_png'], floor: 0.86 },
  { key: 'winter', name: { en: 'Winter Cache', ru: 'Зимний тайник' }, layers: ['collectors_cache_winter_2025_jpg'], floor: 0.8 },
  { key: 'cosmic', name: { en: 'Cosmic Hoard', ru: 'Космический клад' }, layers: ['cosmic_heroes_hoard_2025_background_psd', 'cosmic_heroes_hoard_2025_foreground_psd'], floor: 0.86 },
  { key: 'spring', name: { en: 'Spring Hoard', ru: 'Весенний клад' }, layers: ['heroes_hoard_spring_2025_backgound_png'], floor: 0.88 },
  { key: 'monster', name: { en: 'Monster Hoard', ru: 'Клад чудовищ' }, layers: ['monster_hoard_2026_background_png'], floor: 0.86 },
];

async function image(name) {
  const file = join(game, `panorama/images/backgrounds/${name}.vtex_c`); if (!existsSync(file)) return null;
  const dir = join(temp, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  await exec(cli, ['-i', file, '-d', '-o', join(dir, 'x.png')], { maxBuffer: 1 << 28 });
  const png = readdirSync(dir).find((f) => f.endsWith('.png')); return png ? loadImage(readFileSync(join(dir, png))) : null;
}

mkdirSync(join(out, 'backgrounds'), { recursive: true });
const made = [];
for (const b of BACKGROUNDS) {
  const layers = (await Promise.all(b.layers.map(image))).filter(Boolean); if (!layers.length) { console.log(`${b.key}: not in the game's files`); continue; }
  const base = layers[0], w = Math.min(2560, base.width), h = Math.round((base.height / base.width) * w), c = createCanvas(w, h), x = c.getContext('2d');
  for (const l of layers) x.drawImage(l, 0, 0, w, h);
  writeFileSync(join(out, 'backgrounds', `${b.key}.webp`), await c.encode('webp', 80));
  made.push({ key: b.key, name: b.name, file: `${b.key}.webp`, width: w, height: h, floor: b.floor });
  console.log(`${b.key}: ${w}×${h}`);
}
writeFileSync(join(out, 'backgrounds', 'index.json'), JSON.stringify({ version: 1, backgrounds: made }));
rmSync(temp, { recursive: true, force: true });
