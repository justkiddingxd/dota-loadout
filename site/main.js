import { HeroViewer } from '../src/index.js';

const T = {
  ru: {
    heroes: 'Герои', items: 'Предметы', sets: 'Сеты', backdrops: 'Фон', backdrop: 'Фон', noBackdrop: 'Без фона', findBackdrop: 'Найти фон', all: 'Все', search: 'Найти героя', findItem: 'Найти предмет', findSet: 'Найти сет', allRarities: 'Все',
    attrs: { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсал' }, short: { str: 'STR', agi: 'AGI', int: 'INT', all: 'UNI' },
    saveFrame: 'Кадр', saveVideo: 'Видео', stop: 'Стоп', pause: 'Пауза', play: 'Пуск', recenter: 'Вид', share: 'Ссылка', shared: 'Ссылка скопирована', embed: 'Встроить', copy: 'Копировать', copied: 'Скопировано',
    saved: 'Сохранено', noVideo: 'Браузер не умеет записывать видео', reset: 'Сбросить', worn: 'Надето', defaultItem: 'Стандарт', styles: 'стил.', style: 'Стиль', unusual: 'Необычный эффект', noUnusual: 'Нет', kinetic: 'Кинетический самоцвет', kineticTip: 'меняет анимации',
    gem: 'Призматический самоцвет', gemCard: 'Самоцвет', gemTab: 'Самоцвет', noGem: 'Без самоцвета', itemsN: 'предм.', noItems: 'Ничего не нашлось', nothing: 'Никого не нашлось',
    loading: 'Загрузка', failed: 'Не удалось загрузить героя', animation: 'Анимация',
    embedTitle: 'Встроить героя', embedText: 'Герой в этом же наряде на любой странице: элемент <dota-hero> из пакета dota-loadout (npm i dota-loadout three). Модели грузятся с этого сайта.',
    embedFine: 'Свой canvas, класс Loadout, свои ассеты — в README на GitHub.',
    rarity: { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', mythical: 'Мифический', legendary: 'Легендарный', immortal: 'Бессмертный', arcana: 'Аркана', ancient: 'Древний', seasonal: 'Сезонный' },
    acts: { LOADOUT: 'Стойка', IDLE: 'Покой', IDLE_RARE: 'Редкий покой', RUN: 'Бег', ATTACK: 'Атака', ATTACK2: 'Атака II', SPAWN: 'Появление', TELEPORT: 'Телепорт', DISABLED: 'Оглушение', VICTORY: 'Победа', DEFEAT: 'Поражение', TAUNT: 'Насмешка', DIE: 'Смерть', GENERIC_CHANNEL_1: 'Концентрация', CAST_ABILITY: 'Способность' },
  },
  en: {
    heroes: 'Heroes', items: 'Items', sets: 'Sets', backdrops: 'Backdrop', backdrop: 'Backdrop', noBackdrop: 'None', findBackdrop: 'Find a backdrop', all: 'All', search: 'Find a hero', findItem: 'Find an item', findSet: 'Find a set', allRarities: 'All',
    attrs: { str: 'Strength', agi: 'Agility', int: 'Intelligence', all: 'Universal' }, short: { str: 'STR', agi: 'AGI', int: 'INT', all: 'UNI' },
    saveFrame: 'Save frame', saveVideo: 'Save video', stop: 'Stop', pause: 'Pause', play: 'Play', recenter: 'Recenter', share: 'Link', shared: 'Link copied', embed: 'Embed', copy: 'Copy', copied: 'Copied',
    saved: 'Saved', noVideo: 'This browser cannot record video', reset: 'Reset', worn: 'Worn', defaultItem: 'Default', styles: 'styles', style: 'Style', unusual: 'Unusual effect', noUnusual: 'None', kinetic: 'Kinetic gem', kineticTip: 'changes animations',
    gem: 'Prismatic gem', gemCard: 'Prismatic gem', gemTab: 'Gem', noGem: 'No gem', itemsN: 'items', noItems: 'Nothing found', nothing: 'Nobody by that name',
    loading: 'Loading', failed: 'Could not load the hero', animation: 'Animation',
    embedTitle: 'Embed a hero', embedText: 'The hero in this outfit on any page: the <dota-hero> element of the dota-loadout package (npm i dota-loadout three). Models load from this site.',
    embedFine: 'Your own canvas, the Loadout class, your own assets: see the README on GitHub.',
    rarity: {},
    acts: { LOADOUT: 'Loadout', IDLE: 'Idle', IDLE_RARE: 'Rare idle', RUN: 'Run', ATTACK: 'Attack', ATTACK2: 'Attack II', SPAWN: 'Spawn', TELEPORT: 'Teleport', DISABLED: 'Stunned', VICTORY: 'Victory', DEFEAT: 'Defeat', TAUNT: 'Taunt', DIE: 'Death', GENERIC_CHANNEL_1: 'Channel', CAST_ABILITY: 'Ability' },
  },
};
const ATTRS = ['str', 'agi', 'int', 'all'];
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...children) => { const e = Object.assign(document.createElement(tag), props); e.append(...children.filter((c) => c != null)); return e; };
const stored = (() => { try { return localStorage.getItem('loadout-lang'); } catch { return null; } })();
let lang = stored || (/^(ru|uk|be|kk)/i.test(navigator.language) ? 'ru' : 'en');
const t = () => T[lang];

// mode: the shelf's items or sets; tab: its slot ('#all' for every slot); rarity, itemQuery: its filters.
const state = { gems: {}, unusual: {}, kinetic: {}, kinetics: [], palette: [], index: null, heroes: [], current: null, filter: new Set(), query: '', active: null, catalog: null, worn: {}, mode: 'items', tab: '#all', rarity: null, itemQuery: '' };

// ---------------------------------------------------------------- viewer
const canvas = $('[data-view]');
const viewer = new HeroViewer(canvas, {
  onProgress: (loaded, total) => { $('[data-bar]').style.width = `${total ? Math.round((loaded / total) * 100) : 0}%`; },
});
globalThis.__loadout = viewer; // for poking at the scene from the console
// Something to run right after each frame is drawn, while the canvas still holds it (frames and video).
const afterFrame = new Set();
{ const frame = viewer.frame.bind(viewer); viewer.frame = () => { frame(); for (const f of afterFrame) f(); }; }

// ---------------------------------------------------------------- texts
function applyTexts() {
  document.documentElement.lang = lang;
  $('[data-lang-toggle]').textContent = lang === 'ru' ? 'EN' : 'RU';
  $('[data-search]').placeholder = t().search;
  $('[data-copy]').textContent = t().copy; $('[data-share]').textContent = t().share; $('[data-embed]').textContent = t().embed;
  $('[data-save-frame]').textContent = t().saveFrame; $('[data-reset]').textContent = t().recenter;
  renderPause(); renderRecord();
  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t()[n.dataset.t];
  $('[data-mode]').replaceChildren(...['items', 'sets', 'backdrops'].map((m) => { const b = el('button', { type: 'button', role: 'tab', textContent: t()[m] }); b.dataset.mode = m; b.onclick = () => setMode(m); return b; }));
  $('[data-attrs]').replaceChildren(...ATTRS.map((a) => {
    const b = el('button', { type: 'button', title: t().attrs[a] }, el('img', { src: `attributes/${a}.webp`, alt: '' }), t().short[a]);
    b.setAttribute('aria-pressed', state.filter.has(a)); b.onclick = () => { state.filter.has(a) ? state.filter.delete(a) : state.filter.add(a); applyTexts(); }; return b;
  }));
  if (state.index) { renderList(); if (state.current) renderHero(state.current); }
  renderShelf();
}
const rarityName = (r) => t().rarity[r] || r.charAt(0).toUpperCase() + r.slice(1);

// ---------------------------------------------------------------- heroes: the picker
const nameOf = (h) => h.name[lang] || h.name.en;
// The roster in the picker's order (attribute, then name): what the arrows step through.
const ordered = () => ATTRS.flatMap((a) => state.heroes.filter((h) => h.attribute === a).sort((x, y) => nameOf(x).localeCompare(nameOf(y))));
function renderList() {
  const q = state.query.trim().toLowerCase();
  const match = (h) => (!state.filter.size || state.filter.has(h.attribute)) && (!q || [h.name.en, h.name.ru, h.id].some((s) => s?.toLowerCase().includes(q)));
  const list = ordered().filter(match);
  $('[data-list]').replaceChildren(list.length ? el('div', { className: 'cards' }, ...list.map(heroCard)) : el('p', { className: 'empty', textContent: t().nothing }));
}
const ATTR_COLOR = { str: '#e0533d', agi: '#4fc26b', int: '#3fa7e8', all: '#c6a24f' };
function heroCard(h) {
  const a = el('a', { className: 'card', href: `#${h.id}` },
    el('span', { className: 'label' }, el('img', { src: `attributes/${h.attribute}.webp`, alt: '' }), t().attrs[h.attribute]),
    el('span', { className: 'pic' }, el('img', { src: `heroes/${h.id}/card.webp`, alt: '', loading: 'lazy' })), el('b', { textContent: nameOf(h) }));
  a.style.setProperty('--c', ATTR_COLOR[h.attribute]); a.dataset.id = h.id;
  if (state.current?.id === h.id) a.setAttribute('aria-current', 'true');
  a.onclick = () => closePicker(); return a;
}
function openPicker() {
  const p = $('[data-picker]'); p.hidden = false;
  requestAnimationFrame(() => { p.classList.add('on'); $('[data-search]').focus(); $('.picker .card[aria-current="true"]')?.scrollIntoView({ block: 'center' }); });
}
function closePicker() { const p = $('[data-picker]'); p.classList.remove('on'); setTimeout(() => { if (!p.classList.contains('on')) p.hidden = true; }, 200); }

// ---------------------------------------------------------------- one hero
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
  document.title = `${nameOf(h)} — Loadout`;
  $('[data-hero-name]').textContent = nameOf(h); $('[data-hero-icon]').src = `heroes/${h.id}/icon.webp`;
  $('[data-anims]').replaceChildren(...animsOf(h).map((a) => {
    const [text, sub] = label(h, a), b = el('button', { type: 'button', role: 'menuitem' }, text, sub ? el('small', { textContent: sub }) : null, el('i'));
    b.dataset.name = a.name; b.onclick = () => { play(a.name); closeMenu(); }; return el('li', {}, b);
  }));
  for (const a of document.querySelectorAll('.picker .card')) { if (a.dataset.id === h.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
  mark(state.active);
}
function mark(name) {
  state.active = name; const h = state.current, a = h && animsOf(h).find((x) => x.name === name);
  for (const b of document.querySelectorAll('[data-anims] button')) { b.setAttribute('aria-pressed', b.dataset.name === name); b.querySelector('i').style.width = '0'; }
  $('[data-anim-button]').replaceChildren(el('span', { className: 'anim-now', textContent: a ? label(h, a)[0] : t().animation }), el('span', { textContent: '▴', ariaHidden: 'true' }));
}
// A looping animation stays; the others run their progress line (on the viewer's clock: a pause
// holds it) and hand back to the idle.
function play(name) {
  const h = state.current; if (!h) return;
  const a = animsOf(h).find((x) => x.name === name), duration = viewer.play(name); mark(name);
  afterFrame.delete(play.tick);
  if (!a || a.loop || !duration) return;
  const bar = document.querySelector(`[data-anims] button[data-name="${CSS.escape(name)}"] i`), start = viewer.clock;
  play.tick = () => {
    const k = (viewer.clock - start) / duration;
    if (k >= 1) { afterFrame.delete(play.tick); mark(idleOf(h)); return; }
    if (bar) bar.style.width = `${k * 100}%`;
  };
  afterFrame.add(play.tick);
}
// The animations of the form loaded (a persona's are its own), else the roster's.
const animsOf = (h) => (state.current === h && state.animations) || h.animations;
const idleOf = (h) => { const list = animsOf(h); return (list.find((a) => a.activity === 'ACT_DOTA_LOADOUT') || list.find((a) => a.loop) || list[0])?.name; };
const closeMenu = () => { $('[data-anims]').hidden = true; $('[data-anim-button]').setAttribute('aria-expanded', 'false'); };
$('[data-anim-button]').onclick = () => { const list = $('[data-anims]'), open = list.hidden; list.hidden = !open; $('[data-anim-button]').setAttribute('aria-expanded', open); if (open) list.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }); };
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('[data-anim-menu]')) closeMenu(); });

