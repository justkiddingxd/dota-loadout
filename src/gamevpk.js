// An outfit for the game itself, as mods are made: a VPK of the game's own compiled files put in place
// of the hero's defaults, for the language folder (game/dota_<language>, -language <language>) — in the
// browser (the site's «To the game») and in node (tools/build-vpk.mjs). What goes in:
//   – each worn item's model (in its style's skin) at its slot's default model, with its effects and
//     its unusual effect in it (particle_cfg_list, as the game's own models have them); the default's
//     effects emptied (particles/dev/empty_particle);
//   – the effects it puts in place of the hero's (an ability's), the models it refits, its ability icons;
//   – the hero's model (an arcana's form, in its skin) with the activity modifiers of his items and
//     kinetic gems made his plain animations.
// data: the hero's game data (tools/lib/gamedata.mjs: heroes/<id>/game.json); file(path): the game's
// compiled file (…_c) or null; zstd(data, size): a zstd decoder (the hero's animations are zstd).
//   const { file, done, left, missing } = await outfitVpk({ data, look, file, zstd });
// done: [{ path, what }]; left: [{ slot, item, reason }]; missing: [path] (files the game has, not here).
import { heroModel, itemModel } from './gamemod.js';
import { writeVpk } from './vpk.js';

const EMPTY = 'particles/dev/empty_particle.vpcf';
export const PETS = ['courier', 'ward'];

export async function outfitVpk({ data, look, file, zstd }) {
  const files = new Map(), done = [], left = [], missing = new Set();
  const get = async (path) => { const p = `${path}_c`; const b = await file(p); if (!b) missing.add(p); return b; };
  const put = (path, bytes, what) => { if (bytes) { files.set(`${path}_c`, bytes); done.push({ path: `${path}_c`, what }); } };
  const particles = (names) => names.map((name) => ({ name, config: data.configs[name] || 'preview' }));
  const on = [], heroFx = [], wornModels = new Map(); let form = null;
  const worn = Object.entries(look.worn || {}).filter(([, w]) => w);
  for (const [slot, [id, style = 0]] of worn) {
    const skip = (reason) => left.push({ slot, item: +id, reason });
    if (PETS.includes(slot)) { skip('pet'); continue; }
    const item = data.items[id]; if (!item) { skip('unknown'); continue; }
    const st = item.styles[style] || item.styles[0], def = data.defaults[item.slot], defFx = def?.effects || [], unusual = data.unusual[look.unusual?.[slot]];
    const fx = st.effects.filter((f) => !defFx.includes(f));
    if (st.form) { form = st.form; heroFx.push(...fx); }
    else if (!st.model) { if (fx.length || unusual) skip('no model'); }
    else if (!def?.model) skip('no default');
    else {
      const src = await get(st.model), extra = [...fx, ...(unusual ? [unusual] : [])];
      if (src) { put(def.model, itemModel(src, { particles: particles(extra), skin: st.skin }), { item: +id, effects: fx.length, unusual: !!unusual }); wornModels.set(st.model, def.model); }
    }
    if (defFx.some((f) => !st.effects.includes(f))) { const empty = await get(EMPTY); for (const f of defFx) if (!st.effects.includes(f)) put(f, empty, { emptied: f }); }
    for (const [asset, modifier] of Object.entries(st.replace)) put(asset, await get(modifier), { effect: modifier });
    for (const [to, from] of Object.entries(st.icons)) { const b = await file(from); if (b) { files.set(to, b); done.push({ path: to, what: { icon: from } }); } else missing.add(from); }
    on.push(...st.activities);
    for (const m of st.extra) skip(`extra model ${m}`);
    if (look.gems?.[slot]) skip('gem');
    if (look.kinetic?.[slot] != null) on.push(...(data.kinetic[look.kinetic[slot]] || []));
  }
  // Models refitted by what is worn: at the default's place, or the worn item's.
  const wornSlots = new Set(worn.map(([, [id]]) => data.items[id]?.slot));
  for (const [, [id, style = 0]] of worn) {
    const st = data.items[id]?.styles[style]; if (!st) continue;
    for (const [asset, modifier] of Object.entries(st.refits)) {
      const at = wornModels.get(asset) || (Object.entries(data.defaults).some(([s, d]) => d.model === asset && !wornSlots.has(s)) ? asset : null);
      if (at) put(at, await get(modifier), { refit: modifier });
    }
  }
  // The hero's model: his form's, moving as his outfit makes him, with the form's effects and skin.
  if (data.model && (on.length || form || heroFx.length)) {
    const src = await get(form?.model || data.model);
    if (src) {
      const r = heroModel(src, on, { zstd });
      const bytes = heroFx.length || form?.skin ? itemModel(r.bytes, { particles: particles(heroFx), skin: form?.skin || 0 }) : r.bytes;
      put(data.model, bytes, { hero: form?.model || data.model, modifiers: [...new Set(on.map(([, m]) => m))], animations: r.changed, effects: heroFx.length });
    }
  }
  return { file: files.size ? writeVpk(files) : null, done, left, missing: [...missing] };
}
