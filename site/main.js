import { HeroViewer } from '../src/index.js';

const T = {
  ru: {
    search: 'Найти героя', attrs: { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсал' }, short: { str: 'STR', agi: 'AGI', int: 'INT', all: 'UNI' },
    animations: 'Анимации', items: 'Предметы', sets: 'Сеты', defaultItem: 'Стандартный', findItem: 'Найти предмет', style: 'Стиль', allDefault: 'Всё стандартное', noItems: 'Ничего не нашлось', reset: 'Сброс', embed: 'Встроить', copy: 'Копировать', copied: 'Скопировано',
    loading: 'Загрузка', failed: 'Не удалось загрузить героя', nothing: 'Никого не нашлось',
    hint: 'Тяни, чтобы повернуть  ·  колесо — ближе / дальше', hintTouch: 'Тяни, чтобы повернуть',
    colophon: 'Герои Dota 2 прямо в браузере: игровой шейдер, анимации и эффекты частиц. Код открыт под MIT, модели и текстуры принадлежат Valve.',
    embedTitle: 'Встроить героя', embedText: 'Рендерер — обычный ES-модуль поверх three.js. Положи папку героя рядом со страницей и подключи:',
    embedFine: 'Папки героев собираются из файлов игры командой npm run heroes, подробности в README.',
    build: 'сборка', roles: { Carry: 'Керри', Support: 'Поддержка', Nuker: 'Нюкер', Disabler: 'Контроль', Jungler: 'Лесник', Durable: 'Живучесть', Escape: 'Побег', Pusher: 'Пушер', Initiator: 'Инициатор' },
    acts: { LOADOUT: 'Стойка', IDLE: 'Покой', IDLE_RARE: 'Редкий покой', RUN: 'Бег', ATTACK: 'Атака', ATTACK2: 'Атака II', SPAWN: 'Появление', TELEPORT: 'Телепорт', DISABLED: 'Оглушение', VICTORY: 'Победа', DEFEAT: 'Поражение', TAUNT: 'Насмешка', DIE: 'Смерть', GENERIC_CHANNEL_1: 'Концентрация', CAST_ABILITY: 'Способность' },
  },
  en: {
    search: 'Find a hero', attrs: { str: 'Strength', agi: 'Agility', int: 'Intelligence', all: 'Universal' }, short: { str: 'STR', agi: 'AGI', int: 'INT', all: 'UNI' },
    animations: 'Animations', items: 'Items', sets: 'Sets', defaultItem: 'Default', findItem: 'Find an item', style: 'Style', allDefault: 'All default', noItems: 'Nothing found', reset: 'Reset', embed: 'Embed', copy: 'Copy', copied: 'Copied',
    loading: 'Loading', failed: 'Could not load the hero', nothing: 'Nobody by that name',
    hint: 'Drag to turn  ·  wheel to zoom', hintTouch: 'Drag to turn',
    colophon: 'Dota 2 heroes live in the browser: the game’s hero shader, animations and particle effects. The code is MIT; models and textures belong to Valve.',
    embedTitle: 'Embed a hero', embedText: 'The renderer is a plain ES module on top of three.js. Put a hero’s folder next to your page and:',
    embedFine: 'Hero folders are built from the game’s files with npm run heroes; see the README.',
    build: 'build', roles: {},
    acts: { LOADOUT: 'Loadout', IDLE: 'Idle', IDLE_RARE: 'Rare idle', RUN: 'Run', ATTACK: 'Attack', ATTACK2: 'Attack II', SPAWN: 'Spawn', TELEPORT: 'Teleport', DISABLED: 'Stunned', VICTORY: 'Victory', DEFEAT: 'Defeat', TAUNT: 'Taunt', DIE: 'Death', GENERIC_CHANNEL_1: 'Channel', CAST_ABILITY: 'Ability' },
  },
};
const ATTRS = ['str', 'agi', 'int', 'all'];
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...children) => { const e = Object.assign(document.createElement(tag), props); e.append(...children.filter((c) => c != null)); return e; };
const stored = (() => { try { return localStorage.getItem('loadout-lang'); } catch { return null; } })();
let lang = stored || (/^(ru|uk|be|kk)/i.test(navigator.language) ? 'ru' : 'en');
const t = () => T[lang];

const state = { index: null, heroes: [], current: null, filter: new Set(), query: '', active: null, playing: null, catalog: null, worn: {}, drawer: null, itemQuery: '' };

