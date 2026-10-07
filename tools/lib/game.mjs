// What the game says about its heroes: the roster in the game's order, each hero's model, default
// items with their effects, the loadout portrait's light and pedestal, names and lore.
// <game> is the folder with gameinfo.gi and the files of tools/extract-dota.ps1 (game/dota).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseKV, tokens } from './kv1.mjs';

const read = (game, path) => readFileSync(join(game, path), 'utf8');
const ATTRIBUTES = { DOTA_ATTRIBUTE_STRENGTH: 'str', DOTA_ATTRIBUTE_AGILITY: 'agi', DOTA_ATTRIBUTE_INTELLECT: 'int', DOTA_ATTRIBUTE_ALL: 'all' };
// Heroes in the files that are not heroes to pick.
const HIDDEN = new Set(['npc_dota_hero_base', 'npc_dota_hero_target_dummy']);

function localization(game, lang) {
  const all = {};
  for (const file of ['dota', 'abilities', 'hero_lore', 'items']) {
    const path = `resource/localization/${file}_${lang}.txt`;
    if (existsSync(join(game, path))) Object.assign(all, tokens(read(game, path)));
  }
  return all;
}

export function loadGame(game) {
  const roster = parseKV(read(game, 'scripts/npc/npc_heroes.txt')).bases.map((b) => b.replace(/^heroes\//, '').replace(/\.txt$/, ''));
  const itemsGame = parseKV(read(game, 'scripts/items/items_game.txt')).data.items_game, items = itemsGame.items;
  const portraits = parseKV(read(game, 'scripts/npc/portraits_full_body_loadout.txt')).data.DOTAFullBodyLoadoutPortraitInfo || {};
  const loc = { en: localization(game, 'english'), ru: localization(game, 'russian') };
  const text = (key, lang) => { if (!key) return null; const k = key.replace(/^#/, '').toLowerCase(); return loc[lang][k] ?? null; };

  // Default items by hero; the activity modifiers any item of a hero gives (its animations' variants).
  const defaults = {}, tags = {};
  for (const [id, item] of Object.entries(items)) {
    if (!item.used_by_heroes || typeof item.used_by_heroes !== 'object') continue;
    for (const npc of Object.keys(item.used_by_heroes)) for (const [activity, tag] of activityModifiers(item)) (tags[npc] ||= new Set()).add(tag);
    if (item.prefab !== 'default_item') continue;
    for (const npc of Object.keys(item.used_by_heroes)) (defaults[npc] ||= []).push({ id: +id, ...item });
  }

  const heroes = [];
  for (const npc of roster) {
    if (HIDDEN.has(npc) || !existsSync(join(game, `scripts/npc/heroes/${npc}.txt`))) continue;
    const h = parseKV(read(game, `scripts/npc/heroes/${npc}.txt`)).data.DOTAHeroes?.[npc];
    if (!h?.Model) continue;
    const id = npc.replace(/^npc_dota_hero_/, '');
    const abilities = Object.entries(h).filter(([k, v]) => /^Ability\d+$/.test(k) && v && !/^(generic_hidden|special_bonus)/.test(v)).map(([, v]) => v);
    // The look of a set of default items: what they wear by slot, their effects and modifiers.
    const dress = (list) => {
      const wearables = [], effects = [], activities = {}, replace = {};
      for (const item of list.sort((a, b) => a.id - b.id)) {
        // An item without a slot of its own has its prefab's (a default item's: the weapon).
        const slot = item.item_slot || itemsGame.prefabs?.[item.prefab]?.item_slot, owner = item.model_player ? slot || `item${item.id}` : 'hero';
        for (const [k, m] of Object.entries(item.visuals || {})) {
          if (!/^asset_modifier/.test(k) || typeof m !== 'object' || (m.style !== undefined && m.style !== '0')) continue;
          // particle_create adds an effect; particle puts one in place of another (an ability's).
          if (m.type === 'particle_create' && /\.vpcf$/.test(m.modifier || '')) effects.push({ system: m.modifier.replace(/\.vpcf$/, ''), owner });
          if (m.type === 'particle' && /\.vpcf$/.test(m.asset || '') && /\.vpcf$/.test(m.modifier || '')) (replace[slot || 'hero'] ||= {})[m.asset.replace(/\.vpcf$/, '')] = m.modifier.replace(/\.vpcf$/, '');
        }
        const own = activityModifiers(item, '0'); if (own.length && !activities[slot || 'hero']) activities[slot || 'hero'] = own;
        if (!item.model_player || wearables.some((w) => w.slot === owner)) continue;
        wearables.push({ slot: owner, model: item.model_player, name: { en: text(item.item_name, 'en'), ru: text(item.item_name, 'ru') } });
      }
      return { wearables, effects, activities, replace };
    };
    // A persona's default items dress another model of the hero, and those of his abilities, summons,
    // taunts and transformations (Terrorblade's Demon Form) only show while they act: not his look.
    const LOOK = (slot) => !/persona|^ability|ultimate|summon|taunt|voice|shapeshift|hero_base/.test(slot || '');
    const mine = defaults[npc] || [], { wearables, effects, activities, replace } = dress(mine.filter((i) => LOOK(i.item_slot)));
    // Forms: the hero's model in place of his own — a persona's, with the persona's default items, or
    // an item's (Juggernaut's Bladeform Legacy, Earthshaker's Planetfall), with his. Keyed by the item
    // (and the persona's number); the item's own effects and modifiers stay with the item.
    const forms = [];
    for (const [itemId, item] of Object.entries(items)) {
      if (!item.used_by_heroes?.[npc] || item.prefab === 'default_item') continue;
      const modifiers = Object.entries(item.visuals || {}).filter(([k, m]) => /^asset_modifier/.test(k) && m && typeof m === 'object').map(([, m]) => m);
      // A persona's selector, or an item of a persona's slot that changes the persona's model (Anti-Mage's Kirin).
      const persona = modifiers.find((m) => m.type === 'persona')?.persona, ofPersona = /_persona_(\d+)$/.exec(item.item_slot || '')?.[1];
      for (const m of modifiers) {
        if (m.type !== 'entity_model' || m.asset !== npc || !/\.vmdl$/.test(m.modifier || '')) continue;
        if (persona) {
          const own = dress(mine.filter((i) => new RegExp(`_persona_${persona}$`).test(i.item_slot || '')));
          if (!forms.some((f) => f.key === `persona${persona}`)) forms.push({ key: `persona${persona}`, item: +itemId, persona: +persona, model: m.modifier, ...own });
        } else if (!forms.some((f) => f.model === m.modifier)) {
          const own = ofPersona ? { ...dress(mine.filter((i) => new RegExp(`_persona_${ofPersona}$`).test(i.item_slot || ''))), persona: +ofPersona } : { wearables, effects, activities };
          forms.push({ key: `${itemId}${m.style !== undefined ? `.${m.style}` : ''}`, item: +itemId, style: m.style === undefined ? null : +m.style, model: m.modifier, replace, ...own });
        }
      }
    }
    const p = portraits[npc] || {}, cam = p.cameras?.default || {};
    const nums = (v) => (v || '').trim().split(/\s+/).filter(Boolean).map(Number);
    const lighting = p.PortraitLightAngles ? {
      light: { angles: nums(p.PortraitLightAngles), color: nums(p.PortraitLightColor), scale: +(p.PortraitLightScale ?? 1) },
      ambient: { angles: nums(p.PortraitAmbientDirection || '0 0 0'), color: nums(p.PortraitAmbientColor), scale: +(p.PortraitAmbientScale ?? 1) },
      shadow: { color: nums(p.PortraitShadowColor), scale: +(p.PortraitShadowScale ?? 1) },
      camera: { position: nums(cam.PortraitPosition), angles: nums(cam.PortraitAngles), fov: +(cam.PortraitFOV ?? 25) },
    } : null;
    const name = { en: text(npc, 'en') || h.workshop_guide_name || id, ru: text(npc, 'ru') || text(npc, 'en') || h.workshop_guide_name || id };
    heroes.push({
      id, npc, heroId: +(h.HeroID ?? 0), model: h.Model, scale: +(h.ModelScale ?? 1), attribute: ATTRIBUTES[h.AttributePrimary] || 'all',
      roles: (h.Role || '').split(',').filter(Boolean), complexity: +(h.Complexity ?? 0), name,
      hype: { en: text(`${npc}_hype`, 'en'), ru: text(`${npc}_hype`, 'ru') },
      abilities: abilities.map((a) => ({ id: a, name: { en: text(`DOTA_Tooltip_ability_${a}`, 'en'), ru: text(`DOTA_Tooltip_ability_${a}`, 'ru') } })),
      wearables, effects, replace, lighting, pedestal: p.PortraitBackgroundModel || null, activityTags: [...(tags[npc] || [])], activities, forms,
    });
  }
  return { heroes };
}

// An item's activity modifiers ([activity or ALL, tag]), of one style or of all.
export function activityModifiers(item, style = null) {
  return Object.entries(item.visuals || {}).filter(([k, m]) => /^asset_modifier/.test(k) && m?.type === 'activity' && m.modifier && (style === null || m.style === undefined || m.style === style))
    .map(([, m]) => [m.asset || 'ALL', m.modifier]);
}

// The sequences of a model (Source2Viewer-CLI -a dump): name, looping, activity and modifiers.
// Sequences (m_sName, the ASEQ block) carry the activities; plain animations (m_name with flags, the
// ANIM block) fill in those without a sequence. Names are the glTF exporter's animation names.
export function sequences(dump) {
  const list = new Map();
  const scan = (re, flagsAt) => {
    for (const m of dump.matchAll(re)) {
      const name = m[1]; if (list.has(name)) continue;
      const after = m.index + m[0].length, next = dump.slice(after).search(/\n\t\t\tm_s?[Nn]ame = "/), rest = dump.slice(after, next < 0 ? undefined : after + next);
      const acts = /\n\t\t\tm_activityArray = \s*\n\t\t\t\[([\s\S]*?)\n\t\t\t\]/.exec(rest);
      const names = acts ? [...acts[1].matchAll(/m_name = "([^"]+)"/g)].map((a) => a[1]) : [];
      list.set(name, { name, loop: /m_bLooping = true/.test(m[flagsAt]), activity: names[0] || null, modifiers: names.slice(1) });
    }
  };
  scan(/\n\t\t\tm_sName = "([^"]+)"\n\t\t\tm_flags = \s*\n\t\t\t\{([\s\S]*?)\n\t\t\t\}/g, 2);
  scan(/\n\t\t\tm_name = "([^"]+)"\n\t\t\tm_flags = \s*\n\t\t\t\{([\s\S]*?)\n\t\t\t\}/g, 2);
  return [...list.values()];
}

// The animations a viewer wants, one per activity: the plainest sequence (fewest modifiers), for the
// activities of the hero page and the game (the rest — portraits, intros, event and card poses — go).
const KEEP = /^ACT_DOTA_(LOADOUT|IDLE|IDLE_RARE|RUN|ATTACK|ATTACK2|CAST_ABILITY_[1-6]|RAZE_[1-3]|SPAWN|TELEPORT|DISABLED|VICTORY|TAUNT|DIE)$/;
const SKIP = { test: (a) => !KEEP.test(a) };
const ORDER = ['ACT_DOTA_LOADOUT', 'ACT_DOTA_IDLE', 'ACT_DOTA_IDLE_RARE', 'ACT_DOTA_RUN', 'ACT_DOTA_ATTACK', 'ACT_DOTA_ATTACK2'];
const TAIL = ['ACT_DOTA_SPAWN', 'ACT_DOTA_TELEPORT', 'ACT_DOTA_DISABLED', 'ACT_DOTA_VICTORY', 'ACT_DOTA_TAUNT', 'ACT_DOTA_DIE'];
const debut = (s) => +(s.modifiers.includes('debut') || /debut/.test(s.name));
export function pickAnimations(seqs, max = 24, tags = []) {
  const best = new Map();
  for (const s of seqs) {
    if (!s.activity || s.name.startsWith('@') || SKIP.test(s.activity)) continue;
    // Debut sequences are staged for the hero's release film (Kez stands off his pedestal in them).
    const cur = best.get(s.activity), score = s.modifiers.length * 1000 + s.name.length + (debut(s) ? 5000 : 0);
    if (!cur || score < cur.score) best.set(s.activity, { ...s, score });
  }
  const rank = (a) => { const i = ORDER.indexOf(a), j = TAIL.indexOf(a); return i >= 0 ? i : j >= 0 ? 500 + j : 100; };
  const list = [...best.values()].sort((a, b) => rank(a.activity) - rank(b.activity) || a.activity.localeCompare(b.activity)).slice(0, max);
  // The hero page: the loadout spawn once (ACT_DOTA_SPAWN tagged «loadout», or named so), then the loadout idle.
  const spawn = seqs.filter((s) => s.activity === 'ACT_DOTA_SPAWN' && (s.modifiers.includes('loadout') || /loadout/.test(s.name)))
    .sort((a, b) => debut(a) - debut(b) || a.modifiers.length - b.modifiers.length || a.name.length - b.name.length)[0];
  const idle = best.get('ACT_DOTA_LOADOUT') || best.get('ACT_DOTA_IDLE') || list[0];
  // Variants items ask for: the shown activities' sequences with the items' modifiers (Huskar's spear).
  const shown = new Set(list.map((s) => s.activity)), wanted = new Set(tags), picked = new Set(list.map((s) => s.name));
  // Only the items' own (and loadout): game states (injured, aggressive) are not shown; one sequence
  // for each set of modifiers, the game's random alternatives left out.
  wanted.add('loadout');
  const seen = new Set(), variants = seqs.filter((s) => shown.has(s.activity) && !s.name.startsWith('@') && !picked.has(s.name) && !debut(s)
      && s.modifiers.some((m) => m !== 'loadout' && wanted.has(m)) && s.modifiers.every((m) => wanted.has(m)))
    .sort((a, b) => a.name.length - b.name.length)
    .filter((s) => { const k = `${s.activity}|${[...s.modifiers].sort().join('+')}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(({ name, activity, loop, modifiers }) => ({ name, activity, loop, modifiers }));
  return { idle: idle?.name || null, entry: spawn?.name || null, list: list.map(({ name, activity, loop, modifiers }) => ({ name, activity, loop, ...(modifiers.length ? { modifiers } : {}) })), variants };
}

// What a shown animation is made of: a sequence (ASEQ) plays local animations by index into
// m_localSequenceNameArray, which may be sequences again (run_anim → @@run_anim → @run_anim). Events sit
// on any of them (Marci's Red Riding Hood taunt keeps its basket in @marci_red_riding_hood_skip).
// Returns name → the shown animations it belongs to.
function sourcesOf(dump, names) {
  const i = dump.indexOf('m_localSequenceNameArray = '), list = i < 0 ? [] : [...dump.slice(i, dump.indexOf(']', i)).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const refs = new Map();
  for (const m of dump.matchAll(/\n\t\t\tm_sName = "([^"]+)"/g)) {
    const next = dump.indexOf('\n\t\t\tm_sName = "', m.index + 10), body = dump.slice(m.index, next < 0 ? undefined : next), r = /m_localReferenceArray = \[([^\]]*)\]/.exec(body);
    if (r && !refs.has(m[1])) refs.set(m[1], r[1].split(',').map((x) => list[+x]).filter(Boolean));
  }
  const owners = new Map();
  for (const name of names) {
    const stack = [name, `@${name}`, `@@${name}`], seen = new Set();
    while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n); if (!owners.has(n)) owners.set(n, new Set()); owners.get(n).add(name); for (const r of refs.get(n) || []) stack.push(r); }
  }
  return owners;
}

// Props an animation brings in (AE_CL_CREATE_ANIM_SCOPE_PROP: Pudge's clown car, Largo's frogs,
// Ringmaster's box): a model of its own that lives while the animation plays, at the hero or one of
// his attachments, playing the sequence of its own model named by the event's activity.
// names: the hero's animations that are shown; '@'-prefixed sources of a sequence count as it.
export function scopeProps(dump, names) {
  const owners = [...dump.matchAll(/\n\t\t\tm_s?[Nn]ame = "([^"]+)"/g)].map((m) => [m.index, m[1]]), shown = sourcesOf(dump, names), props = [], seen = new Set();
  for (const m of dump.matchAll(/\n(\t+)\{\n\1\tm_nFrame = (-?\d+)([\s\S]*?)\n\1\}/g)) {
    const body = m[3]; if (!body.includes('"AE_CL_CREATE_ANIM_SCOPE_PROP"')) continue;
    const owner = owners.filter(([i]) => i < m.index).pop()?.[1];
    for (const sequence of shown.get(owner) || []) {
    const prop = {
      sequence, frame: +m[2], model: /name = resource:"([^"]+\.vmdl)"/.exec(body)?.[1], attachment: /attachment = "([^"]*)"/.exec(body)?.[1] || null,
      parent: !/parent = false/.test(body), activity: /activity = "([^"]*)"/.exec(body)?.[1] || null,
    };
    const key = JSON.stringify(prop); if (!prop.model || seen.has(key)) continue;
    seen.add(key); props.push(prop);
    }
  }
  return props;
}

// Particle effects an animation starts and stops by its events: AE_CL_CREATE_PARTICLE_EFFECT_CFG
// (the system's own control point configuration by name), AE_CL_CREATE_PARTICLE_EFFECT (control
// points 0 and 1 at attachments given in the event) and AE_CL_STOP_PARTICLE_EFFECT.
export function particleEvents(dump, names) {
  const owners = [...dump.matchAll(/\n\t\t\tm_s?[Nn]ame = "([^"]+)"/g)].map((m) => [m.index, m[1]]), shown = sourcesOf(dump, names), events = [], seen = new Set();
  for (const m of dump.matchAll(/\n(\t+)\{\n\1\tm_nFrame = (-?\d+)([\s\S]*?)\n\1\}/g)) {
    const body = m[3], type = /m_sEventName = "(AE_CL_(?:CREATE|STOP)_PARTICLE_EFFECT(?:_CFG)?)"/.exec(body)?.[1]; if (!type) continue;
    const owner = owners.filter(([i]) => i < m.index).pop()?.[1];
    const system = /name = resource:"([^"]+)\.vpcf"/.exec(body)?.[1]; if (!system) continue;
    for (const sequence of shown.get(owner) || []) {
    const str = (k) => new RegExp(`\\b${k} = "([^"]*)"`).exec(body)?.[1] ?? null, bool = (k) => new RegExp(`\\b${k} = true`).test(body);
    const e = { sequence, cycle: +(/m_flCycle = ([-\d.e]+)/.exec(body)?.[1] ?? 0), system };
    if (type === 'AE_CL_STOP_PARTICLE_EFFECT') Object.assign(e, { stop: true, instantly: bool('stop_instantly') });
    else if (type === 'AE_CL_CREATE_PARTICLE_EFFECT_CFG') Object.assign(e, { config: str('config') || '', stopOnSeqChange: bool('stop_on_seq_change') });
    else Object.assign(e, { stopOnSeqChange: bool('stop_on_seq_change'), points: [[str('attachment_point'), str('attachment_type')], [str('attachment_point_cp1'), str('attachment_type_cp1')]] });
    const key = JSON.stringify(e); if (seen.has(key)) continue;
    seen.add(key); events.push(e);
    }
  }
  return events;
}

// The cosmetics of every hero: his loadout slots, the items for them (his defaults and every
// wearable) with their styles, and the sets they make up. A style: the models worn (the item's own,
// or the style's, and additional ones), the particle effects it adds, the hero's effects and
// snapshots it replaces, its skin. What an item does that is not drawn on the hero (sounds, icons,
// summons) is left out; what it would change and is not done yet (personas, arcanas, animations) is
// named in `unsupported`.
// Unusual effects an item can roll (static attribute "can roll unusual"): the effects of its season's
// list (items_unusual_lists, <season>_unusual_list), the season by its event or by the treasure
// (loot list <season>_…) that drops it or its set. The lists repeat their keys, so they are read raw.
function unusualEffects(game, ig, text) {
  const raw = read(game, 'scripts/items/items_game.txt').replace(/\r/g, '');
  const block = (name) => { const i = raw.search(new RegExp(`\\n\\t"${name}"\\s*\\n\\t\\{`)); if (i < 0) return ''; const j = raw.indexOf('\n\t}', i + 1); return raw.slice(i, j); };
  const lists = {};
  for (const m of block('items_unusual_lists').matchAll(/\n\t\t"(\w+)_unusual_list"[^]*?\n\t\t\}/g)) lists[m[1]] = [...new Set([...m[0].matchAll(/effect: (\d+)/g)].map((e) => +e[1]))];
  const seasons = Object.keys(lists).sort((a, b) => b.length - a.length);
  // Each treasure (a loot list named for a season) and every name in it.
  const drops = new Map();
  for (const m of block('loot_lists').matchAll(/\n\t\t"(\w+)"\s*\n\t\t\{([^]*?)\n\t\t\}/g)) {
    const season = seasons.find((s) => m[1].startsWith(s)); if (!season) continue;
    for (const n of m[2].matchAll(/"([^"\n]+)"/g)) if (!drops.has(n[1])) drops.set(n[1], season);
  }
  // The bundles (sets in the store) an item comes in: treasures drop those by name.
  const setNames = new Map();
  for (const b of Object.values(ig.items)) if (b.prefab === 'bundle' && b.bundle && typeof b.bundle === 'object') for (const n of Object.keys(b.bundle)) setNames.set(n, [...(setNames.get(n) || []), b.name]);
  const particles = ig.attribute_controlled_attached_particles || {};
  return (item) => {
    if (!+item.static_attributes?.['can roll unusual']) return null;
    const event = (item.event_id || '').replace(/^EVENT_ID_/, '').toLowerCase();
    const family = (s) => s.replace(/_\d{4}$/, '');
    const season = seasons.find((s) => event && (event === s || s.startsWith(event))) || drops.get(item.name) || (setNames.get(item.name) || []).map((n) => drops.get(n)).find(Boolean)
      // An older event's item (Frostivus 2018) rolls from the lists its event has now.
      || seasons.find((s) => event && family(s) === family(event));
    const list = (season && lists[season]) || [];
    const effects = list.map((id) => ({ id, system: particles[id]?.system?.replace(/\.vpcf$/, ''), name: text(`Attrib_Particle${id}`) || { en: `#${id}`, ru: `#${id}` } })).filter((e) => e.system);
    return effects.length ? effects : null;
  };
}