let loads = 0;
async function open(id) {
  const h = state.heroes.find((x) => x.id === id) || state.heroes.find((x) => x.id === 'nevermore') || state.heroes[0];
  if (!h || state.current?.id === h.id) return;
  const ticket = ++loads;
  state.current = h; state.active = null; afterFrame.delete(play.tick);
  state.catalog = null; state.worn = {}; state.form = null; state.animations = null; state.tab = '#all'; state.rarity = null; state.itemQuery = ''; $('[data-item-search]').value = '';
  renderHero(h); renderShelf();
  showLoading(h);
  try {
    // The catalog first: what the address has him wear may be another form of him (a persona, an arcana).
    state.catalog = await fetch(`heroes/${h.id}/items.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (ticket !== loads) return;
    const asked = parseHash(); state.worn = valid(asked.worn);
    state.gems = Object.fromEntries(Object.entries(asked.gems).map(([slot, g]) => [slotNow(asked.worn, slot), g]).filter(([slot]) => state.worn[slot]));
    state.unusual = Object.fromEntries(Object.entries(asked.unusual).map(([slot, u]) => [slotNow(asked.worn, slot), u]).filter(([slot]) => state.worn[slot]));
    state.kinetic = Object.fromEntries(Object.entries(asked.kinetic).map(([slot, k]) => [slotNow(asked.worn, slot), k]).filter(([slot]) => state.worn[slot]));
    await reload(ticket);
  } catch (e) {
    if (ticket !== loads) return;
    $('[data-status]').classList.add('error'); $('[data-status-text]').textContent = t().failed; console.error(e);
  }
}
function showLoading(h) {
  const status = $('[data-status]'); status.hidden = false; status.classList.remove('error'); $('[data-bar]').style.width = '0';
  $('[data-status-text]').textContent = `${t().loading} · ${(h.size / 1048576).toFixed(1)} MB`;
}
// Loads the hero in the form what he wears asks for, then puts on what applies to it.
async function reload(ticket = ++loads) {
  const h = state.current; state.form = formOf(state.worn);
  showLoading(h);
  let loaded;
  try { loaded = await viewer.load(`heroes/${h.id}/${state.form ? `forms/${state.form}/` : ''}`); } catch (e) {
    if (ticket === loads) { $('[data-status]').classList.add('error'); $('[data-status-text]').textContent = t().failed; console.error(e); }
    return;
  }
  if (ticket !== loads || !loaded) return;
  $('[data-status]').hidden = true;
  state.animations = loaded.animations; state.kinetics = loaded.kinetic || []; renderHero(h); mark(idleOf(h));
  writeHash(); renderShelf();
  await Promise.all(Object.entries(state.worn).filter(([slot, w]) => w && applies(slot)).map(([slot, [id, style]]) => viewer.wear(slot, `items/${id}/`, style).catch((e) => console.error(e))));
  applyGems(); applyUnusual(); applyKinetic();
}

// ---------------------------------------------------------------- wardrobe
// The address keeps the hero and what he wears: #juggernaut/weapon=6058.1,head=7413 (item.style),
// a prismatic gem in an item, its unusual effect and its kinetic gem: arms=29087~creators_light!837^31.
function parseHash() {
  const [id, rest = ''] = decodeURIComponent(location.hash.slice(1)).split('/'), worn = {}, gems = {}, unusual = {}, kinetic = {};
  for (const part of rest.split(',')) { const m = /^(\w+)=(\d+)(?:\.(\d+))?(?:~(\w+))?(?:!(\d+))?(?:\^(\d+))?$/.exec(part); if (m) { worn[m[1]] = [+m[2], +(m[3] || 0)]; if (m[4]) gems[m[1]] = m[4]; if (m[5]) unusual[m[1]] = +m[5]; if (m[6]) kinetic[m[1]] = +m[6]; } }
  return { id, worn, gems, unusual, kinetic };
}
function writeHash() {
  const parts = Object.entries(state.worn).filter(([, w]) => w).map(([slot, [id, style]]) => `${slot}=${id}${style ? `.${style}` : ''}${state.gems[slot] ? `~${state.gems[slot]}` : ''}${state.unusual[slot] ? `!${state.unusual[slot]}` : ''}${state.kinetic[slot] != null ? `^${state.kinetic[slot]}` : ''}`);
  history.replaceState(null, '', `#${state.current.id}${parts.length ? `/${parts.join(',')}` : ''}`);
}
const RARITY = { common: '#b0c3d9', uncommon: '#5e98d9', rare: '#4b69ff', mythical: '#8847ff', legendary: '#d32ce6', immortal: '#e4ae39', arcana: '#ade55c', ancient: '#eb4b4b', seasonal: '#fff34f' };
// The game's order of rarities, for a set's: its rarest item's.
const RANK = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'ancient', 'immortal', 'arcana', 'seasonal'];
const itemName = (it) => it.name[lang] || it.name.en;
// A style without an icon of its own shows the item's.
const iconOf = (id, style = 0) => { const it = state.catalog?.items[id], icon = it?.styles[style]?.icon || it?.styles.find((s) => s.icon)?.icon; return icon ? `items/${id}/${icon}` : null; };
const defaultOf = (slot) => state.catalog.slots.find((s) => s.name === slot)?.items.find((id) => state.catalog.items[id].default) ?? null;
const shownIn = (slot) => state.worn[slot]?.[0] ?? defaultOf(slot);

// Forms: a worn style may put the hero in another model of his (a persona's number, an arcana's).
// A persona has slots of its own; the hero's others wait, kept, until he leaves it.
const formsOf = (worn) => Object.entries(worn).filter(([, w]) => w).map(([slot, [id, style]]) => { const it = state.catalog?.items[id]; return { slot, form: (it?.styles[style] || it?.styles[0])?.form }; }).filter((x) => x.form);
const slotPersona = (slot) => +(/_persona_(\d+)$/.exec(slot)?.[1] || 0);
// The persona worn (its number, 0 for none): his slots or its own apply.
const personaOf = (worn) => +(/^persona(\d+)$/.exec(formsOf(worn).find((x) => x.form.startsWith('persona'))?.form || '')?.[1] || 0);
// The form to load: a persona's own item may change its model again (Anti-Mage's Kirin); out of a
// persona, an item of his own slots that changes his.
const formOf = (worn) => {
  const forms = formsOf(worn), p = personaOf(worn);
  return forms.find((x) => p && slotPersona(x.slot) === p)?.form || (p ? `persona${p}` : forms.find((x) => !slotPersona(x.slot))?.form) || null;
};
const applies = (slot) => { const s = state.catalog?.slots.find((x) => x.name === slot), p = personaOf(state.worn); return !!s && (s.persona ? s.persona === p : !p || slot === 'persona_selector'); };
// What the address names that the catalog has (defaults are the hero's own: nothing to keep).
// An item the game has since moved to another slot goes there (Terrorblade's arcana, once his head,
// now his base: head=5957 in old links).
// now his base: head=5957 in old links); its set's item for the slot it left takes that slot (the
// arcana's horns), as the game split it.
const valid = (worn) => {
  const c = state.catalog, out = {};
  for (const [slot, w] of Object.entries(worn)) { const it = c?.items[w[0]]; if (it && !it.default) out[it.slot] = w; }
  for (const [slot, w] of Object.entries(worn)) {
    const it = c?.items[w[0]]; if (!it || it.default || it.slot === slot || out[slot] || !it.set) continue;
    const mate = Object.entries(c.items).find(([, x]) => x.set === it.set && x.slot === slot && !x.default); if (mate) out[slot] = [+mate[0], 0];
  }
  return out;
};
// The slot an address's slot means now (the item it names may have moved).
const slotNow = (asked, slot) => { const it = state.catalog?.items[asked[slot]?.[0]]; return it?.slot || slot; };

// Prismatic gems: the palette (gems.json), and the gem in each slot's item while it takes one.
const gemHex = (key) => state.palette.find((g) => g.key === key)?.hex || null;
const takesGem = (slot) => { const w = state.worn[slot], it = w && state.catalog?.items[w[0]]; return !!(it && !it.default && it.prismatic); };
// An item that comes with a gem (prismatic: its key; Terrorblade's arcana, Reflection's Shade) always
// has one: that one unless another was put in. The address names only another.
const socketed = (slot) => { const w = state.worn[slot], it = w && state.catalog?.items[w[0]]; return typeof it?.prismatic === 'string' ? it.prismatic : null; };
const gemOf = (slot) => state.gems[slot] || socketed(slot);
function setGem(slot, key) {
  if (key && takesGem(slot) && gemHex(key) && key !== socketed(slot)) state.gems[slot] = key; else delete state.gems[slot];
  viewer.gem(slot, gemHex(gemOf(slot))); writeHash(); renderShelf();
}
const applyGems = () => {
  for (const slot of Object.keys(state.gems)) if (!takesGem(slot) || !applies(slot)) delete state.gems[slot];
  for (const slot of Object.keys(state.worn)) if (takesGem(slot) && applies(slot) && gemOf(slot)) viewer.gem(slot, gemHex(gemOf(slot)));
};
// The gem's picture in a colour: the game's (its setting, and a mask of where and how the colour goes).
const gemArt = { base: null, mask: null, cache: new Map() };
const loadImage = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
const gemArtReady = Promise.all([loadImage('gems/gem.webp'), loadImage('gems/gem-mask.webp')]).then(([b, m]) => { gemArt.base = b; gemArt.mask = m; }).catch(() => {});
function gemPicture(hex) {
  if (!gemArt.base) return null;
  if (gemArt.cache.has(hex)) return gemArt.cache.get(hex);
  const { base, mask } = gemArt, w = base.width, h = base.height, tint = document.createElement('canvas'), x = tint.getContext('2d');
  tint.width = w; tint.height = h; x.drawImage(mask, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = hex; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'color-dodge'; x.drawImage(tint, 0, 0);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0);
  const out = document.createElement('canvas'), o = out.getContext('2d'); out.width = w; out.height = h; o.drawImage(base, 0, 0); o.drawImage(tint, 0, 0);
  const url = out.toDataURL('image/webp', 0.9); gemArt.cache.set(hex, url); return url;
}
// Unusual effects: those the item in a slot can roll (its catalog's unusual list), one at a time.
const unusualsOf = (slot) => { const w = state.worn[slot], it = w && state.catalog?.items[w[0]]; return (it && !it.default && it.unusual) || []; };
function setUnusual(slot, id) {
  if (id && unusualsOf(slot).some((u) => u.id === id)) state.unusual[slot] = id; else delete state.unusual[slot];
  viewer.unusual(slot, state.unusual[slot] ?? null); writeHash(); renderShelf();
}
// An activity's name as the animations menu has it (ACT_DOTA_ATTACK: Атака).
const actName = (act) => { const a = act.replace(/^ACT_DOTA_/, ''), cast = /^CAST_ABILITY_(\d)$/.exec(a), ab = cast && state.current?.abilities[+cast[1] - 1];
  return (ab && (ab.name[lang] || ab.name.en)) || t().acts[a] || a.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' '); };
