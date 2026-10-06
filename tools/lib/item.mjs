// One cosmetic item for the viewer, beside the heroes: the models of all its styles with their
// materials, the particle effects they add or put in place of the hero's, into <out>/item.json,
// models/, textures/ and fx/ (the hero's layout), and its inventory icons.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { compressHeroModels } from './compress.mjs';
import { pickAnimations, sequences } from './game.mjs';
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
  // Companions (pets, summoned units' looks) stand on their own: their skeleton, and the clip they
  // idle in (loadout, else idle, else the first).
  const companions = [...new Set(item.styles.map((s) => s.companion?.model).filter(Boolean))].filter(has), clipOf = {};
  for (const [i, path] of companions.entries()) {
    const { stdout } = await exec(cli, ['-i', join(game, `${path}_c`), '-a'], { encoding: 'utf8', maxBuffer: 1 << 30 });
    const seqs = sequences(stdout).filter((s) => !s.name.startsWith('@') && s.name !== 'bindPose'), picked = pickAnimations(seqs);
    MODELS[`prop${i}`] = path; clipOf[`prop${i}`] = picked.idle || seqs.find((s) => s.loop)?.name || seqs[0]?.name || null;
  }
  // With the unusual effects it can roll (worn on it whatever the style).
  const effects = [...new Set([...item.styles.flatMap((s) => [...s.effects, ...Object.values(s.particles)]), ...(item.unusual || []).map((u) => u.system)])];
  const snapshots = [...new Set(item.styles.flatMap((s) => Object.values(s.snapshots)))].filter(has);
  const bundle = await buildBundle({ game, cli, out, temp, log, MODELS, kind: (name) => (/^prop/.test(name) ? 'prop' : 'worn'), animations: (name) => (clipOf[name] ? [clipOf[name]] : null), effects, heroBones, extraSnapshots: snapshots });
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
    version: 1, id: item.id, slot: item.slot, models: modelFiles, materials, systems, textures, snapshots: bundle.snapshots, attachments, ...(Object.keys(bundle.skins).length ? { skins: bundle.skins } : {}),
    fxModels: Object.fromEntries(Object.entries(fxModels).filter(([, fx]) => fxFiles[fx.name]).map(([path, fx]) => [path, { file: fxFiles[fx.name], clips: fx.clips }])),
    ...(item.unusual?.some((u) => systems[u.system]) ? { unusual: item.unusual.filter((u) => systems[u.system]) } : {}),
    styles: item.styles.map((s) => ({
      name: s.name, icon: icons[s.icon] || null, skin: s.skin, activities: s.activities || [], form: s.form || null,
      companion: (() => { const n = s.companion && nameOf[s.companion.model]; return n && modelFiles[n] ? { model: n, clip: clipOf[n], offset: s.companion.offset, scale: s.companion.scale } : null; })(),
      models: s.models.map((p) => nameOf[p]).filter((n) => modelFiles[n]),
      effects: s.effects.filter((e) => systems[e]), particles: Object.fromEntries(Object.entries(s.particles).filter(([, to]) => systems[to])),
      snapshots: Object.fromEntries(Object.entries(s.snapshots).filter(([, to]) => bundle.snapshots[to])),
    })),
  };
  writeFileSync(join(out, 'item.json'), JSON.stringify(manifest));
  await compressHeroModels(join(out, 'models'));
  rmSync(temp, { recursive: true, force: true });
  return { models: Object.keys(modelFiles).length, systems: Object.keys(systems).length, icons: Object.keys(icons).length, worn: manifest.styles.some((s) => s.models.length || s.effects.length || s.activities.length || s.form || s.companion) };
}