export function loadCosmetics(game) {
  // The hero an item is for, short (a pet's loadout places are by it).
  const heroOf = (item) => Object.keys(item.used_by_heroes || {})[0]?.replace(/^npc_dota_hero_/, '');
  const ig = parseKV(read(game, 'scripts/items/items_game.txt')).data.items_game;
  const loc = { en: localization(game, 'english'), ru: localization(game, 'russian') };
  const text = (key) => { if (!key) return null; const k = key.replace(/^#/, '').toLowerCase(); const en = loc.en[k] ?? null; return en || loc.ru[k] ? { en, ru: loc.ru[k] ?? en } : null; };
  const DRAWN = new Set(['particle_create', 'particle', 'particle_snapshot', 'additional_wearable', 'model_skin']);
  // Ability forms (Dragon Knight's dragon, Undying's golem) are not the hero's look; what else is not
  // done yet (other items' models swapped, bodygroups hidden) leaves the item in, as it mostly looks.
  const UNSUPPORTED = new Set(['hero_model_change']);
  const byName = new Map(Object.entries(ig.items).map(([id, i]) => [i.name, +id]));
  const setOf = new Map();
  for (const [key, set] of Object.entries(ig.item_sets || {})) for (const name of Object.keys(set.items || {})) if (byName.has(name)) setOf.set(byName.get(name), key);
  const unusualOf = unusualEffects(game, ig, text);
  const heroes = new Map();
  for (const [id, item] of Object.entries(ig.items)) {
    if (!(item.prefab === 'default_item' || item.prefab === 'wearable') || !item.used_by_heroes || typeof item.used_by_heroes !== 'object') continue;
    const visuals = item.visuals || {}, modifiers = Object.entries(visuals).filter(([k, m]) => /^asset_modifier/.test(k) && m && typeof m === 'object').map(([, m]) => m);
    const styleKeys = visuals.styles ? Object.keys(visuals.styles).sort((a, b) => a - b) : [null], persona = modifiers.find((m) => m.type === 'persona')?.persona;
    const styles = styleKeys.map((s) => {
      const style = s === null ? {} : visuals.styles[s], mine = modifiers.filter((m) => m.style === undefined || m.style === (s ?? '0'));
      const model = style.model_player || item.model_player;
      const icon = (style.alternate_icon !== undefined && visuals.alternate_icons?.[style.alternate_icon]?.icon_path) || item.image_inventory;
      const pairs = (type) => Object.fromEntries(mine.filter((m) => m.type === type && m.asset && m.modifier).map((m) => [m.asset.replace(/\.vpcf$/, ''), m.modifier.replace(/\.vpcf$/, '')]));
      return {
        name: s === null ? null : text(style.name), icon: icon ? icon.toLowerCase() : null,
        models: [model, ...mine.filter((m) => m.type === 'additional_wearable').map((m) => m.asset)].filter((m) => m && /\.vmdl$/.test(m)),
        effects: mine.filter((m) => m.type === 'particle_create' && /\.vpcf$/.test(m.modifier || '')).map((m) => m.modifier.replace(/\.vpcf$/, '')),
        particles: pairs('particle'), snapshots: Object.fromEntries(mine.filter((m) => m.type === 'particle_snapshot' && m.asset && m.modifier).map((m) => [m.asset, m.modifier])),
        skin: +(style.skin ?? mine.find((m) => m.type === 'model_skin')?.skin ?? 0),
        activities: mine.filter((m) => m.type === 'activity' && m.modifier).map((m) => [m.asset || 'ALL', m.modifier]),
        // A companion beside him: a pet (with its loadout place and scale), or the look of a unit he
        // summons (Lone Druid's bear, Juggernaut's healing ward), at a pet's place.
        companion: (() => {
          const pet = mine.find((x) => x.type === 'pet' && /\.vmdl$/.test(x.asset || ''));
          const nums = (v, d) => (typeof v === 'string' ? v.trim().split(/\s+/).map(Number) : d);
          if (pet) return { model: pet.asset, scale: +(pet.loadout_scale ?? 1), offset: nums(pet.loadout_hero_offsets?.[heroOf(item)], nums(pet.loadout_default_offset, [0, 100, 0])) };
          const unit = mine.find((x) => x.type === 'entity_model' && /^npc_dota_(?!hero_)/.test(x.asset || '') && /\.vmdl$/.test(x.modifier || ''));
          // Units are bigger than pets (Lone Druid's bear): a step further out.
          return unit ? { model: unit.modifier, unit: unit.asset, scale: 1, offset: [-20, 150, 0] } : null;
        })(),
        // The hero's form it puts him in (loadGame's forms: a persona's number, or the item's model).
        form: persona ? `persona${persona}` : (() => { const m = mine.find((x) => x.type === 'entity_model' && /^npc_dota_hero_/.test(x.asset || '') && /\.vmdl$/.test(x.modifier || '')); return m ? { npc: m.asset, model: m.modifier } : null; })(),
      };
    });
    const unsupported = [...new Set(modifiers.map((m) => m.type).filter((t) => UNSUPPORTED.has(t)))], unusual = unusualOf(item);
    for (const npc of Object.keys(item.used_by_heroes)) {
      const h = heroes.get(npc) || heroes.set(npc, { items: [] }).get(npc);
      h.items.push({ id: +id, name: text(item.item_name) || { en: item.name, ru: item.name }, slot: item.item_slot || ig.prefabs?.[item.prefab]?.item_slot || null, rarity: item.item_rarity || ig.prefabs?.[item.prefab]?.item_rarity || 'common',
        default: item.prefab === 'default_item', set: setOf.get(+id) || null, styles, ...(unusual ? { unusual } : {}), ...(unsupported.length ? { unsupported } : {}) });
    }
  }
  for (const [npc, h] of heroes) {
    const file = `scripts/npc/heroes/${npc}.txt`;
    const slots = existsSync(join(game, file)) ? Object.values(parseKV(read(game, file)).data.DOTAHeroes?.[npc]?.ItemSlots || {}) : [];
    h.slots = slots.sort((a, b) => a.SlotIndex - b.SlotIndex).map((s) => ({ name: s.SlotName, text: text(s.SlotText) || { en: s.SlotName, ru: s.SlotName }, units: !!s.GeneratesUnits }));
    const ids = new Set(h.items.map((i) => i.id));
    h.sets = Object.entries(ig.item_sets || {}).map(([key, set]) => ({ key, name: text(set.name), items: Object.keys(set.items || {}).map((n) => byName.get(n)).filter((i) => ids.has(i)) }))
      .filter((s) => s.items.length > 1 && h.items.some((i) => i.set === s.key));
  }
  return heroes;
}