// Kinetic gems: those of the hero's animations (his manifest's list), one in any item of his.
const takesKinetic = (slot) => { const w = state.worn[slot], it = w && state.catalog?.items[w[0]]; return !!(it && !it.default && state.kinetics.length); };
const kineticOf = (id) => state.kinetics.find((k) => k.id === id) || null;
function setKinetic(slot, id) {
  if (id != null && takesKinetic(slot) && kineticOf(id)) state.kinetic[slot] = id; else delete state.kinetic[slot];
  viewer.kinetic(slot, kineticOf(state.kinetic[slot])?.activities || null); writeHash(); renderShelf();
}
const applyKinetic = () => { for (const slot of Object.keys(state.kinetic)) if (takesKinetic(slot) && applies(slot) && kineticOf(state.kinetic[slot])) viewer.kinetic(slot, kineticOf(state.kinetic[slot]).activities); else delete state.kinetic[slot]; };
const applyUnusual = () => { for (const slot of Object.keys(state.unusual)) if (applies(slot) && unusualsOf(slot).some((u) => u.id === state.unusual[slot])) viewer.unusual(slot, state.unusual[slot]); else delete state.unusual[slot]; };

// Puts an item on (null or a default: the hero's own) and remembers it in the address.
async function wear(slot, id, style = 0) {
  const it = id && state.catalog?.items[id];
  // A gem stays in the item it was put in; another item comes without.
  if (state.worn[slot]?.[0] !== +id) { delete state.gems[slot]; viewer.gem(slot, null); delete state.unusual[slot]; viewer.unusual(slot, null); delete state.kinetic[slot]; viewer.kinetic(slot, null); }
  state.worn[slot] = it && !it.default ? [+id, style] : null;
  if (formOf(state.worn) !== state.form) return reload();
  writeHash(); renderShelf();
  await viewer.wear(slot, state.worn[slot] ? `items/${id}/` : null, style).catch((e) => console.error(e));
  if (gemOf(slot)) viewer.gem(slot, gemHex(gemOf(slot)));
  if (state.unusual[slot]) viewer.unusual(slot, state.unusual[slot]);
}
// What the address asks for, on the slots it names; the others go back to their defaults.
function dress(worn) {
  if (!state.catalog) return;
  const next = valid(worn);
  if (formOf(next) !== state.form) { state.worn = next; reload(); return; }
  for (const s of state.catalog.slots) {
    const want = next[s.name] || null, now = state.worn[s.name] || null;
    if (JSON.stringify(want) === JSON.stringify(now)) continue;
    if (applies(s.name)) wear(s.name, want?.[0] ?? null, want?.[1] ?? 0); else state.worn[s.name] = want;
  }
  writeHash();
}