// ---------------------------------------------------------------- viewer
const canvas = $('[data-view]');
const viewer = new HeroViewer(canvas, {
  onProgress: (loaded, total) => { $('[data-bar]').style.width = `${total ? Math.round((loaded / total) * 100) : 0}%`; },
});
canvas.addEventListener('pointerdown', () => $('[data-hint]').classList.add('gone'), { once: true });
globalThis.__loadout = viewer; // for poking at the scene from the console

// ---------------------------------------------------------------- texts
function applyTexts() {
  document.documentElement.lang = lang;
  $('[data-lang-toggle]').textContent = lang === 'ru' ? 'EN' : 'RU';
  $('[data-search]').placeholder = t().search;
  $('[data-reset]').textContent = t().reset;
  $('[data-embed]').textContent = t().embed;
  $('[data-copy]').textContent = t().copy;
  $('[data-hint]').textContent = matchMedia('(pointer: coarse)').matches ? t().hintTouch : t().hint;
  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t()[n.dataset.t];
  const attrs = $('[data-attrs]'); attrs.replaceChildren(...ATTRS.map((a) => {
    const b = el('button', { type: 'button', textContent: t().short[a], title: t().attrs[a] }); b.style.setProperty('--c', `var(--${a})`);
    b.setAttribute('aria-pressed', state.filter.has(a)); b.onclick = () => { state.filter.has(a) ? state.filter.delete(a) : state.filter.add(a); applyTexts(); renderList(); }; return b;
  }));
  if (state.index) { $('[data-build]').textContent = `${t().build} ${state.index.game ?? '—'}`; renderList(); if (state.current) renderHero(state.current); renderRail(); if (state.drawer) renderDrawer(); }
}

// ---------------------------------------------------------------- roster
const nameOf = (h) => h.name[lang] || h.name.en;
const num = (h) => String(h.heroId).padStart(3, '0');
function renderList() {
  const q = state.query.trim().toLowerCase();
  const match = (h) => (!state.filter.size || state.filter.has(h.attribute)) && (!q || [h.name.en, h.name.ru, h.id].some((s) => s?.toLowerCase().includes(q)));
  const groups = ATTRS.map((a) => {
    const list = state.heroes.filter((h) => h.attribute === a && match(h)).sort((x, y) => nameOf(x).localeCompare(nameOf(y)));
    if (!list.length) return null;
    const g = el('section', { className: 'group' }, el('h2', {}, el('span', { textContent: t().attrs[a] }), el('span', { textContent: String(list.length) })),
      el('ol', {}, ...list.map((h) => el('li', {}, link(h)))));
    g.style.setProperty('--c', `var(--${a})`); return g;
  }).filter(Boolean);
  $('[data-list]').replaceChildren(...(groups.length ? groups : [el('p', { className: 'empty', textContent: t().nothing })]));
}
function link(h) {
  const a = el('a', { className: 'hero-link', href: `#${h.id}` }, el('span', { className: 'n', textContent: num(h) }), el('span', { className: 't', textContent: nameOf(h) }));
  a.dataset.id = h.id; if (state.current?.id === h.id) a.setAttribute('aria-current', 'true');
  return a;
}

// ---------------------------------------------------------------- one hero
// Valve's hype lines carry <b>; nothing else is kept.
const safe = (html) => (html || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(\/?)b&gt;/g, '<$1b>').replace(/&lt;br\s*\/?&gt;/g, ' ');
function label(h, a) {
  const act = a.activity.replace(/^ACT_DOTA_/, ''), cast = /^CAST_ABILITY_(\d)$/.exec(act);
  if (cast) { const ab = h.abilities[+cast[1] - 1]; return [ab?.name[lang] || ab?.name.en || `${t().acts.CAST_ABILITY} ${cast[1]}`, cast[1]]; }
  const raze = /^(\w+?)_(\d)$/.exec(act);
  if (t().acts[act]) return [t().acts[act], null];
  // A hero's own numbered activity (SF's RAZE_1…3) is named by the ability whose id carries it.
  if (raze) { const ab = h.abilities.find((x) => x.id.includes(`${raze[1].toLowerCase()}${raze[2]}`)); return [ab ? ab.name[lang] || ab.name.en : raze[1].charAt(0) + raze[1].slice(1).toLowerCase(), raze[2]]; }
  return [act.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' '), null];
}
function renderHero(h) {
  document.body.dataset.attr = h.attribute;
  document.title = `${nameOf(h)} — Loadout`;
  $('[data-attr-name]').textContent = t().attrs[h.attribute];
  $('[data-roles]').textContent = h.roles.map((r) => t().roles[r] || r).join(', ');
  $('[data-num]').textContent = num(h);
  $('[data-name]').textContent = nameOf(h);
  $('[data-complexity]').replaceChildren(...[1, 2, 3].map((i) => el('i', { className: i <= h.complexity ? 'on' : '' })));
  $('[data-hype]').innerHTML = safe(h.hype?.[lang] || h.hype?.en);
  $('[data-anims]').replaceChildren(...h.animations.map((a) => {
    const [text, sub] = label(h, a), b = el('button', { type: 'button' }, text, sub ? el('small', { textContent: sub }) : null, el('i'));
    b.dataset.name = a.name; b.setAttribute('aria-pressed', state.active === a.name); b.onclick = () => play(a.name); return el('li', {}, b);
  }));
  for (const a of document.querySelectorAll('.hero-link')) { if (a.dataset.id === h.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
  if (state.active) mark(state.active);
}
function ghost(text) {
  const g = $('[data-ghost]'), old = g.querySelector('span');
  if (old?.textContent === text) return;
  const span = el('span', { textContent: text, className: 'out' });
  fitGhost(text);
  if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 500); }
  g.append(span); requestAnimationFrame(() => requestAnimationFrame(() => span.classList.remove('out')));
}

