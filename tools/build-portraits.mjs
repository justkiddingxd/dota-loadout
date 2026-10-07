// The site's pictures of the heroes, from the game's panorama images: each hero's tall portrait of
// the hero picker (card.webp), wide portrait (portrait.webp) and small icon (icon.webp) into his
// folder, the attributes' icons into <out>/attributes/, and the prismatic gem's picture into <out>/gems/
// (gem.webp, and gem-mask.webp: where and how its colour goes).
//   node tools/build-portraits.mjs --game <…/dota> --cli <Source2Viewer-CLI> [--out assets]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'assets')), cli = resolve(opt('cli', '.cache/vrf-20.0/Source2Viewer-CLI'));
const temp = resolve('.cache/temp/portraits');

// A panorama image as webp (lossless for the small ones), or false when the game lacks it.
let n = 0;
async function picture(path, file, lossless = false) {
  if (!existsSync(join(game, `${path}_c`))) return false;
  const dir = join(temp, String(n++)); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  await exec(cli, ['-i', join(game, `${path}_c`), '-d', '-o', join(dir, 'x.png')], { maxBuffer: 1 << 26 });
  const png = readdirSync(dir).find((f) => f.endsWith('.png')); if (!png) return false;
  const img = await loadImage(readFileSync(join(dir, png))), c = createCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0);
  writeFileSync(file, lossless ? await c.encode('webp', 100) : await c.encode('webp', 90)); rmSync(dir, { recursive: true, force: true });
  return true;
}

const { heroes } = JSON.parse(readFileSync(join(out, 'heroes/index.json'), 'utf8'));
let made = 0;
for (const h of heroes) {
  const npc = `npc_dota_hero_${h.id}`, dir = join(out, 'heroes', h.id);
  const got = await Promise.all([
    picture(`panorama/images/heroes/selection/${npc}_png.vtex`, join(dir, 'card.webp')),
    picture(`panorama/images/heroes/${npc}_png.vtex`, join(dir, 'portrait.webp')),
    picture(`panorama/images/heroes/icons/${npc}_png.vtex`, join(dir, 'icon.webp'), true),
  ]);
  if (!got.every(Boolean)) console.log(`${h.id}: ${['card', 'portrait', 'icon'].filter((_, i) => !got[i]).join(', ')} missing`);
  made += got.filter(Boolean).length;
}
mkdirSync(join(out, 'attributes'), { recursive: true });
for (const [key, name] of [['str', 'strength'], ['agi', 'agility'], ['int', 'intelligence'], ['all', 'all']]) await picture(`panorama/images/primary_attribute_icons/primary_attribute_icon_${name}_psd.vtex`, join(out, 'attributes', `${key}.webp`), true);
mkdirSync(join(out, 'gems'), { recursive: true });
await picture('panorama/images/econ/sockets/gem_color_png.vtex', join(out, 'gems', 'gem.webp'), true);
await picture('panorama/images/econ/sockets/gem_color_mask_png.vtex', join(out, 'gems', 'gem-mask.webp'), true);
rmSync(temp, { recursive: true, force: true });
console.log(`${made} pictures for ${heroes.length} heroes`);