// ---------------------------------------------------------------- the shelf
// Items: a tab for each slot (and one for all), the worn item's styles, unusual effects and gem, and
// the slot's cards; sets: a card for each set, lit in its rarest item's rarity.
const slotName = (s) => s.text[lang] || s.text.en;
function setMode(m) { state.mode = m; state.rarity = null; state.itemQuery = ''; $('[data-item-search]').value = ''; renderShelf(); $('[data-shelf-body]').scrollTop = 0; }
function setTab(tab) { state.tab = tab; state.rarity = null; renderShelf(); $('[data-shelf-body]').scrollTop = 0; }
function renderShelf() {
  const c = state.catalog, body = $('[data-shelf-body]'), tabs = $('[data-tabs]');
  for (const b of $('[data-mode]').children) b.setAttribute('aria-selected', b.dataset.mode === state.mode);
  $('[data-item-search]').placeholder = state.mode === 'sets' ? t().findSet : state.mode === 'backdrops' ? t().findBackdrop : t().findItem;
  if (state.mode === 'backdrops') { tabs.hidden = true; rarities([]); return body.replaceChildren(backdropCards()); }
  if (!c) { tabs.replaceChildren(); $('[data-rarities]').replaceChildren(); body.replaceChildren(); return; }
  const slots = c.slots.filter((s) => applies(s.name));
  // The gems of what takes one: a tab of their own (Terrorblade's arcana: his colour).
  const gemSlots = slots.filter((s) => takesGem(s.name));
  if (state.tab !== '#all' && !slots.some((s) => s.name === state.tab) && !(state.tab === '#gem' && gemSlots.length && state.palette.length)) state.tab = '#all';
  const changed = Object.values(state.worn).some(Boolean);
  tabs.hidden = state.mode !== 'items';
  const reset = el('button', { type: 'button', className: 'tab', textContent: `↺ ${t().reset}` }); reset.onclick = () => { state.worn = {}; state.gems = {}; state.unusual = {}; state.kinetic = {}; reload(); };
  const gemTab = gemSlots.length && state.palette.length ? [tab('#gem', t().gemTab, gemHex(gemOf(gemSlots[0].name)) || '#fff')] : [];
  tabs.replaceChildren(tab('#all', t().all), ...gemTab, ...slots.map((s) => { const w = state.worn[s.name], it = w && c.items[w[0]]; return tab(s.name, slotName(s), it && RARITY[it.rarity]); }), ...(changed ? [reset] : []));
  const q = state.itemQuery.trim().toLowerCase();
  if (state.mode === 'sets') {
    const rarityOf = (set) => set.items.map((id) => c.items[id].rarity).sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0] || 'common';
    rarities(c.sets.map(rarityOf));
    const sets = c.sets.filter((s) => (!q || (s.name?.[lang] || s.name?.en || s.key).toLowerCase().includes(q)) && (!state.rarity || rarityOf(s) === state.rarity));
    return body.replaceChildren(sets.length ? el('div', { className: 'cards' }, ...sets.map((s) => setCard(s, rarityOf(s)))) : el('p', { className: 'empty', textContent: t().noItems }));
  }
  if (state.tab === '#gem') { rarities([]); return body.replaceChildren(...gemSlots.map((s) => section(t().gem, itemName(c.items[shownIn(s.name)]), gemCards(s.name)))); }
  const shown = state.tab === '#all' ? slots : slots.filter((s) => s.name === state.tab);
  rarities(shown.flatMap((s) => s.items.map((id) => c.items[id].rarity)));
  const parts = [];
  // The worn item's choices, in its slot's tab.
  for (const s of shown) {
    if (state.tab !== s.name) continue;
    const id = shownIn(s.name), it = c.items[id], style = state.worn[s.name]?.[1] || 0;
    if (state.tab === s.name && it && it.styles.length > 1) parts.push(section(t().style, null, chips(it.styles.map((st, i) => [st.name?.[lang] || st.name?.en || String(i + 1), i === style, () => wear(s.name, id, i)]))));
    const rolls = unusualsOf(s.name);
    if (state.tab === s.name && rolls.length) { const now = state.unusual[s.name] ?? null; parts.push(section(t().unusual, null, chips([[t().noUnusual, now === null, () => setUnusual(s.name, null)], ...rolls.map((u) => [u.name[lang] || u.name.en, u.id === now, () => setUnusual(s.name, u.id)])]))); }
    if (state.tab === s.name && takesKinetic(s.name)) { const now = state.kinetic[s.name] ?? null; parts.push(section(t().kinetic, t().kineticTip, chips([[t().noUnusual, now === null, () => setKinetic(s.name, null)], ...state.kinetics.map((k) => [`${k.name[lang] || k.name.en}${k.changes?.length ? ` · ${k.changes.map(actName).join(', ')}` : ''}`, k.id === now, () => setKinetic(s.name, k.id)])]))); }
  }
  for (const s of shown) {
    const ids = s.items.filter((id) => (!q || itemName(c.items[id]).toLowerCase().includes(q)) && (!state.rarity || c.items[id].rarity === state.rarity));
    if (!ids.length) continue;
    const cards = el('div', { className: 'cards' }, ...ids.map((id) => itemCard(s, id)));
    parts.push(state.tab === '#all' ? section(slotName(s), String(ids.length), cards) : cards);
  }
  body.replaceChildren(...(parts.length ? parts : [el('p', { className: 'empty', textContent: t().noItems })]));
}
function tab(name, text, color) {
  const b = el('button', { type: 'button', className: 'tab', role: 'tab', textContent: text });
  if (color) { const d = el('i', { className: 'dot' }); d.style.setProperty('--c', color); b.append(d); }
  b.setAttribute('aria-selected', state.tab === name); b.onclick = () => setTab(name); return b;
}
const section = (title, note, ...content) => el('section', { className: 'section' }, el('h3', {}, title, note ? el('small', { textContent: note }) : null), ...content);
const chips = (list) => el('div', { className: 'chips' }, ...list.map(([text, on, act]) => { const b = el('button', { type: 'button', textContent: text }); b.setAttribute('aria-pressed', on); b.onclick = act; return b; }));
// The rarities a list has, as filters, in the game's order.
function rarities(list) {
  const have = RANK.filter((r) => list.includes(r)), box = $('[data-rarities]');
  if (have.length < 2) return box.replaceChildren();
  const chip = (r) => { const b = el('button', { type: 'button', textContent: r ? rarityName(r) : t().allRarities }); if (r) b.style.setProperty('--r', RARITY[r]); b.setAttribute('aria-pressed', state.rarity === r); b.onclick = () => { state.rarity = r; renderShelf(); }; return b; };
  box.replaceChildren(chip(null), ...have.map(chip));
}
// A card: a label over a framed picture (a badge on it), a name under; lit in colour.
function card({ label: text, pic, badge, marks = [], name, color, pressed, onclick, kind = '' }) {
  const pics = (Array.isArray(pic) ? pic : [pic]).filter(Boolean);
  const b = el('button', { type: 'button', className: `card ${kind}`, title: name },
    el('span', { className: 'label', textContent: text }),
    el('span', { className: `pic${kind === 'set' ? ` n${Math.min(pics.length, 4)}` : ''}` }, ...pics.map((src) => el('img', { src, alt: '', loading: 'lazy' })),
      badge ? el('span', { className: 'badge', textContent: badge }) : null, marks.length ? el('span', { className: 'marks' }, ...marks) : null),
    el('b', { textContent: name }));
  if (color) b.style.setProperty('--c', color);
  b.setAttribute('aria-pressed', !!pressed); b.onclick = onclick; return b;
}
function itemCard(s, id) {
  const it = state.catalog.items[id], worn = shownIn(s.name) === id, style = worn ? state.worn[s.name]?.[1] || 0 : 0;
  const marks = [];
  if (worn && state.unusual[s.name]) marks.push(el('i', { title: t().unusual }));
  if (worn && state.kinetic[s.name] != null) { const m = el('i', { title: t().kinetic }); m.style.setProperty('--g', '#f0a43c'); marks.push(m); }
  if (worn && gemOf(s.name)) { const m = el('i', { title: t().gem }); m.style.setProperty('--g', gemHex(gemOf(s.name))); marks.push(m); }
  return card({
    label: it.default ? t().defaultItem : state.tab === '#all' ? rarityName(it.rarity) : `${rarityName(it.rarity)} · ${slotName(s)}`,
    pic: iconOf(id, style), badge: worn ? t().worn : it.styles.length > 1 ? `${it.styles.length} ${t().styles}` : null, marks,
    name: itemName(it), color: it.default ? null : RARITY[it.rarity], pressed: worn, onclick: () => wear(s.name, id),
  });
}
// The gem it comes with first; the search finds them by name.
function gemCards(slot) {
  const now = gemOf(slot), own = socketed(slot), q = state.itemQuery.trim().toLowerCase(), list = [];
  if (!own && !q) list.push(card({ label: t().gemCard, pic: 'gems/gem.webp', name: t().noGem, pressed: !now, onclick: () => setGem(slot, null), kind: 'gem' }));
  const palette = [...state.palette].sort((a, b) => (b.key === own) - (a.key === own)).filter((g) => !q || [g.name[lang], g.name.en].some((n) => n?.toLowerCase().includes(q)));
  for (const g of palette) list.push(card({ label: t().gemCard, pic: gemPicture(g.hex), name: g.name[lang] || g.name.en, color: g.hex, pressed: g.key === now, onclick: () => setGem(slot, g.key), kind: 'gem' }));
  return el('div', { className: 'cards' }, ...list);
}
function setCard(set, rarity) {
  const c = state.catalog, on = set.items.every((id) => state.worn[c.items[id].slot]?.[0] === id);
  return card({
    label: `${rarityName(rarity)} · ${set.items.length} ${t().itemsN}`, pic: set.items.slice(0, 4).map((id) => iconOf(id)), name: set.name?.[lang] || set.name?.en || set.key,
    color: RARITY[rarity], pressed: on, kind: 'set', onclick: () => { const worn = { ...state.worn }; for (const id of set.items) worn[c.items[id].slot] = [id, 0]; dress(worn); renderShelf(); },
  });
}
$('[data-item-search]').addEventListener('input', (e) => { state.itemQuery = e.target.value; renderShelf(); });

