// One hero for the viewer, from the game's files by Source 2 Viewer's command line
// (github.com/ValveResourceFormat/ValveResourceFormat, MIT): the hero's model with the animations a
// viewer wants, his default items and the loadout pedestal, their materials, the items' particle
// effects, model attachments and the loadout portrait's light, into <out>/hero.json, models/,
// textures/ and fx/. Also needs cwebp (libwebp) on PATH for the lossless textures.
//
// Models: glTF with only the chosen animations, textures stripped (the viewer draws them with its own
// copy of Dota's hero shader). Materials: the decompiled .vmat parameters and textures, packed into
// colour+alpha, normal and a masks texture. Effects: the .vpcf files as JSON, their textures with
// sprite sheets rebuilt at Valve's UV rectangles, particle snapshots and model attachments.
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { compressHeroModels } from './compress.mjs';
import { compact, readGlb, readPng, writeGlb } from './files.mjs';
import { particleEvents, pickAnimations, scopeProps, sequences } from './game.mjs';
import { parseKV3 } from '../kv3.mjs';

// The viewer's card for sprites without a texture of their own (src/fx.js Library.texture).
const GLOW = 'materials/particle/particle_glow_05.vtex';
const exec = promisify(execFile);

// game: the game's folder (…/dota, with gameinfo.gi); cli: Source2Viewer-CLI; hero: an entry of
// loadGame().heroes; out: the hero's folder; temp: a scratch folder of its own.
export async function buildHero({ game, cli, hero, out, temp, log = () => {} }) {
  const gameinfo = join(game, 'gameinfo.gi');
  const has = (path) => existsSync(join(game, `${path}_c`));
  const run = async (args) => (await exec(cli, args, { encoding: 'utf8', maxBuffer: 1 << 30 })).stdout;
  const decompile = async (path, target) => { mkdirSync(dirname(target), { recursive: true }); await run(['-i', join(game, `${path}_c`), '--game', gameinfo, '-d', '-o', target]); };
  rmSync(out, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true });
  for (const d of ['models', 'textures', 'fx']) mkdirSync(join(out, d), { recursive: true });
  mkdirSync(temp, { recursive: true });

  // ---------------------------------------------------------------- models and animations
  const MODELS = { hero: hero.model };
  for (const w of hero.wearables) if (has(w.model) && w.model !== hero.model) MODELS[w.slot] = w.model;
  if (hero.pedestal && has(hero.pedestal)) MODELS.pedestal = hero.pedestal;
  if (!has(hero.model)) throw new Error(`no ${hero.model}`);
  const heroDump = await run(['-i', join(game, `${hero.model}_c`), '-a']);
  const animations = pickAnimations(sequences(heroDump), 24, hero.activityTags || []);
  const wanted = [...new Set([animations.entry, animations.idle, ...animations.list.map((a) => a.name), ...animations.variants.map((a) => a.name)].filter(Boolean))];

  // Props of those animations, one model file each, with the clips the events ask for: the sequence
  // named by the event's activity, or having it as activity, or the model's only one.
  const props = scopeProps(heroDump, wanted).filter((p) => has(p.model)), propModels = {};
  for (const p of props) {
    if (!propModels[p.model]) {
      const seqs = sequences(await run(['-i', join(game, `${p.model}_c`), '-a'])).filter((s) => !s.name.startsWith('@') && s.name !== 'bindPose');
      propModels[p.model] = { name: `prop${Object.keys(propModels).length}`, seqs, clips: new Set() };
    }
    const m = propModels[p.model], s = m.seqs.find((x) => x.name === p.activity) || m.seqs.find((x) => p.activity && x.activity === p.activity) || (m.seqs.length === 1 ? m.seqs[0] : null);
    p.clip = s?.name || null; p.loop = !!s?.loop; if (s) m.clips.add(s.name);
  }
  for (const m of Object.values(propModels)) MODELS[m.name] = Object.keys(propModels).find((k) => propModels[k] === m);
  const isProp = (name) => /^prop\d+$/.test(name);
  const events = particleEvents(heroDump, wanted).filter((e) => has(`${e.system}.vpcf`));

  // The default items' replacements of the hero's effects: built, and swapped in by the viewer.
  const replace = hero.replace || {}, replacing = Object.values(replace).flatMap((r) => Object.values(r));
  const bundle = await buildBundle({ game, cli, out, temp, log, MODELS, kind: (name) => (name === 'hero' || name === 'pedestal' ? name : isProp(name) ? 'prop' : 'worn'), effects: [...hero.effects.map((e) => e.system), ...events.map((e) => e.system), ...replacing],
    animations: (name) => (isProp(name) ? [...Object.values(propModels).find((m) => m.name === name).clips] : name === 'hero' ? wanted : null) });
  const { modelFiles, fxFiles, fxModels, materials, systems, textures, snapshots, attachments, skins } = bundle;
  // Props are not worn: they leave the models list for one of their own.
  const propFiles = {};
  for (const name of Object.keys(modelFiles).filter(isProp)) { propFiles[name] = modelFiles[name]; delete modelFiles[name]; }
  if (!modelFiles.hero) throw new Error(`${hero.model} not exported`);
  const effects = hero.effects.filter((e) => modelFiles[e.owner] || e.owner === 'hero');

  const manifest = {
    version: 1, id: hero.id, name: hero.name, models: modelFiles,
    props: props.map((p) => ({ file: propFiles[propModels[p.model].name], sequence: p.sequence, frame: p.frame, clip: p.clip, loop: p.loop, attachment: p.attachment, parent: p.parent })).filter((p) => p.file),
    animations: { idle: animations.idle, entry: animations.entry, list: animations.list, variants: animations.variants, defaults: hero.activities || {} }, materials, lighting: hero.lighting,
    effects: effects.filter((e) => systems[e.system]).map((e) => ({ system: e.system, owner: modelFiles[e.owner] ? e.owner : 'hero' })),
    events: events.filter((e) => systems[e.system]),
    fxModels: Object.fromEntries(Object.entries(fxModels).filter(([, fx]) => fxFiles[fx.name]).map(([path, fx]) => [path, { file: fxFiles[fx.name], clips: fx.clips }])),
    ...(Object.keys(replace).length ? { replace: Object.fromEntries(Object.entries(replace).map(([slot, r]) => [slot, Object.fromEntries(Object.entries(r).filter(([, to]) => systems[to]))])) } : {}),
    systems, textures, snapshots, attachments, ...(Object.keys(skins).length ? { skins } : {}),
  };
  writeFileSync(join(out, 'hero.json'), JSON.stringify(manifest));
  // Last, once the snapshots were fitted to the plain models: pack the models.
  await compressHeroModels(join(out, 'models'));
  rmSync(temp, { recursive: true, force: true });
  return { models: [...Object.keys(modelFiles), ...Object.keys(propFiles), ...Object.keys(fxFiles)], events: events.length, materials: Object.keys(materials).length, systems: Object.keys(systems).length, animations: animations.list.length };
}