// The name behind the hero fills the stage's width: condensed capitals are about half an em wide.
function fitGhost(text = $('[data-ghost] span:last-child')?.textContent || '') {
  const w = $('.stage').clientWidth, size = Math.max(64, Math.min(340, (w * 0.98) / Math.max(4, text.length * 0.47)));
  $('[data-ghost]').style.setProperty('--ghost-size', `${size.toFixed(0)}px`);
}
new ResizeObserver(() => fitGhost()).observe(document.querySelector('.stage'));

function mark(name) {
  state.active = name;
  for (const b of document.querySelectorAll('[data-anims] button')) { b.setAttribute('aria-pressed', b.dataset.name === name); b.querySelector('i').style.width = '0'; }
}
// A looping animation stays; the others run their progress line and hand back to the idle.
function play(name) {
  const h = state.current; if (!h) return;
  const a = h.animations.find((x) => x.name === name), duration = viewer.play(name); mark(name);
  cancelAnimationFrame(state.playing);
  if (!a || a.loop || !duration) return;
  const bar = document.querySelector(`[data-anims] button[data-name="${CSS.escape(name)}"] i`), start = performance.now();
  const tick = () => {
    const k = (performance.now() - start) / 1000 / duration;
    if (k >= 1) { mark(idleOf(h)); return; }
    if (bar) bar.style.width = `${k * 100}%`; state.playing = requestAnimationFrame(tick);
  };
  tick();
}
const idleOf = (h) => (h.animations.find((a) => a.activity === 'ACT_DOTA_LOADOUT') || h.animations.find((a) => a.loop) || h.animations[0])?.name;

