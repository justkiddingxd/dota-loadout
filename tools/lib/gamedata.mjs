// A hero's game data for an outfit put into the game as files (src/gamevpk.js): his model, his default
// items' models and effects by slot, and each of his items by style — its model and skin, its effects,
// the effects and models it puts in place of others, its ability icons, its activity modifiers, the
// form it puts him in — with the unusual effects and kinetic gems there are, and the control point
// configuration each effect plays in a model with ('preview', as the game's own models have them).
// Paths are the game's, lower case, without _c; files: the compiled ones (…_c) it needs.
import { member, readKV3 } from '../../src/kv3bin.js';
import { readResource } from '../../src/resource.js';

export const EMPTY = 'particles/dev/empty_particle.vpcf';
const lc = (p) => p.toLowerCase().replace(/\\/g, '/');

// game: { has(compiledPath), read(compiledPath) → bytes | null, zstd }; configs: a Map shared between heroes.
export function gameData(ig, npc, model, game, configs = new Map()) {
  const files = new Set(), slotOf = (item) => item.item_slot || ig.prefabs?.[item.prefab]?.item_slot || null;
  const modsOf = (item, key) => Object.values(item.visuals || {}).filter((m) => m && typeof m === 'object' && m.type && (m.style === undefined || m.style === key));
  const effects = (mods) => mods.filter((m) => m.type === 'particle_create' && !m.asset && /\.vpcf$/i.test(m.modifier || '') && m.spawn_in_loadout_only !== '1').map((m) => lc(m.modifier));
  const need = (path) => { files.add(`${path}_c`); return path; };
  // An ability icon's file as the game names it (…_png.vtex_c mostly).
  const icon = (name) => ['_png', '_psd', '_tga', ''].map((s) => `panorama/images/spellicons/${name}${s}.vtex_c`).find((p) => game.has(p)) || null;
  const used = new Set();
  const configOf = (name) => {
    if (!configs.has(name)) {
      let config = 'preview';
      try {
        const b = game.read(`${name}_c`), doc = b && readKV3(readResource(b).blocks.find((x) => x.type === 'DATA').data, { zstd: game.zstd });
        const names = (member(doc?.root, 'm_controlPointConfigurations')?.value || []).map((c) => member(c, 'm_name')?.value);
        if (names.length && !names.includes('preview')) config = names[0];
      } catch { /* the default */ }
      configs.set(name, config);
    }
    used.add(name); return configs.get(name);
  };

  const defaults = {};
  for (const item of Object.values(ig.items)) {
    if (item.prefab !== 'default_item' || !item.used_by_heroes?.[npc] || defaults[slotOf(item)]) continue;
    defaults[slotOf(item)] = { model: item.model_player ? lc(item.model_player) : null, effects: effects(modsOf(item, '0')) };
  }
  const items = {};
  for (const [id, item] of Object.entries(ig.items)) {
    if (item.prefab === 'default_item' || !item.used_by_heroes?.[npc]) continue;
    const keys = item.visuals?.styles ? Object.keys(item.visuals.styles).sort((a, b) => a - b) : ['0'];
    items[id] = { slot: slotOf(item), styles: keys.map((key) => {
      const st = item.visuals?.styles?.[key] || {}, mods = modsOf(item, key), pairs = (type, ext) => mods.filter((m) => m.type === type && ext.test(m.asset || '') && ext.test(m.modifier || ''));
      const skin = +(st.skin ?? mods.find((m) => m.type === 'model_skin')?.skin ?? 0) || 0, entity = mods.find((m) => m.type === 'entity_model' && m.asset === npc && /\.vmdl$/i.test(m.modifier || ''));
      const own = st.model_player || item.model_player, fx = effects(mods);
      for (const f of fx) configOf(f);
      const icons = {};
      for (const m of mods) if (m.type === 'ability_icon' && m.asset && m.modifier) { const from = icon(m.modifier); if (from) { icons[icon(m.asset) || `panorama/images/spellicons/${m.asset}_png.vtex_c`] = from; files.add(from); } }
      return {
        model: entity || !own ? null : need(lc(own)), skin, effects: fx,
        form: entity ? { model: need(lc(entity.modifier)), skin } : null,
        replace: Object.fromEntries(pairs('particle', /\.vpcf$/i).map((m) => [lc(m.asset), need(lc(m.modifier))])),
        refits: Object.fromEntries(pairs('model', /\.vmdl$/i).map((m) => [lc(m.asset), need(lc(m.modifier))])),
        icons, activities: mods.filter((m) => m.type === 'activity' && m.modifier).map((m) => [m.asset || 'ALL', m.modifier]),
        extra: mods.filter((m) => m.type === 'additional_wearable' && m.asset).map((m) => lc(m.asset)),
      };
    }) };
  }
  if (Object.values(defaults).some((d) => d.effects.length)) need(EMPTY);
  if (model) need(lc(model));
  const unusual = Object.fromEntries(Object.entries(ig.attribute_controlled_attached_particles || {}).filter(([, p]) => /\.vpcf$/i.test(p?.system || '')).map(([k, p]) => [k, lc(p.system)]));
  for (const s of Object.values(unusual)) configOf(s);
  const kinetic = Object.fromEntries(Object.entries(ig.asset_modifiers || {}).map(([k, e]) => [k, Object.values(e).filter((m) => m?.type === 'activity' && m.modifier).map((m) => [m.asset || 'ALL', m.modifier])]).filter(([, a]) => a.length));
  return { data: { hero: npc, model: model ? lc(model) : null, defaults, items, unusual, kinetic, configs: Object.fromEntries([...used].map((n) => [n, configs.get(n)])) }, files };
}
