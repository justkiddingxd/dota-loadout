// Changes to the game's compiled models for an outfit put into the game as files (a VPK in the
// language folder, as mods are): an item's model with effects of its own in it (its ambient ones, an
// unusual effect), in a skin of its style; the hero's model with what his items' and kinetic gems'
// activity modifiers pick made his plain animations. The game's own models do the first already
// (particle_cfg_list in a model's keyvalues, 68 of them); mods do the second.
import { member, readKV3, T, writeKV3 } from './kv3bin.js';
import { readRERL, readResource, resourceId, writeRERL, writeResource } from './resource.js';

const block = (res, type) => res.blocks.find((b) => b.type === type);
const kv3 = (res, type, change, options) => { const b = block(res, type); if (!b) return; const doc = readKV3(b.data, options); change(doc.root); b.data = writeKV3(doc); };
const set = (obj, name, node) => { const i = obj.value.findIndex(([k]) => k === name); if (i < 0) obj.value.push([name, node]); else obj.value[i][1] = node; };
const str = (value) => ({ type: T.STRING, value });

// Effects in a model: [{ name: 'particles/….vpcf', config: 'preview' }], played on it wherever it is
// (the game starts a model's particle_cfg_list with it); skin: the material group it shows.
export function itemModel(bytes, { particles = [], skin = 0 } = {}) {
  const res = readResource(bytes);
  if (particles.length) {
    const entries = particles.map((p) => `\t\t{\r\n\t\t\tname = resource:"${p.name}"\r\n\t\t\tconfig = "${p.config || 'preview'}"\r\n\t\t},\r\n`).join('');
    kv3(res, 'DATA', (root) => {
      const info = member(root, 'm_modelInfo'), text = member(info, 'm_keyValueText'), old = typeof text?.value === 'string' ? text.value : '';
      const next = !old.trim() ? `<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:vmdlkeys4:version{9f5c1002-f19f-470c-bd42-c3c26c063d33} -->\r\n{\r\n\tparticle_cfg_list =\r\n\t[\r\n${entries}\t]\r\n}\r\n`
        : /particle_cfg_list\s*=\s*\[/.test(old) ? old.replace(/(particle_cfg_list\s*=\s*\[\s*\r?\n)/, `$1${entries}`)
          : old.replace(/\}\s*$/, `\tparticle_cfg_list =\r\n\t[\r\n${entries}\t]\r\n}\r\n`);
      set(info, 'm_keyValueText', str(next));
    });
    // The subasset the list is (as the compiler writes it: one, however many effects).
    kv3(res, 'RED2', (root) => set(root, 'm_SubassetReferences', { type: T.OBJECT, value: [['model_key', { type: T.OBJECT, value: [['particle_cfg_list', { type: T.INT32, value: 1 }]] }]] }));
    const rerl = block(res, 'RERL'), refs = readRERL(rerl.data);
    for (const p of particles) if (!refs.some((r) => r.name === p.name)) refs.push({ id: resourceId(p.name), name: p.name });
    rerl.data = writeRERL(refs);
  }
  // A style's skin: its material group first, the one a model shows by itself.
  if (skin > 0) kv3(res, 'DATA', (root) => { const g = member(root, 'm_materialGroups'); if (g?.value?.[skin]) g.value.unshift(...g.value.splice(skin, 1)); });
  return writeResource(res);
}

// The hero's model as his outfit makes him move: on, the activity modifiers it turns on — [activity
// ('ALL' or ACT_…), modifier]. Each sequence (ASEQ) and animation (ANIM, the same lists) loses them;
// of those then alike (one activity, the same modifiers left), the ones that had most of them stay
// and the others lose their activity: the game's choice with the items on, made the only one.
// options.zstd: a zstd decoder (ANIM is zstd). Returns { bytes, changed, dropped }.
export function heroModel(bytes, on, options = {}) {
  const res = readResource(bytes); let changed = 0, dropped = 0;
  const strip = (list) => {
    const seqs = [];
    for (const d of list) {
      const acts = member(d, 'm_activityArray'), names = (acts?.value || []).map((a) => member(a, 'm_name')?.value);
      const act = names.find((n) => typeof n === 'string' && n.startsWith('ACT_')); if (!act) continue;
      const lit = (m) => on.some(([a, x]) => x === m && (a === 'ALL' || a === act));
      const kept = acts.value.filter((a) => { const n = member(a, 'm_name')?.value; return n === act || !lit(n); });
      seqs.push({ d, acts, hits: names.filter((n) => n !== act && lit(n)).length, key: `${act}|${names.filter((n) => n !== act && !lit(n)).sort().join(',')}`, kept });
    }
    const best = new Map(); for (const s of seqs) best.set(s.key, Math.max(best.get(s.key) ?? 0, s.hits));
    for (const s of seqs) {
      if (s.hits < best.get(s.key)) { set(s.d, 'm_activityArray', { type: T.ARRAY, value: [] }); dropped++; continue; }
      if (s.kept.length !== s.acts.value.length) { s.acts.value = s.kept; changed++; }
    }
  };
  kv3(res, 'ASEQ', (root) => strip(member(root, 'm_localS1SeqDescArray')?.value || []));
  kv3(res, 'ANIM', (root) => strip(member(root, 'm_animArray')?.value || []), options);
  return { bytes: writeResource(res), changed, dropped };
}