let loads = 0;
async function open(id) {
  const h = state.heroes.find((x) => x.id === id) || state.heroes.find((x) => x.id === 'nevermore') || state.heroes[0];
  if (!h || state.current?.id === h.id) return;
  const ticket = ++loads;
  state.current = h; state.active = null; cancelAnimationFrame(state.playing);
  state.catalog = null; state.worn = {}; closeDrawer(); renderRail();
  const catalog = fetch(`heroes/${h.id}/items.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  renderHero(h); ghost(nameOf(h).toUpperCase());
  const status = $('[data-status]'); status.hidden = false; status.classList.remove('error'); $('[data-bar]').style.width = '0';
  $('[data-status-text]').textContent = `${t().loading} · ${(h.size / 1048576).toFixed(1)} MB`;
  try {
    const loaded = await viewer.load(`heroes/${h.id}/`);
    if (ticket !== loads || !loaded) return;
    status.hidden = true;
    const manifestIdle = idleOf(h);
    mark(manifestIdle);
    state.catalog = await catalog; if (ticket !== loads) return;
    renderRail(); dress(parseHash().worn);
  } catch (e) {
    if (ticket !== loads) return;
    status.classList.add('error'); $('[data-status-text]').textContent = t().failed; console.error(e);
  }
}

// ---------------------------------------------------------------- wardrobe
// The address keeps the hero and what he wears: #juggernaut/weapon=6058.1,head=7413 (item.style).
function parseHash() {
  const [id, rest = ''] = decodeURIComponent(location.hash.slice(1)).split('/'), worn = {};
  for (const part of rest.split(',')) { const m = /^(\w+)=(\d+)(?:\.(\d+))?$/.exec(part); if (m) worn[m[1]] = [+m[2], +(m[3] || 0)]; }
  return { id, worn };
}
function writeHash() {
  const parts = Object.entries(state.worn).filter(([, w]) => w).map(([slot, [id, style]]) => `${slot}=${id}${style ? `.${style}` : ''}`);
  history.replaceState(null, '', `#${state.current.id}${parts.length ? `/${parts.join(',')}` : ''}`);
}
const RARITY = { common: '#b0c3d9', uncommon: '#5e98d9', rare: '#4b69ff', mythical: '#8847ff', legendary: '#d32ce6', immortal: '#e4ae39', arcana: '#ade55c', ancient: '#eb4b4b', seasonal: '#fff34f' };
const itemName = (it) => it.name[lang] || it.name.en;
const iconOf = (id, style = 0) => { const it = state.catalog?.items[id], s = it?.styles[style] || it?.styles[0]; return s?.icon ? `items/${id}/${s.icon}` : null; };
const defaultOf = (slot) => state.catalog.slots.find((s) => s.name === slot)?.items.find((id) => state.catalog.items[id].default) ?? null;
const shownIn = (slot) => state.worn[slot]?.[0] ?? defaultOf(slot);

// Puts an item on (null or a default: the hero's own) and remembers it in the address.
async function wear(slot, id, style = 0) {
  const it = id && state.catalog?.items[id];
  state.worn[slot] = it && !it.default ? [+id, style] : null;
  writeHash(); renderRail(); if (state.drawer) renderDrawer();
  await viewer.wear(slot, state.worn[slot] ? `items/${id}/` : null, style).catch((e) => console.error(e));
}
// What the address asks for, on the slots it names; the others go back to their defaults.
function dress(worn) {
  if (!state.catalog) return;
  for (const s of state.catalog.slots) {
    const want = worn[s.name] && state.catalog.items[worn[s.name][0]] ? worn[s.name] : null, now = state.worn[s.name] || null;
    if (JSON.stringify(want) !== JSON.stringify(now)) wear(s.name, want?.[0] ?? null, want?.[1] ?? 0);
  }
}
function renderRail() {
  const rail = $('[data-rail]'), c = state.catalog;
  rail.hidden = !c?.slots.length; if (!c) return rail.replaceChildren();
  const buttons = c.slots.map((s) => {
    const id = shownIn(s.name), icon = id && iconOf(id, state.worn[s.name]?.[1]), b = el('button', { type: 'button', title: s.text[lang] || s.text.en }, el('span', { textContent: s.text[lang] || s.text.en }));
    if (icon) b.style.backgroundImage = `url("${icon}")`;
    b.classList.toggle('changed', !!state.worn[s.name]); b.setAttribute('aria-expanded', state.drawer === s.name);
    b.onclick = () => (state.drawer === s.name ? closeDrawer() : openDrawer(s.name)); return b;
  });
  if (c.sets.length) { const b = el('button', { type: 'button', className: 'sets', textContent: t().sets }); b.setAttribute('aria-expanded', state.drawer === '#sets'); b.onclick = () => (state.drawer === '#sets' ? closeDrawer() : openDrawer('#sets')); buttons.push(b); }
  rail.replaceChildren(...buttons);
}
function openDrawer(which) { state.drawer = which; state.itemQuery = ''; $('[data-item-search]').value = ''; $('[data-drawer]').hidden = false; renderDrawer(); renderRail(); }
function closeDrawer() { state.drawer = null; $('[data-drawer]').hidden = true; renderRail(); }
function tile(id, pressed, onclick, label) {
  const it = state.catalog.items[id], icon = id && iconOf(id), b = el('button', { type: 'button', className: 'tile', title: label }, icon ? el('img', { src: icon, alt: '', loading: 'lazy' }) : el('i', { className: 'blank' }), el('b', { textContent: label }));
  if (it) b.style.setProperty('--r', RARITY[it.rarity] || 'var(--line-2)'); b.setAttribute('aria-pressed', pressed); b.onclick = onclick; return b;
}
function renderDrawer() {
  const c = state.catalog, which = state.drawer, q = state.itemQuery.trim().toLowerCase(), body = $('[data-drawer-body]'), styles = $('[data-styles]');
  if (!c || !which) return;
  $('[data-item-search]').placeholder = t().findItem;
  if (which === '#sets') {
    $('[data-drawer-title]').textContent = t().sets; styles.hidden = true;
    const sets = c.sets.filter((s) => !q || (s.name?.[lang] || s.name?.en || s.key).toLowerCase().includes(q));
    const reset = el('button', { type: 'button', className: 'set' }, el('b', { textContent: t().allDefault })); reset.onclick = () => { for (const s of c.slots) if (state.worn[s.name]) wear(s.name, null); };
    body.replaceChildren(reset, ...sets.map((s) => {
      const b = el('button', { type: 'button', className: 'set' }, el('b', { textContent: s.name?.[lang] || s.name?.en || s.key }), el('span', { className: 'icons' }, ...s.items.map((id) => el('img', { src: iconOf(id) || '', alt: '', loading: 'lazy' }))));
      b.onclick = () => { for (const id of s.items) wear(c.items[id].slot, id); }; return b;
    }));
    return;
  }
  const slot = c.slots.find((s) => s.name === which), current = shownIn(which);
  $('[data-drawer-title]').textContent = slot.text[lang] || slot.text.en;
  const ids = slot.items.filter((id) => !q || itemName(c.items[id]).toLowerCase().includes(q));
  body.replaceChildren(ids.length ? el('div', { className: 'tiles' }, ...ids.map((id) => tile(id, id === current, () => wear(which, id), c.items[id].default ? `${t().defaultItem} · ${itemName(c.items[id])}` : itemName(c.items[id])))) : el('p', { className: 'empty-items', textContent: t().noItems }));
  // The styles of what the slot wears.
  const it = c.items[current], style = state.worn[which]?.[1] || 0;
  styles.hidden = !(it && it.styles.length > 1);
  if (!styles.hidden) styles.replaceChildren(el('span', { textContent: t().style }), ...it.styles.map((s, i) => { const b = el('button', { type: 'button', textContent: s.name?.[lang] || s.name?.en || String(i + 1) }); b.setAttribute('aria-pressed', i === style); b.onclick = () => wear(which, current, i); return b; }));
}
$('[data-drawer-close]').onclick = closeDrawer;
$('[data-item-search]').addEventListener('input', (e) => { state.itemQuery = e.target.value; renderDrawer(); });
$('[data-item-search]').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

// ---------------------------------------------------------------- controls
$('[data-lang-toggle]').onclick = () => { lang = lang === 'ru' ? 'en' : 'ru'; try { localStorage.setItem('loadout-lang', lang); } catch { /* private mode */ } applyTexts(); if (state.current) ghost(nameOf(state.current).toUpperCase()); };
$('[data-search]').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
$('[data-search]').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = document.querySelector('.hero-link'); if (first) location.hash = first.dataset.id; e.target.blur(); }
  if (e.key === 'Escape') { e.target.value = ''; state.query = ''; renderList(); e.target.blur(); }
});
$('[data-reset]').onclick = () => { viewer.rotate(0); viewer.zoom(1); };
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('[data-search]').focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'k') {
    const links = [...document.querySelectorAll('.hero-link')], i = links.findIndex((a) => a.dataset.id === state.current?.id);
    const next = links[(i + (e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1) + links.length) % links.length];
    if (next) { e.preventDefault(); location.hash = next.dataset.id; next.scrollIntoView({ block: 'nearest' }); }
  }
  if (e.key === 'ArrowLeft') viewer.rotate(-0.6, { relative: true });
  if (e.key === 'ArrowRight') viewer.rotate(0.6, { relative: true });
});
window.addEventListener('hashchange', () => { const { id, worn } = parseHash(); if (id === state.current?.id) dress(worn); else open(id); });

