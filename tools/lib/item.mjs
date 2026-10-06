// One cosmetic item for the viewer, beside the heroes: the models of all its styles with their
// materials, the particle effects they add or put in place of the hero's, into <out>/item.json,
// models/, textures/ and fx/ (the hero's layout), and its inventory icons.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { compressHeroModels } from './compress.mjs';
import { buildBundle } from './hero.mjs';

const exec = promisify(execFile);

// item: an entry of loadCosmetics() items; heroBones: the bone names of the hero who wears it.
export async function buildItem({ game, cli, item, heroBones, out, temp, log = () => {} }) {
  const has = (path) => existsSync(join(game, `${path}_c`));
  rmSync(out, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true });
  for (const d of ['models', 'textures', 'fx']) mkdirSync(join(out, d), { recursive: true });
  mkdirSync(temp, { recursive: true });

  // Every model any style wears, once.
  const paths = [...new Set(item.styles.flatMap((s) => s.models))].filter(has), MODELS = Object.fromEntries(paths.map((p, i) => [`w${i}`, p]));
  const effects = [...new Set(item.styles.flatMap((s) => [...s.effects, ...Object.values(s.particles)]))];
  const snapshots = [...new Set(item.styles.flatMap((s) => Object.values(s.snapshots)))].filter(has);
  const bundle = await buildBundle({ game, cli, out, temp, log, MODELS, kind: () => 'worn', effects, heroBones, extraSnapshots: snapshots });
  const { modelFiles, fxFiles, fxModels, materials, systems, textures, attachments } = bundle;
  const nameOf = Object.fromEntries(Object.entries(MODELS).map(([name, path]) => [path, name]));

  // Icons: the item's and its styles' own, 128 px.
  const icons = {};
  for (const icon of new Set(item.styles.map((s) => s.icon).filter(Boolean))) {
    const vtex = `panorama/images/${icon}_png.vtex`; if (!has(vtex)) continue;
    const dir = join(temp, 'icon', `${Object.keys(icons).length}`), file = `icon${Object.keys(icons).length}.webp`;
    try {
      await exec(cli, ['-i', join(game, `${vtex}_c`), '-d', '-o', join(dir, 'icon.png')], { maxBuffer: 1 << 28 });
      const png = readdirSync(dir).find((f) => f.endsWith('.png')); if (!png) continue;
      const img = await loadImage(readFileSync(join(dir, png))), h = 128, w = Math.round((img.width / img.height) * h), c = createCanvas(w, h);
      c.getContext('2d').drawImage(img, 0, 0, w, h); writeFileSync(join(out, file), await c.encode('webp', 88)); icons[icon] = file;
    } catch (e) { log(`  icon ${icon}: ${e.message.split('\n')[0]}`); }
  }

  const manifest = {
    version: 1, id: item.id, slot: item.slot, models: modelFiles, materials, systems, textures, snapshots: bundle.snapshots, attachments,
    fxModels: Object.fromEntries(Object.entries(fxModels).filter(([, fx]) => fxFiles[fx.name]).map(([path, fx]) => [path, { file: fxFiles[fx.name], clips: fx.clips }])),
    styles: item.styles.map((s) => ({
      name: s.name, icon: icons[s.icon] || null, skin: s.skin,
      models: s.models.map((p) => nameOf[p]).filter((n) => modelFiles[n]),
      effects: s.effects.filter((e) => systems[e]), particles: Object.fromEntries(Object.entries(s.particles).filter(([, to]) => systems[to])),
      snapshots: Object.fromEntries(Object.entries(s.snapshots).filter(([, to]) => bundle.snapshots[to])),
    })),
  };
  writeFileSync(join(out, 'item.json'), JSON.stringify(manifest));
  await compressHeroModels(join(out, 'models'));
  rmSync(temp, { recursive: true, force: true });
  return { models: Object.keys(modelFiles).length, systems: Object.keys(systems).length, icons: Object.keys(icons).length, worn: manifest.styles.some((s) => s.models.length || s.effects.length) };
}
