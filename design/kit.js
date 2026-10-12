// What the design prototypes share, and no look of their own: the viewer and the outfit (the
// library's HeroViewer and Loadout), the address kept in sync, names in the reader's language, the
// catalog's questions (what a slot shows, an item's picture), a few icons drawn as SVG.
import { Raycaster, Vector2, Vector3 } from 'three';
import { HeroViewer, Loadout } from '../src/index.js';

const stored = (() => { try { return localStorage.getItem('loadout-lang'); } catch { return null; } })();
export const lang = stored || (/^(ru|uk|be|kk)/i.test(navigator.language) ? 'ru' : 'en');
export const say = (o) => (o ? o[lang] || o.en || '' : '');
export const RARITY = { common: '#b0c3d9', uncommon: '#5e98d9', rare: '#4b69ff', mythical: '#8847ff', legendary: '#d32ce6', immortal: '#e4ae39', arcana: '#ade55c', ancient: '#eb4b4b', seasonal: '#fff34f' };
export const RARITY_NAME = {
  ru: { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', mythical: 'Мифический', legendary: 'Легендарный', immortal: 'Бессмертный', arcana: 'Аркана', ancient: 'Древний', seasonal: 'Сезонный' },
  en: { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythical: 'Mythical', legendary: 'Legendary', immortal: 'Immortal', arcana: 'Arcana', ancient: 'Ancient', seasonal: 'Seasonal' },
};
export const rarityName = (r) => RARITY_NAME[lang][r] || r;
export const ATTRIBUTE = { ru: { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсал' }, en: { str: 'Strength', agi: 'Agility', int: 'Intelligence', all: 'Universal' } };

// Icons: 24×24, drawn with the current colour.
const PATHS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13"/>',
  turn: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.5 3.6-3.4M16.5 7H20m-2-2 2 2-2 2m0 6 2 2-2 2"/>',
};
export const icon = (name, size = 20) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

export const h = (tag, props = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') { for (const [p, x] of Object.entries(v)) e.style.setProperty(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), x); } else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); }
  e.append(...children.flat().filter((c) => c != null && c !== false));
  return e;
};

// The kit: start(canvas, { onChange, onProgress }) loads the hero the address names (or one) and
// keeps the address up with what he wears.
const _p = new Vector3(), _ndc = new Vector2(), _ray = new Raycaster();

export async function start(canvas, { onChange = () => {}, onProgress = () => {}, onLoading = () => {}, viewer: options = {} } = {}) {
  const viewer = new HeroViewer(canvas, { assets: new URL('/', location.href).href, onProgress, ...options });
  const look = new Loadout(viewer);
  const heroes = await look.heroes();
  globalThis.__loadout = viewer;
  const kit = {
    viewer, look, heroes,
    get hero() { return heroes.find((x) => x.id === look.hero) || null; },
    get catalog() { return look.catalog; },
    // The slots of the form he is in, in the game's order.
    slots() { return (look.catalog?.slots || []).filter((s) => look.applies(s.name)); },
    item(id) { return look.catalog?.items[id] || null; },
    // What a slot shows: its worn item, else its default; and the style.
    shown(slot) { const w = look.worn[slot]; return w ? w[0] : look.catalog?.slots.find((s) => s.name === slot)?.items.find((id) => look.catalog.items[id].default) ?? null; },
    styleOf(slot) { return look.worn[slot]?.[1] || 0; },
    picture(id, style = 0) { const it = kit.item(id), s = it?.styles[style]?.icon ? it.styles[style] : it?.styles.find((x) => x.icon); return s ? `/items/${id}/${s.icon}` : null; },
    portrait: (id, kind = 'card') => `/heroes/${id}/${kind}.webp`,
    // Puts an item on (null: the slot's default), then tells the page.
    async wear(slot, id, style = 0) { const it = kit.item(id); await look.wear(slot, it?.default ? null : id, style); write(); onChange('wear'); },
    async open(id) { onLoading(true); await look.show(id); onLoading(false); write(); onChange('hero'); },
    // A link to this outfit.
    get link() { return `${location.origin}${location.pathname}${look.address}`; },
    // The slots whose items are on his body (a taunt or an emblem is not).
    bodySlots() { return kit.slots().filter((s) => viewer.hero?.slotMeshes(s.name).length); },
    // Where a slot's item is on screen now (page pixels): the middle of its vertices as he is posed,
    // or, given a side, of the part nearest that side (a pair of bracers: the near arm). Null if unseen.
    anchor(slot, side) {
      const meshes = viewer.hero?.slotMeshes(slot).filter((m) => m.visible && m.geometry?.attributes.position) || [];
      const r = viewer.canvas.getBoundingClientRect(), pts = [];
      for (const m of meshes) {
        const count = m.geometry.attributes.position.count, step = Math.max(1, Math.floor(count / 50));
        for (let i = 0; i < count; i += step) { m.getVertexPosition(i, _p).applyMatrix4(m.matrixWorld).project(viewer.camera); pts.push([r.left + ((_p.x + 1) / 2) * r.width, r.top + ((1 - _p.y) / 2) * r.height]); }
      }
      if (!pts.length) return null;
      const mean = (list) => ({ x: list.reduce((a, q) => a + q[0], 0) / list.length, y: list.reduce((a, q) => a + q[1], 0) / list.length });
      const all = mean(pts); if (!side) return all;
      const near = [...pts].sort((a, b) => (side === 'left' ? a[0] - b[0] : b[0] - a[0])).slice(0, Math.max(1, Math.ceil(pts.length * 0.3)));
      return { ...mean(near), mid: all };
    },
    // The slot whose item is under a point of the page, or null.
    pick(x, y) {
      const r = viewer.canvas.getBoundingClientRect(); _ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      _ray.setFromCamera(_ndc, viewer.camera); let best = null;
      for (const s of kit.bodySlots()) for (const m of viewer.hero.slotMeshes(s.name)) {
        if (!m.visible) continue; m.computeBoundingSphere?.(); m.computeBoundingBox?.();
        for (const hit of _ray.intersectObject(m, false)) if (!best || hit.distance < best.distance) best = { distance: hit.distance, slot: s.name };
      }
      return best?.slot || null;
    },
    // Tries an item on without keeping it (the address and the outfit stay); untry puts back what is worn.
    async tryOn(slot, id, style = 0) { const it = kit.item(id); if (it?.styles[style]?.form) return; await viewer.wear(slot, it?.default ? null : `/items/${id}/`, style); },
    async untry(slot) { const w = look.worn[slot]; await viewer.wear(slot, w ? `/items/${w[0]}/` : null, w?.[1] || 0); await look.apply(slot); },
    // The hero's sets of the slots he shows now, each with its rarest item's rarity.
    sets() {
      const c = look.catalog; if (!c) return [];
      const RANK = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana', 'ancient', 'seasonal'];
      return c.sets.map((s) => ({ ...s, items: s.items.filter((id) => c.items[id] && look.applies(c.items[id].slot)) })).filter((s) => s.items.length > 1)
        .map((s) => ({ ...s, rarity: s.items.map((id) => c.items[id].rarity).sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0] }));
    },
    // Is a whole set on him?
    wearing(set) { return set.items.every((id) => look.worn[look.catalog.items[id].slot]?.[0] === id); },
    async wearSet(set) {
      const worn = Object.fromEntries(Object.entries(look.worn).filter(([, w]) => w));
      for (const id of set.items) worn[look.catalog.items[id].slot] = [id, 0];
      onLoading(true); await look.show(look.hero, worn, { gems: look.gems, unusual: look.unusual, kinetic: look.kinetic }); onLoading(false); write(); onChange('wear');
    },
  };
  globalThis.__kit = kit;
  const write = () => { if (look.hero) history.replaceState(null, '', `${location.pathname}${look.address}`); };
  // The page draws itself once start() resolves; later loads tell it.
  const fromAddress = async (first = false) => { onLoading(true); await look.show(location.hash.length > 1 ? location.hash : 'juggernaut'); onLoading(false); write(); if (!first) onChange('hero'); };
  addEventListener('hashchange', () => { if (location.hash !== look.address) fromAddress(); });
  await fromAddress(true);
  return kit;
}

// An animation's name for people: its activity (Стойка, Атака), an ability's by its name.
const ACTS = {
  ru: { LOADOUT: 'Стойка', IDLE: 'Покой', IDLE_RARE: 'Редкий покой', RUN: 'Бег', ATTACK: 'Атака', ATTACK2: 'Вторая атака', SPAWN: 'Появление', TELEPORT: 'Телепорт', DISABLED: 'Оглушение', VICTORY: 'Победа', DEFEAT: 'Поражение', TAUNT: 'Насмешка', DIE: 'Смерть', GENERIC_CHANNEL_1: 'Концентрация', CAST_ABILITY: 'Способность' },
  en: { LOADOUT: 'Loadout', IDLE: 'Idle', IDLE_RARE: 'Rare idle', RUN: 'Run', ATTACK: 'Attack', ATTACK2: 'Second attack', SPAWN: 'Spawn', TELEPORT: 'Teleport', DISABLED: 'Stunned', VICTORY: 'Victory', DEFEAT: 'Defeat', TAUNT: 'Taunt', DIE: 'Death', GENERIC_CHANNEL_1: 'Channel', CAST_ABILITY: 'Ability' },
};
export function animName(hero, a) {
  const act = (a.activity || '').replace(/^ACT_DOTA_/, ''), cast = /^CAST_ABILITY_(\d)$/.exec(act);
  if (cast) return say(hero?.abilities?.[+cast[1] - 1]?.name) || `${ACTS[lang].CAST_ABILITY} ${cast[1]}`;
  if (ACTS[lang][act]) return ACTS[lang][act];
  return act.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}
