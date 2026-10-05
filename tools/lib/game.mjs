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
  const items = parseKV(read(game, 'scripts/items/items_game.txt')).data.items_game.items;
  const portraits = parseKV(read(game, 'scripts/npc/portraits_full_body_loadout.txt')).data.DOTAFullBodyLoadoutPortraitInfo || {};
  const loc = { en: localization(game, 'english'), ru: localization(game, 'russian') };
  const text = (key, lang) => { if (!key) return null; const k = key.replace(/^#/, '').toLowerCase(); return loc[lang][k] ?? null; };

  // Default items by hero.
  const defaults = {};
  for (const [id, item] of Object.entries(items)) {
    if (item.prefab !== 'default_item' || !item.used_by_heroes) continue;
    for (const npc of Object.keys(item.used_by_heroes)) (defaults[npc] ||= []).push({ id: +id, ...item });
  }

  const heroes = [];
  for (const npc of roster) {
    if (HIDDEN.has(npc) || !existsSync(join(game, `scripts/npc/heroes/${npc}.txt`))) continue;
    const h = parseKV(read(game, `scripts/npc/heroes/${npc}.txt`)).data.DOTAHeroes?.[npc];
    if (!h?.Model) continue;
    const id = npc.replace(/^npc_dota_hero_/, '');
    const abilities = Object.entries(h).filter(([k, v]) => /^Ability\d+$/.test(k) && v && !/^(generic_hidden|special_bonus)/.test(v)).map(([, v]) => v);
    const wearables = [], effects = [];
    // A persona's default items dress another model of the hero: they are not the hero's look.
    for (const item of (defaults[npc] || []).sort((a, b) => a.id - b.id).filter((i) => !/persona/.test(i.item_slot || ''))) {
      const owner = item.model_player ? item.item_slot || `item${item.id}` : 'hero';
      for (const [k, m] of Object.entries(item.visuals || {})) {
        if (!/^asset_modifier/.test(k) || typeof m !== 'object') continue;
        if ((m.type === 'particle_create' || m.type === 'particle') && /\.vpcf$/.test(m.modifier || '')) effects.push({ system: m.modifier.replace(/\.vpcf$/, ''), owner });
      }
      if (!item.model_player || wearables.some((w) => w.slot === owner)) continue;
      wearables.push({ slot: owner, model: item.model_player, name: { en: text(item.item_name, 'en'), ru: text(item.item_name, 'ru') } });
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
      wearables, effects, lighting, pedestal: p.PortraitBackgroundModel || null,
    });
  }
  return { heroes };
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
export function pickAnimations(seqs, max = 24) {
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
  return { idle: idle?.name || null, entry: spawn?.name || null, list: list.map(({ name, activity, loop }) => ({ name, activity, loop })) };
}

// Props an animation brings in (AE_CL_CREATE_ANIM_SCOPE_PROP: Pudge's clown car, Largo's frogs,
// Ringmaster's box): a model of its own that lives while the animation plays, at the hero or one of
// his attachments, playing the sequence of its own model named by the event's activity.
// names: the hero's animations that are shown; '@'-prefixed sources of a sequence count as it.
export function scopeProps(dump, names) {
  const owners = [...dump.matchAll(/\n\t\t\tm_s?[Nn]ame = "([^"]+)"/g)].map((m) => [m.index, m[1]]), wanted = new Set(names), props = [], seen = new Set();
  for (const m of dump.matchAll(/\n(\t+)\{\n\1\tm_nFrame = (-?\d+)([\s\S]*?)\n\1\}/g)) {
    const body = m[3]; if (!body.includes('"AE_CL_CREATE_ANIM_SCOPE_PROP"')) continue;
    const owner = owners.filter(([i]) => i < m.index).pop()?.[1]?.replace(/^@+/, '');
    if (!wanted.has(owner)) continue;
    const prop = {
      sequence: owner, frame: +m[2], model: /name = resource:"([^"]+\.vmdl)"/.exec(body)?.[1], attachment: /attachment = "([^"]*)"/.exec(body)?.[1] || null,
      parent: !/parent = false/.test(body), activity: /activity = "([^"]*)"/.exec(body)?.[1] || null,
    };
    const key = JSON.stringify(prop); if (!prop.model || seen.has(key)) continue;
    seen.add(key); props.push(prop);
  }
  return props;
}