// Models with their materials, and particle systems with their textures, snapshots and the models
// they draw, into <out>/models, textures and fx: the part of a hero's build an item's shares.
// MODELS: name → model path; kind(name): hero, worn, prop or pedestal; animations(name): the clips
// to export for the hero and props; effects: particle systems; heroBones: the hero's bone names
// (filled from the hero's model when it is among MODELS), for leaving out models that are not his;
// extraSnapshots: particle snapshots no system names (an item's, in place of the hero's).
export async function buildBundle({ game, cli, out, temp, log = () => {}, MODELS: models, kind, animations = () => null, effects = [], heroBones = new Set(), extraSnapshots = [] }) {
  const gameinfo = join(game, 'gameinfo.gi');
  const has = (path) => existsSync(join(game, `${path}_c`));
  const run = async (args) => (await exec(cli, args, { encoding: 'utf8', maxBuffer: 1 << 30 })).stdout;
  const decompile = async (path, target) => { mkdirSync(dirname(target), { recursive: true }); await run(['-i', join(game, `${path}_c`), '--game', gameinfo, '-d', '-o', target]); };
  const MODELS = { ...models };
  // Particle effects: the items' ambient ones and those the animations start by their events. The
  // systems are read first: the models their C_OP_RenderModels draw (Arc Warden's taunt cane and hat)
  // are exported with the hero's, each with the clip of the activity the renderer plays.
  const systems = {}, textureSet = new Set(), snapshotSet = new Set();
  const collect = (o) => { if (Array.isArray(o)) o.forEach(collect); else if (o && typeof o === 'object') Object.values(o).forEach(collect); else if (typeof o === 'string') { if (o.endsWith('.vtex')) textureSet.add(o); if (o.endsWith('.vsnap')) snapshotSet.add(o); } };
  const loadSystem = async (path) => {
    const key = path.replace(/\.vpcf$/, ''); if (systems[key] || !has(`${key}.vpcf`)) return;
    const file = join(temp, 'vpcf', `${key}.vpcf`); systems[key] = {};
    try { await decompile(`${key}.vpcf`, file); systems[key] = parseKV3(readFileSync(file, 'utf8')); } catch (e) { log(`  ${key}: ${e.message.split('\n')[0]}`); delete systems[key]; return; }
    collect(systems[key]);
    for (const child of systems[key].m_Children || []) if (child.m_ChildRef) await loadSystem(child.m_ChildRef);
  };
  for (const system of effects) await loadSystem(system);
  for (const path of extraSnapshots) snapshotSet.add(path);
  const fxModels = {};
  for (const def of Object.values(systems)) for (const r of def.m_Renderers || []) {
    if (r._class !== 'C_OP_RenderModels' || r.m_bDisableOperator) continue;
    for (const m of r.m_ModelList || []) if (m.m_model && has(m.m_model)) {
      const fx = (fxModels[m.m_model] ||= { name: `fx${Object.keys(fxModels).length}`, activities: new Set(), clips: {} });
      if (r.m_bAnimated) fx.activities.add(r.m_ActivityName || 'ACT_DOTA_IDLE');
    }
  }
  for (const [path, fx] of Object.entries(fxModels)) {
    if (fx.activities.size) {
      const seqs = sequences(await run(['-i', join(game, `${path}_c`), '-a'])).filter((s) => !s.name.startsWith('@') && s.name !== 'bindPose');
      for (const act of fx.activities) { const s = seqs.filter((x) => x.activity === act || x.name === act).sort((a, b) => a.modifiers.length - b.modifiers.length || a.name.length - b.name.length)[0] || seqs[0]; if (s) fx.clips[act] = s.name; }
    }
    MODELS[fx.name] = path;
  }
  const isFx = (name) => /^fx\d+$/.test(name);

  // Resource external references (the RERL block) of a compiled file.
  const references = (path) => {
    const b = readFileSync(join(game, `${path}_c`)), v = new DataView(b.buffer, b.byteOffset);
    const refs = [];
    for (let i = 0, at = 8 + v.getUint32(8, true); i < v.getUint32(12, true); i++, at += 12) {
      if (b.toString('latin1', at, at + 4) !== 'RERL') continue;
      const data = at + 4 + v.getUint32(at + 4, true), entries = data + v.getUint32(data, true), count = v.getUint32(data + 4, true);
      for (let k = 0; k < count; k++) { const e = entries + 16 * k, s = e + 8 + v.getUint32(e + 8, true); refs.push(b.toString('utf8', s, b.indexOf(0, s))); }
    }
    return refs;
  };

  const materials = {}, modelFiles = {}, skins = {};
  for (const [name, path] of Object.entries(MODELS)) {
    const dir = join(temp, 'glb', name), file = join(dir, `${name}.glb`); mkdirSync(dir, { recursive: true });
    const args = ['-i', join(game, `${path}_c`), '--game', gameinfo, '-o', file, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_textures_adapt'];
    // The skeleton only comes with animations exported; items take the hero's, so only the hero keeps clips.
    // Models drawn by particles keep all their clips (they are small): which one an effect plays is
    // the viewer's choice, by the renderer's activity.
    const clips = kind(name) === 'hero' || kind(name) === 'prop' ? animations(name) : null;
    if (isFx(name)) args.push('--gltf_export_animations');
    else if (kind(name) !== 'pedestal') args.push('--gltf_export_animations', '--gltf_animation_list', clips?.length ? clips.join(',') : '-');
    try { await run(args); } catch (e) { log(`  ${name}: ${path} not exported (${e.message.split('\n')[0]})`); continue; }
    if (!existsSync(file)) { log(`  ${name}: ${path} not exported`); continue; }
    const { json, bin } = readGlb(file);
    if (!json.meshes?.length) continue;
    // Items are bone-merged onto the hero: one that shares no bone with him is someone else (a summon, a ward).
    const bones = (json.skins || []).flatMap((s) => s.joints.map((j) => json.nodes[j].name?.toLowerCase()));
    if (name === 'hero') bones.forEach((b) => heroBones.add(b));
    else if (kind(name) === 'worn' && !isFx(name) && json.skins?.length && !bones.some((b) => heroBones.has(b))) { log(`  ${name}: ${path} shares no bone with the hero, left out`); continue; }
    // The normal maps come adapted to glTF by the exporter; everything else is read from the material.
    for (const material of json.materials || []) {
      const normal = json.images?.[json.textures?.[material.normalTexture?.index]?.source]?.uri;
      materials[material.name] = { ...materials[material.name], normalFile: normal ? join(dir, normal) : null };
    }
    for (const m of json.materials || []) { for (const k of ['pbrMetallicRoughness', 'normalTexture', 'occlusionTexture', 'emissiveTexture']) delete m[k]; delete m.extensions; }
    delete json.images; delete json.textures; delete json.samplers; if (kind(name) !== 'hero' && kind(name) !== 'prop' && !isFx(name)) delete json.animations;
    for (const n of json.nodes || []) if (n.name?.includes('/')) n.name = basename(n.name).replace(/\.vmdl_c.*/, '');
    for (const m of json.meshes || []) if (m.name?.includes('/')) m.name = basename(m.name);
    writeGlb(join(out, 'models', `${name}.glb`), json, compact(json, bin));
    modelFiles[name] = `models/${name}.glb`;
    for (const ref of references(path)) if (ref.endsWith('.vmat')) materials[basename(ref, '.vmat')] = { ...materials[basename(ref, '.vmat')], vmat: ref };
    // Skins (material groups): the default group's materials and each other's in their place, built
    // too, with the default's normal map (the same mesh and UVs). skins[name][k - 1] for skin k.
    const groups = [...(await run(['-i', join(game, `${path}_c`), '-a'])).matchAll(/\n\t\t\{\n\t\t\tm_name = "[^"]*"\n\t\t\tm_materials = \n\t\t\t\[([\s\S]*?)\n\t\t\t\]/g)]
      .map((g) => [...g[1].matchAll(/resource:"([^"]+\.vmat)"/g)].map((m) => m[1]));
    if (groups.length > 1 && groups[0].length) {
      skins[name] = groups.slice(1).map((g) => Object.fromEntries(groups[0].map((p, i) => [basename(p, '.vmat'), basename(g[i] || p, '.vmat')])));
      for (const g of groups.slice(1)) g.forEach((p, i) => { const k = basename(p, '.vmat'), from = materials[basename(groups[0][i] || '', '.vmat')]; materials[k] = { ...materials[k], vmat: p, normalFile: materials[k]?.normalFile || from?.normalFile || null }; });
    }
  }
  const fxFiles = {};
  for (const name of Object.keys(modelFiles).filter(isFx)) { fxFiles[name] = modelFiles[name]; delete modelFiles[name]; }

  // ---------------------------------------------------------------- materials
  const image = async (file) => loadImage(readFileSync(file));
  const channel = (img, w, h = w) => { const c = createCanvas(w, h).getContext('2d'); c.drawImage(img, 0, 0, w, h); return c.getImageData(0, 0, w, h).data; };
  const webp = async (canvas, file, quality = 90) => { writeFileSync(file, await canvas.encode('webp', quality)); return basename(file); };
  // Truly lossless WebP (VP8L) by cwebp: the canvas's quality 100 is still lossy VP8 with half-resolution
  // colour, which bleeds one mask channel into another along thin trims, and it is a quarter bigger.
  let losslessCount = 0;
  const lossless = async (canvas, file) => {
    const png = join(temp, `lossless${losslessCount++}.png`); writeFileSync(png, await canvas.encode('png'));
    await exec('cwebp', ['-quiet', '-lossless', '-z', '9', '-exact', png, '-o', file]); rmSync(png); return basename(file);
  };
  // The pedestal fills the bottom of the view at a few hundred pixels: 512 is enough for it.
  const sizeCap = (name) => (/pedestal/.test(name) ? 512 : 2048);
  const vector = (text) => (text || '').replace(/[[\]]/g, '').trim().split(/\s+/).filter(Boolean).map(Number);
  const shared = new Map();
  for (const [name, entry] of Object.entries(materials)) {
    if (!entry.vmat || !has(entry.vmat)) { delete materials[name]; continue; }
    const dir = join(temp, 'vmat', name);
    try { await decompile(entry.vmat, join(dir, `${name}.vmat`)); } catch { delete materials[name]; continue; }
    const text = readFileSync(join(dir, `${name}.vmat`), 'utf8'), p = Object.fromEntries([...text.matchAll(/^\t"([^"]+)"\t"([^"]*)"/gm)].map((m) => [m[1], m[2]]));
    const pick = (suffix) => { const f = readdirSync(dir).find((x) => x.endsWith(`${suffix}.png`)); return f ? join(dir, f) : null; };
    const scroll = /float2\(([-.\d]+),([-.\d]+)\)/.exec(text.split('"DynamicParams"')[1] || '');
    // The colour: <name>_color.png from the hero shader; …_g_tcolor_<hash>.png from the others
    // (global_lit_simple); or a constant colour for a material without a texture.
    // A colour given as a constant ([r g b a] in the .vmat) wins: the compiled …_g_tcolor_… texture then
    // only carries the see-through mask in its alpha, its colour a white placeholder (Arc Warden's
    // additive layer, Dark Seer's rope).
    const tcolor = readdirSync(dir).find((x) => /_g_tcolor_[0-9a-f]+\.png$/.test(x));
    const constant = /^\[[-\d.\s]+\]$/.test(p.TextureColor || '') ? vector(p.TextureColor) : null;
    const colorFile = pick('_color') || (!constant && tcolor && join(dir, tcolor)) || (p.TextureColor && !constant && existsSync(join(dir, basename(p.TextureColor))) ? join(dir, basename(p.TextureColor)) : null);
    // A constant colour only for a layer with its own mask (Marci's eye shadow); others without a
    // texture (Kez's grappling rope) are ability meshes the game keeps hidden.
    // An additive layer of a constant colour is drawn too (glass: Pudge's clown car, Arc Warden's
    // helmets — reflections, rim and glints over what lies behind).
    const maskFile = constant && !colorFile ? (tcolor && join(dir, tcolor)) || pick('_trans') : null;
    // crystal.vfx (Hoodwink's and Ogre Magi's glass): a see-through tinted colour, at g_flOpacityScale.
    const crystal = p.shader === 'crystal.vfx';
    const flat = !colorFile && !maskFile && constant && (p.F_ADDITIVE_BLEND === '1' || crystal);
    if (!colorFile && !maskFile && !flat) { log(`  ${name}: no colour texture (${p.shader})`); delete materials[name]; continue; }
    // Colour with the alpha-test mask in alpha. Textures need not be square: the colour keeps its own
    // shape, the masks below are stretched to squares, which keeps their UVs.
    const original = colorFile ? await image(colorFile) : await (async () => {
      const m = flat ? null : await image(maskFile), k = createCanvas(m?.width || 4, m?.height || 4), x = k.getContext('2d');
      x.fillStyle = `rgba(${constant.slice(0, 3).map((v) => Math.round(Math.min(1, v) * 255)).join(',')},${crystal ? +(p.g_flOpacityScale ?? 0.5) : 1})`; x.fillRect(0, 0, k.width, k.height);
      // The mask's alpha (…_g_tcolor_…) or its grey (…_trans) becomes the colour's alpha below, through _trans or here.
      if (tcolor && maskFile === join(dir, tcolor)) { const a = channel(m, k.width, k.height), d = x.getImageData(0, 0, k.width, k.height); for (let i = 0; i < a.length; i += 4) d.data[i + 3] = a[i + 3]; x.putImageData(d, 0, 0); }
      return k;
    })();
    const fit = Math.min(1, sizeCap(name) / Math.max(original.width, original.height));
    const c = createCanvas(Math.round(original.width * fit), Math.round(original.height * fit)), cc = c.getContext('2d'); cc.drawImage(original, 0, 0, c.width, c.height);
    // global_lit_simple tints the colour (Kez's blade smear).
    const tint = vector(p.g_vColorTint).slice(0, 3);
    if (tint.length === 3 && tint.some((v) => v !== 1)) { cc.globalCompositeOperation = 'multiply'; cc.fillStyle = `rgb(${tint.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`; cc.fillRect(0, 0, c.width, c.height); cc.globalCompositeOperation = 'source-over'; }
    const trans = pick('_trans');
    if (trans) { const a = channel(await image(trans), c.width, c.height), d = cc.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < a.length; i += 4) d.data[i + 3] = a[i]; cc.putImageData(d, 0, 0); }
    // Masks: R detail (where the fire shows), G self-illumination, B rim light; saved lossless (lossy
    // WebP halves the colour resolution and bleeds one mask into another along thin trims).
    // Masks: R detail, G self-illumination, B rim, A where the diffuse warp applies (all of it without one).
    const ms = Math.min(c.width, 512), layers = await Promise.all(['_detailmask', '_selfillummask', '_rimmask', '_diffusemask'].map(async (s) => (pick(s) ? channel(await image(pick(s)), ms) : null)));
    const specLayers = await Promise.all(['_specmask', '_metalnessmask', '_basetintmask'].map(async (s) => (pick(s) ? channel(await image(pick(s)), ms) : null)));
    const pack = async (list, file) => {
      if (!list.some(Boolean)) return null;
      const canvas = createCanvas(ms, ms), ctx = canvas.getContext('2d'), d = ctx.createImageData(ms, ms);
      for (let i = 0; i < d.data.length; i += 4) { for (let k = 0; k < 3; k++) d.data[i + k] = list[k] ? list[k][i] : 0; d.data[i + 3] = list[3] ? list[3][i] : 255; }
      ctx.putImageData(d, 0, 0); return lossless(canvas, file);
    };
    // Specular texture: R specular, G metalness, B «tint specular by base colour» (Dota's masks).
    const masks = await pack(layers, join(out, 'textures', `${name}_masks.webp`)), specular = await pack(specLayers, join(out, 'textures', `${name}_specular.webp`));
    const normal = entry.normalFile && existsSync(entry.normalFile) ? readPng(entry.normalFile) : null, ns = normal && Math.min(normal.width, 1024, sizeCap(name)), n = normal && createCanvas(ns, ns);
    // The normal's blue channel (rebuilt from red and green in the viewer) carries the specular exponent mask.
    if (n) { const nc = n.getContext('2d'); nc.drawImage(normal, 0, 0, ns, ns); const exponent = pick('_specexp') && channel(await image(pick('_specexp')), ns), d = nc.getImageData(0, 0, ns, ns);
      for (let i = 0; i < d.data.length; i += 4) d.data[i + 2] = exponent ? exponent[i] : 255; nc.putImageData(d, 0, 0); }
    // The fresnel warp (R rim, G colour, B specular by the angle to the eye), shared by materials.
    const warp = /"g_tFresnelWarp"\s+"([^"]+)\.vtex"/.exec(text)?.[1], warpName = warp ? basename(warp).replace(/_tga_|_psd_|_png_/, '_') : null;
    if (warp && !shared.has(warpName) && has(`${warp}.vtex`)) {
      const wdir = join(temp, 'warp', warpName); await decompile(`${warp}.vtex`, join(wdir, 'warp.png'));
      const f = readdirSync(wdir).find((x) => x.endsWith('.png')); if (f) shared.set(warpName, await lossless(readPng(join(wdir, f)), join(out, 'textures', `${warpName}.webp`)));
    }
    // The diffuse warp (F_DIFFUSE_WARP): the light's ramp by half-Lambert, shared.
    const diffuseWarp = p.F_DIFFUSE_WARP === '1' && /"g_tDiffuseWarp"\s+"([^"]+)\.vtex"/.exec(text)?.[1], diffuseName = diffuseWarp ? `${basename(diffuseWarp).replace(/_tga_|_psd_|_png_/, '_')}_warp` : null;
    if (diffuseWarp && !shared.has(diffuseName) && has(`${diffuseWarp}.vtex`)) {
      const wdir = join(temp, 'dwarp', diffuseName); await decompile(`${diffuseWarp}.vtex`, join(wdir, 'warp.png'));
      const f = readdirSync(wdir).find((x) => x.endsWith('.png')); if (f) shared.set(diffuseName, await lossless(readPng(join(wdir, f)), join(out, 'textures', `${diffuseName}.webp`)));
    }
    // The cube map (F_SPECULAR_CUBE_MAP): its six faces in a strip, in the game's axes +X −X +Y −Y +Z −Z
    // (rt lf bk ft up dn), 128 px each; shared.
    const cube = p.F_SPECULAR_CUBE_MAP === '1' && /"g_tCubeMap(?:Exterior)?"\s+"([^"]+)\.vtex"/.exec(text)?.[1], cubeName = cube ? `${basename(cube).replace(/_tga_|_psd_|_png_/, '_')}_cube` : null;
    if (cube && !shared.has(cubeName) && has(`${cube}.vtex`)) {
      const cdir = join(temp, 'cube', cubeName); await decompile(`${cube}.vtex`, join(cdir, 'cube.png'));
      const faces = ['rt', 'lf', 'bk', 'ft', 'up', 'dn'].map((s) => readdirSync(cdir).find((x) => x.endsWith(`_${s}.png`)));
      if (faces.every(Boolean)) {
        const size = 128, strip = createCanvas(size * 6, size), sc = strip.getContext('2d');
        for (const [i, f] of faces.entries()) sc.drawImage(await image(join(cdir, f)), i * size, 0, size, size);
        shared.set(cubeName, await webp(strip, join(out, 'textures', `${cubeName}.webp`), 92));
      }
    }
    const detailName = p.TextureDetail && !/default_detail/.test(p.TextureDetail) ? basename(p.TextureDetail).replace(/\.\w+$/, '') : null;
    if (detailName && !shared.has(detailName)) { const f = pick(detailName) || join(dir, basename(p.TextureDetail)); if (existsSync(f)) { const d = await image(f), dc = createCanvas(Math.min(d.width, 1024), Math.min(d.height, 1024)); dc.getContext('2d').drawImage(d, 0, 0, dc.width, dc.height); shared.set(detailName, await webp(dc, join(out, 'textures', `${detailName}.webp`))); } }
    materials[name] = {
      color: await webp(c, join(out, 'textures', `${name}_color.webp`)), masks, specular,
      normal: n ? await webp(n, join(out, 'textures', `${name}_normal.webp`), 92) : null, detail: detailName ? shared.get(detailName) || null : null, fresnel: warpName ? shared.get(warpName) || null : null,
      detailMode: +(p.F_DETAIL || 0), detailScale: vector(p.g_vDetailTexCoordScale).slice(0, 2), detailScroll: scroll ? [+scroll[1], +scroll[2]] : [0, 0], detailBlend: +(p.g_flDetailBlendFactor ?? 1),
      rimColor: vector(p.g_vRimLightColor).slice(0, 3), rimScale: +(p.g_flRimLightScale ?? 0), specColor: vector(p.g_vSpecularColor).slice(0, 3), specScale: +(crystal ? p.g_flSpecularIntensity ?? 1 : p.g_flSpecularScale ?? 1),
      diffuseWarp: diffuseName ? shared.get(diffuseName) || undefined : undefined,
      cube: cubeName ? shared.get(cubeName) || undefined : undefined, cubeScale: cubeName ? +(p.g_flCubeMapScalar ?? (p.g_flCubeMapScalarExterior !== undefined ? p.g_flCubeMapScalarExterior / 6 : 1)) : undefined, cubeByMetalness: p.F_MASK_CUBE_MAP_BY_METALNESS === '1' || undefined,
      specExponent: +(p.g_flSpecularExponent ?? 16), alphaTest: p.F_ALPHA_TEST === '1' ? +(p.g_flAlphaTestReference ?? 0.5) : 0, translucent: p.F_TRANSLUCENT === '1' || crystal || undefined, additive: p.F_ADDITIVE_BLEND === '1' || undefined,
    };
  }

  // ---------------------------------------------------------------- effects
  // Particle textures; sprite sheets come out of the CLI as frames cropped to their content, put back
  // at their own rectangles so the sheet's UVs are Valve's.
  const textures = {};
  // A sprite card without a texture, or with one the game does not have (the seasonal unusual
  // effects' light_glow_01), draws the soft glow the viewer takes for it: it comes along.
  const sprites = Object.values(systems).flatMap((s) => (s.m_Renderers || []).filter((r) => /Sprites|Ropes|Trails/.test(r._class)));
  if (sprites.some((r) => { const t = r.m_vecTexturesInput?.[0]?.m_hTexture || r.m_hTexture; return !t || !has(t); })) textureSet.add(GLOW);
  for (const vtex of [...textureSet].sort()) {
    if (!has(vtex)) continue;
    const base = basename(vtex, '.vtex'), dir = join(temp, 'vtex', base), name = vtex.replace(/^materials\/particle\//, '').replace(/\.vtex$/, '').replace(/\//g, '__');
    try {
      await decompile(vtex, join(dir, `${base}.vtex`));
      const info = await run(['-i', join(game, `${vtex}_c`), '-b', 'DATA']);
      const width = +/Width\s+=\s+(\d+)/.exec(info)[1], height = +/Height\s+=\s+(\d+)/.exec(info)[1];
      const rect = (t, kind) => { const m = new RegExp(`\\[\\d+\\.\\d+\\.0\\] ${kind}\\s+=\\s+\\{ \\( ([-\\d.]+), ([-\\d.]+) \\), \\( ([-\\d.]+), ([-\\d.]+) \\) \\}`).exec(t); return m ? m.slice(1, 5).map(Number) : null; };
      const seqs = [], parts = info.split(/\[Sequence (\d+)\]:/);
      for (let i = 1; i < parts.length; i += 2) {
        const t = parts[i + 1], frames = [];
        for (const f of t.split(/\[Sequence \d+ Frame \d+\]:/).slice(1)) { const uv = rect(f, 'uvUncropped'); if (uv) frames.push({ time: +(/m_flDisplayTime\s+=\s+([\d.]+)/.exec(f)?.[1] ?? 1), uv, crop: rect(f, 'uvCropped') || uv }); }
        seqs[+parts[i]] = { clamp: /m_bClamp\s+=\s+True/.test(t), frames };
      }
      let img;
      if (seqs.length) {
        const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
        for (const [s, seq] of seqs.entries()) for (const [f, frame] of (seq?.frames || []).entries()) {
          const file = [join(dir, `${base}_seq${s}_${f}.png`), join(dir, `${base}_seq${s}.png`)].find(existsSync); if (!file) continue;
          ctx.drawImage(await image(file), Math.round(frame.crop[0] * width), Math.round(frame.crop[1] * height));
        }
        img = canvas;
      } else img = await image(join(dir, `${base}.png`));
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height)), final = createCanvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
      final.getContext('2d').drawImage(img, 0, 0, final.width, final.height);
      // Small textures losslessly: soft gradients (a spotlight's cone) are blown up over the whole
      // screen, where lossy WebP's faint blocks turn into clouds.
      const small = Math.max(final.width, final.height) <= 256;
      textures[vtex] = { file: small ? await lossless(final, join(out, 'fx', `${name}.webp`)) : await webp(final, join(out, 'fx', `${name}.webp`), 92), sequences: seqs.length ? seqs.filter(Boolean) : null };
    } catch (e) { log(`  ${vtex}: ${e.message.split('\n')[0]}`); }
  }

  // Snapshots: points on the model with their bones (or rigid, without).
  const snapshots = {};
  for (const path of [...snapshotSet].sort()) {
    if (!has(path)) continue;
    const text = (await run(['-i', join(game, `${path}_c`), '-a'])).split('--- Data for block "SNAP" ---')[1] || '', attributes = {};
    for (const m of text.matchAll(/- Attribute (\w+) \((\w+)\) -\n([\s\S]*?)(?=\n- Attribute|$)/g)) {
      const rows = m[3].trim().split('\n').filter((l) => l.trim());
      if (m[2] === 'float3' || m[2] === 'vector') attributes[m[1]] = rows.map((r) => (r.match(/[-\d.eE+]+/g) || []).map(Number));
      else if (m[2] === 'skinning') attributes[m[1]] = rows.map((r) => [...r.matchAll(/\(([^:()]*): ([-\d.eE+]+)\)/g)].filter((x) => x[1]).map((x) => [x[1], +x[2]]));
    }
    snapshots[path] = attributes;
  }

  // Rigid snapshots (no bone weights) hold points in one bone's space: the bone is found by fitting
  // the points to the models' vertices in the bind pose.
  const rigid = Object.values(snapshots).filter((s) => !s.skinning?.length && s.position?.length);
  if (rigid.length) {
    const S2G = new Matrix4().compose(new Vector3(), new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, -Math.PI / 2, 'YXZ')), new Vector3(0.0254, 0.0254, 0.0254)), G2S = S2G.clone().invert();
    const floats = (json, bin, index) => { const a = json.accessors[index], v = json.bufferViews[a.bufferView], k = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], start = (v.byteOffset || 0) + (a.byteOffset || 0);
      return new Float32Array(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * k * 4)); };
    const vertices = [], frames = new Map();
    for (const name of Object.keys(modelFiles).filter((k) => kind(k) === 'hero' || kind(k) === 'worn')) {
      const { json, bin } = readGlb(join(out, modelFiles[name]));
      for (const mesh of json.meshes || []) for (const p of mesh.primitives) { const f = floats(json, bin, p.attributes.POSITION), step = Math.max(1, Math.floor(f.length / 3 / 4000)) * 3; for (let i = 0; i < f.length; i += step) vertices.push(new Vector3(f[i], f[i + 1], f[i + 2]).applyMatrix4(G2S)); }
      for (const skin of json.skins || []) { const ibm = floats(json, bin, skin.inverseBindMatrices);
        skin.joints.forEach((joint, k) => { const bone = json.nodes[joint].name; if (!frames.has(bone)) frames.set(bone, G2S.clone().multiply(new Matrix4().fromArray(ibm, k * 16).invert()).multiply(new Matrix4().makeScale(0.0254, 0.0254, 0.0254))); }); }
    }
    const nearest = (p) => { let d = Infinity; for (const v of vertices) d = Math.min(d, v.distanceToSquared(p)); return Math.sqrt(d); };
    for (const snapshot of rigid) {
      const points = snapshot.position.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 64)) === 0);
      let best = null;
      for (const [bone, frame] of frames) { const error = points.reduce((sum, p) => sum + nearest(new Vector3(...p).applyMatrix4(frame)), 0) / points.length; if (!best || error < best.error) best = { bone, error }; }
      if (best && best.error < 6) snapshot.bone = best.bone;
    }
  }

  // Attachments of every model (bone, offset in inches and rotation in the bone's space).
  const attachments = {};
  for (const name of Object.keys(modelFiles).filter((k) => kind(k) !== 'prop')) {
    const text = await run(['-i', join(game, `${MODELS[name]}_c`), '-a']), list = {};
    for (const m of text.matchAll(/m_attachments =\s*\[/g)) {
      let depth = 0, end = m.index + m[0].length - 1;
      for (let i = end; i < text.length; i++) { if (text[i] === '[') depth++; else if (text[i] === ']' && --depth === 0) { end = i; break; } }
      try {
        for (const e of parseKV3(`{ a = ${text.slice(m.index + m[0].length - 1, end + 1)} }`).a) {
          const v = e.value, k = v.m_nInfluences;
          list[v.m_name] = { bones: v.m_influenceNames.slice(0, k), offsets: v.m_vInfluenceOffsets.slice(0, k), rotations: v.m_vInfluenceRotations.slice(0, k), weights: v.m_influenceWeights.slice(0, k) };
        }
      } catch { /* a model without readable attachments keeps none */ }
    }
    attachments[name] = list;
  }

  return { modelFiles, fxFiles, fxModels, materials, systems, textures, snapshots, attachments, skins };
}
