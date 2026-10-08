// Effigies' pedestals, for the site's statues (the viewer's statue()): the game's pedestal of each
// stuff into <out>/effigies/<stuff>/ (pedestal.json, models/, textures/), its top's height with it —
// the statue stands on it.
//   node tools/build-effigies.mjs [--game <…/dota>] [--cli <Source2Viewer-CLI>] [--out assets]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readGlb } from './lib/files.mjs';
import { buildBundle } from './lib/hero.mjs';
import { compressHeroModels } from './lib/compress.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const game = resolve(opt('game', '.cache/steam/game/dota')), out = resolve(opt('out', 'assets')), cli = resolve(opt('cli', '.cache/vrf-20.0/Source2Viewer-CLI'));

export const EFFIGIES = {
  gold: 'models/heroes/pedestal/mesh/effigy_pedestal_fm16.vmdl',
  frost: 'models/heroes/pedestal/effigy_pedestal_frost_radiant.vmdl',
  jade: 'models/heroes/pedestal/pedestal_effigy_jade.vmdl',
  stone: 'models/heroes/pedestal/effigy_pedestal_default/effigy_pedestal_default_radiant.vmdl',
};

// The highest point of a model's positions near its middle (glTF: y up, metres).
function top(file) {
  const { json, bin } = readGlb(file); let best = -Infinity;
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) {
    const acc = json.accessors[p.attributes.POSITION], view = json.bufferViews[acc.bufferView], stride = view.byteStride || 12;
    for (let i = 0; i < acc.count; i++) {
      const o = (view.byteOffset || 0) + (acc.byteOffset || 0) + i * stride, x = bin.readFloatLE(o), y = bin.readFloatLE(o + 4), z = bin.readFloatLE(o + 8);
      if (Math.hypot(x, z) < 0.25 && y > best) best = y;
    }
  }
  return best;
}

for (const [stuff, path] of Object.entries(EFFIGIES)) {
  if (!existsSync(join(game, `${path}_c`))) { console.log(`${stuff}: not in the game's files`); continue; }
  const dir = join(out, 'effigies', stuff), temp = resolve('.cache/temp', `effigy-${stuff}`);
  rmSync(dir, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true });
  for (const d of ['models', 'textures', 'fx']) mkdirSync(join(dir, d), { recursive: true });
  const bundle = await buildBundle({ game, cli, out: dir, temp, log: console.log, MODELS: { pedestal: path }, kind: () => 'pedestal' });
  const model = bundle.modelFiles.pedestal; if (!model) { console.log(`${stuff}: no model`); continue; }
  const height = top(join(dir, model));
  await compressHeroModels(join(dir, 'models'));
  writeFileSync(join(dir, 'pedestal.json'), JSON.stringify({ version: 1, model, materials: bundle.materials, top: Number.isFinite(height) ? +height.toFixed(4) : 0 }));
  rmSync(temp, { recursive: true, force: true }); rmSync(join(dir, 'fx'), { recursive: true, force: true });
  console.log(`${stuff}: top ${height.toFixed(3)} m`);
}