// ---------------------------------------------------------------- backdrops
// The game's own backgrounds behind the hero (backgrounds/index.json): the dashboard's smoke by
// default, as in the game; the viewer's choice is kept in this browser.
const backdrop = { list: [], current: null, image: null };
const savedBackdrop = (() => { try { return localStorage.getItem('loadout-backdrop'); } catch { return null; } })();
// The part of an image that covers a w×h box, its floor (0 top, 1 bottom) a little above the box's bottom.
function cover(img, w, h, floor = 0.85) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s, sx = (img.naturalWidth - sw) / 2;
  const sy = Math.min(Math.max(floor * img.naturalHeight - 0.82 * sh, 0), img.naturalHeight - sh); return [sx, sy, sw, sh];
}
function setBackdrop(key, save = true) {
  const b = backdrop.list.find((x) => x.key === key) || null, stage = $('[data-stage]'); backdrop.current = b;
  if (save) { try { localStorage.setItem('loadout-backdrop', b ? b.key : 'none'); } catch { /* private mode */ } }
  if (!b) { backdrop.image = null; stage.style.backgroundImage = ''; stage.classList.remove('backdrop'); }
  else {
    const url = `backgrounds/${b.file}`, img = new Image(); img.src = url; backdrop.image = img;
    stage.style.backgroundImage = `radial-gradient(ellipse at 50% 60%, transparent 35%, rgba(0, 0, 0, 0.55)), url("${url}")`;
    stage.style.setProperty('--floor', `${Math.round((b.floor ?? 0.85) * 100)}%`); stage.classList.add('backdrop');
  }
  if (state.mode === 'backdrops') renderShelf();
}
function backdropCards() {
  const q = state.itemQuery.trim().toLowerCase(), list = backdrop.list.filter((b) => !q || [b.name[lang], b.name.en].some((n) => n?.toLowerCase().includes(q)));
  return el('div', { className: 'cards backdrops' },
    card({ label: t().backdrop, pic: null, name: t().noBackdrop, pressed: !backdrop.current, onclick: () => setBackdrop(null), kind: 'backdrop' }),
    ...list.map((b) => card({ label: t().backdrop, pic: `backgrounds/${b.file}`, name: b.name[lang] || b.name.en, pressed: backdrop.current === b, onclick: () => setBackdrop(b.key), kind: 'backdrop' })));
}
fetch('backgrounds/index.json').then((r) => (r.ok ? r.json() : { backgrounds: [] })).then((d) => {
  backdrop.list = d.backgrounds || []; setBackdrop(savedBackdrop === 'none' ? null : savedBackdrop || 'dashboard', false);
}).catch(() => {});