const dialog = $('[data-embed-dialog]');
$('[data-embed]').onclick = () => {
  const id = state.current?.id || 'nevermore';
  $('[data-embed-code]').textContent = `<canvas id="hero" style="width: 640px; height: 720px"></canvas>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/",
  "dota-loadout": "./dota-loadout/src/index.js"
} }
</script>
<script type="module">
  import { HeroViewer } from 'dota-loadout';
  const viewer = new HeroViewer(document.getElementById('hero'));
  await viewer.load('./heroes/${id}/');
  viewer.play('${state.current?.animations.find((a) => !a.loop)?.name || 'loadout'}');
</script>`;
  dialog.showModal();
};
$('[data-copy]').onclick = async () => {
  try { await navigator.clipboard.writeText($('[data-embed-code]').textContent); $('[data-copy]').textContent = t().copied; setTimeout(() => { $('[data-copy]').textContent = t().copy; }, 1500); } catch { /* no clipboard */ }
};

const plate = document.querySelector('.plate');
new ResizeObserver(() => document.documentElement.style.setProperty('--plate-h', `${plate.offsetHeight}px`)).observe(plate);

// ---------------------------------------------------------------- start
applyTexts();
try {
  const response = await fetch('heroes/index.json'); state.index = await response.json(); state.heroes = state.index.heroes;
  applyTexts();
  await open(parseHash().id || 'nevermore');
  document.querySelector('.hero-link[aria-current="true"]')?.scrollIntoView({ block: 'center' });
} catch (e) {
  $('[data-status-text]').textContent = t().failed; $('[data-status]').classList.add('error'); console.error(e);
}