// ---------------------------------------------------------------- the stage's tools
// Pause: the hero, his effects and his clock stand still; he still turns.
function renderPause() { const b = $('[data-pause]'); b.replaceChildren(viewer.paused ? '▶' : '❚❚', el('span', { className: 'word', textContent: viewer.paused ? t().play : t().pause })); b.setAttribute('aria-pressed', viewer.paused); }
$('[data-pause]').onclick = () => { viewer.paused = !viewer.paused; renderPause(); };
// A frame or a video of the stage as it looks: the canvas over the stage's black.
const fileName = (ext) => `${state.current?.id || 'hero'}-loadout.${ext}`;
const download = (blob, name) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
const flat = document.createElement('canvas'), flatten = () => {
  if (flat.width !== canvas.width || flat.height !== canvas.height) { flat.width = canvas.width; flat.height = canvas.height; }
  const x = flat.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, flat.width, flat.height);
  // The backdrop as the stage shows it: covering, its floor at the pedestal's.
  const img = backdrop.image; if (img?.complete && img.naturalWidth) { const [sx, sy, sw, sh] = cover(img, flat.width, flat.height, backdrop.current?.floor); x.drawImage(img, sx, sy, sw, sh, 0, 0, flat.width, flat.height); }
  x.drawImage(canvas, 0, 0);
};
$('[data-save-frame]').onclick = () => {
  const once = () => { afterFrame.delete(once); flatten(); flat.toBlob((b) => { if (b) { download(b, fileName('png')); toast(t().saved); } }, 'image/png'); };
  afterFrame.add(once);
};
const recording = { recorder: null, started: 0, timer: 0 };
function renderRecord() {
  const b = $('[data-save-video]'), on = !!recording.recorder; b.classList.toggle('rec', on);
  const s = on ? Math.floor((performance.now() - recording.started) / 1000) : 0;
  b.textContent = on ? `${t().stop} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : t().saveVideo;
}
$('[data-save-video]').onclick = () => {
  if (recording.recorder) { recording.recorder.stop(); return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => globalThis.MediaRecorder?.isTypeSupported(m));
  if (!type || !flat.captureStream) { toast(t().noVideo); return; }
  flatten(); afterFrame.add(flatten);
  const chunks = [], r = new MediaRecorder(flat.captureStream(60), { mimeType: type, videoBitsPerSecond: 16e6 });
  r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  r.onstop = () => { afterFrame.delete(flatten); clearInterval(recording.timer); recording.recorder = null; renderRecord(); download(new Blob(chunks, { type }), fileName(type.startsWith('video/mp4') ? 'mp4' : 'webm')); toast(t().saved); };
  recording.recorder = r; recording.started = performance.now(); r.start(250);
  // A minute at most.
  recording.timer = setInterval(() => { renderRecord(); if (performance.now() - recording.started > 60000) r.stop(); }, 250);
  renderRecord();
};
$('[data-reset]').onclick = () => { viewer.rotate(0); viewer.zoom(1); };
// The address is the outfit: copied as it is.
$('[data-share]').onclick = async () => { try { await navigator.clipboard.writeText(location.href); } catch { /* no clipboard */ } toast(t().shared); };
function toast(text) { const n = $('[data-toast]'); n.textContent = text; n.classList.add('on'); clearTimeout(toast.timer); toast.timer = setTimeout(() => n.classList.remove('on'), 1600); }

// ---------------------------------------------------------------- controls
$('[data-lang-toggle]').onclick = () => { lang = lang === 'ru' ? 'en' : 'ru'; try { localStorage.setItem('loadout-lang', lang); } catch { /* private mode */ } applyTexts(); };
$('[data-search]').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
$('[data-search]').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = document.querySelector('.picker .card'); if (first) { location.hash = first.dataset.id; closePicker(); } }
  if (e.key === 'Escape') { if (e.target.value) { e.target.value = ''; state.query = ''; renderList(); } else closePicker(); }
});
$('[data-open-picker]').onclick = openPicker;
$('[data-close-picker]').onclick = closePicker;
$('[data-picker]').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePicker(); });
// The hero before or after in the picker's order.
const step = (by) => { const list = ordered(), i = list.findIndex((h) => h.id === state.current?.id), next = list[(i + by + list.length) % list.length]; if (next) location.hash = next.id; };
$('[data-prev]').onclick = () => step(-1);
$('[data-next]').onclick = () => step(1);
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && !$('[data-picker]').hidden) { closePicker(); return; }
  if (e.key === 'Escape') { closeMenu(); return; }
  if (e.key === '/') { e.preventDefault(); openPicker(); return; }
  if (e.key === ' ' && !e.target.matches('button, a')) { e.preventDefault(); $('[data-pause]').click(); return; }
  // Up and down step through the roster in the picker's order.
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'k') { e.preventDefault(); step(e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1); }
  if (e.key === 'ArrowLeft') viewer.rotate(-0.6, { relative: true });
  if (e.key === 'ArrowRight') viewer.rotate(0.6, { relative: true });
});
window.addEventListener('hashchange', () => {
  const { id, worn, gems: g0, unusual: u0, kinetic: k0 } = parseHash(); if (id !== state.current?.id) return open(id);
  const moved = (o) => Object.fromEntries(Object.entries(o).map(([slot, v]) => [slotNow(worn, slot), v])), gems = moved(g0), unusual = moved(u0), kinetic = moved(k0);
  dress(worn);
  // The gems it names, in the items it names (those still loading take theirs when they are on).
  for (const slot of new Set([...Object.keys(state.gems), ...Object.keys(gems)])) { if (gems[slot] && state.worn[slot]) state.gems[slot] = gems[slot]; else delete state.gems[slot]; viewer.gem(slot, gemHex(gemOf(slot))); }
  for (const slot of new Set([...Object.keys(state.unusual), ...Object.keys(unusual)])) { if (unusual[slot] && state.worn[slot]) state.unusual[slot] = unusual[slot]; else delete state.unusual[slot]; viewer.unusual(slot, state.unusual[slot] ?? null); }
  for (const slot of new Set([...Object.keys(state.kinetic), ...Object.keys(kinetic)])) { if (kinetic[slot] != null && state.worn[slot]) state.kinetic[slot] = kinetic[slot]; else delete state.kinetic[slot]; viewer.kinetic(slot, kineticOf(state.kinetic[slot])?.activities || null); }
  writeHash(); renderShelf();
});

const dialog = $('[data-embed-dialog]');
$('[data-embed]').onclick = () => {
  const id = state.current?.id || 'nevermore';
  // The element, dressed as the hero is now (the address keeps the outfit).
  $('[data-embed-code]').textContent = `<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/",
  "dota-loadout/element": "https://cdn.jsdelivr.net/npm/dota-loadout@0.1/src/element.js"
} }
</script>
<script type="module">import 'dota-loadout/element';</script>

<dota-hero loadout="${location.hash || `#${id}`}" style="width: 480px; height: 640px"></dota-hero>`;
  dialog.showModal();
};
$('[data-copy]').onclick = async () => {
  try { await navigator.clipboard.writeText($('[data-embed-code]').textContent); $('[data-copy]').textContent = t().copied; setTimeout(() => { $('[data-copy]').textContent = t().copy; }, 1500); } catch { /* no clipboard */ }
};

// ---------------------------------------------------------------- start
applyTexts();
try {
  const response = await fetch('heroes/index.json'); state.index = await response.json(); state.heroes = state.index.heroes;
  state.palette = await fetch('gems.json').then((r) => (r.ok ? r.json() : null)).then((g) => g?.prismatic || []).catch(() => []);
  applyTexts();
  gemArtReady.then(() => renderShelf());
  await open(parseHash().id || 'nevermore');
} catch (e) {
  $('[data-status-text]').textContent = t().failed; $('[data-status]').classList.add('error'); console.error(e);
}
