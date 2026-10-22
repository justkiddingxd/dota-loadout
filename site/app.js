// Loadout: as a shooter's collection screen. The hero's name huge behind him; on the left his slots, then
// sets, courier, ward, backdrop and effigy; on the right the choices of the one picked. A click puts a
// thing on, a click on the worn one takes it off; a thing on him can be clicked to open its slot. Under
// him: animation, pause, a frame, a video, the embed code, the outfit for the game.
import { abilityOf } from '../src/index.js';
import { animName, ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from './kit.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const plural = (n, one, few, many) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;
const T = ru ? {
  heroes: 'Герои', share: 'Ссылка', copied: 'Скопировано', standard: 'Стандарт', empty: 'Пусто', none: 'Нет', find: 'Поиск', nothing: 'Ничего не нашлось', findHero: 'Найти героя', close: 'Закрыть',
  skins: (n) => plural(n, 'облик', 'облика', 'обликов'), items: (n) => plural(n, 'предмет', 'предмета', 'предметов'), off: 'нажмите ещё раз, чтобы снять',
  outfit: 'Наряд', more: 'Ещё', sets: 'Наборы', courier: 'Курьер', ward: 'Вард', backdrop: 'Фон', effigy: 'Статуя',
  variants: 'Варианты', gem: 'Призматический самоцвет', unusual: 'Необычный эффект', kinetic: 'Кинетический самоцвет', kineticTip: 'меняет анимации', abilities: 'Эффекты способностей', abilitiesTip: 'нажмите, чтобы показать', taunt: 'Показать насмешку',
  setOn: 'Надет', screens: 'Загрузочные экраны героя', scenes: 'Сцены', noBackdrop: 'Без фона', stuffs: { gold: 'Золото', frost: 'Лёд', jade: 'Нефрит', stone: 'Камень' }, hero: 'Герой', effigyTip: 'Выберите анимацию и поставьте паузу: это поза статуи.',
  frame: 'Кадр', video: 'Видео', stop: 'Стоп', pause: 'Пауза', play: 'Пуск', embed: 'Встроить', saved: 'Сохранено', noVideo: 'Браузер не умеет записывать видео', anim: 'Анимация',
  embedText: 'Герой в этом наряде на любой странице: элемент <dota-hero> из npm-пакета dota-loadout. Модели грузятся с этого сайта.', copy: 'Копировать',
  game: 'В игру', gameText: 'Этот наряд в самой Dota 2, у вас на компьютере (другие игроки его не видят): файл игры items_game.txt, в котором стандартные предметы героя выглядят как надетые здесь — модели и стили, эффекты, анимации, иконки способностей, необычный эффект, кинетический и призматический самоцветы. Это мод файлов игры: на ваш страх и риск.',
  gameSteps: ['Скачайте pak01_dir.vpk и положите его в папку dota 2 beta/game/dota_loadout (создайте её).', 'В файле dota 2 beta/game/dota/gameinfo.gi над строкой «Game dota» добавьте строку «Game dota_loadout».', 'Один файл — один герой: следующий заменяет прежний. После обновления Доты скачайте файл заново и снова добавьте строку.'],
  download: 'Скачать pak01_dir.vpk', loadingGame: (mb) => `Загрузка файла игры… ${mb} МБ`, building: 'Сборка…', gameFailed: 'Не удалось собрать файл', gameNothing: 'Нечего ставить: на герое только стандартные предметы', gameLeft: 'Не вошло:',
  gameWhy: { pet: 'курьеры и варды так не ставятся', 'no default': 'у героя нет стандартного предмета в этом слоте', unknown: 'предмета нет в файле игры', 'other hero': 'предмета нет в файле игры' },
} : {
  heroes: 'Heroes', share: 'Link', copied: 'Copied', standard: 'Default', empty: 'Empty', none: 'None', find: 'Search', nothing: 'Nothing found', findHero: 'Find a hero', close: 'Close',
  skins: (n) => `${n} skins`, items: (n) => `${n} items`, off: 'click again to take it off',
  outfit: 'Outfit', more: 'More', sets: 'Sets', courier: 'Courier', ward: 'Ward', backdrop: 'Backdrop', effigy: 'Effigy',
  variants: 'Variants', gem: 'Prismatic gem', unusual: 'Unusual effect', kinetic: 'Kinetic gem', kineticTip: 'changes animations', abilities: 'Ability effects', abilitiesTip: 'click to show', taunt: 'Play the taunt',
  setOn: 'Worn', screens: "The hero's loading screens", scenes: 'Scenes', noBackdrop: 'None', stuffs: { gold: 'Gold', frost: 'Frost', jade: 'Jade', stone: 'Stone' }, hero: 'Hero', effigyTip: 'Pick an animation and pause: that is the statue’s pose.',
  frame: 'Frame', video: 'Video', stop: 'Stop', pause: 'Pause', play: 'Play', embed: 'Embed', saved: 'Saved', noVideo: 'This browser cannot record video', anim: 'Animation',
  embedText: 'The hero in this outfit on any page: the <dota-hero> element of the dota-loadout npm package. Models load from this site.', copy: 'Copy',
  game: 'To the game', gameText: 'This outfit in Dota 2 itself, on your computer (other players do not see it): the game’s items_game.txt in which the hero’s default items look like what he wears here — models and styles, effects, animations, ability icons, the unusual effect, kinetic and prismatic gems. It is a mod of the game’s files: at your own risk.',
  gameSteps: ['Download pak01_dir.vpk and put it in the folder dota 2 beta/game/dota_loadout (make it).', 'In dota 2 beta/game/dota/gameinfo.gi, add the line “Game dota_loadout” above the line “Game dota”.', 'One file, one hero: the next replaces the last. After a Dota update, download the file again and add the line again.'],
  download: 'Download pak01_dir.vpk', loadingGame: (mb) => `Loading the game’s file… ${mb} MB`, building: 'Building…', gameFailed: 'Could not build the file', gameNothing: 'Nothing to put on: he wears only his defaults', gameLeft: 'Left out:',
  gameWhy: { pet: 'couriers and wards cannot go in this way', 'no default': 'the hero has no default item in this slot', unknown: 'the item is not in the game’s file', 'other hero': 'the item is not in the game’s file' },
};
const ACCENT = { str: '#e5533d', agi: '#4ec46b', int: '#3fa7e8', all: '#c58cf0' };
const STUFFS = { gold: '#e0a040', frost: '#9fd0ff', jade: '#3fa36a', stone: '#8a8580' };
const NPM = 'dota-loadout@0.1';
// What the right side shows: a slot's name, or one of the extras.
const EXTRAS = ['#sets', '#courier', '#ward', '#backdrop', '#effigy'];
const ui = { slot: null, query: '', line: null, effigy: null };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { if (!EXTRAS.includes(ui.slot)) ui.slot = null; ui.query = ''; heroScreens(); } render(); },
});
const viewer = kit.viewer, look = kit.look;
const setName = (s) => say(s.name) || s.key.replace(/_/g, ' ');

function render() {
  const hero = kit.hero; if (!hero) return;
  if (!ui.slot || (!EXTRAS.includes(ui.slot) && !kit.slots().some((s) => s.name === ui.slot))) ui.slot = kit.slots()[0]?.name || '#sets';
  document.documentElement.style.setProperty('--accent', ACCENT[hero.attribute]);
  document.title = `${say(hero.name)} — Loadout`;
  renderList(); renderTitle(); renderSide(); renderTools();
}

// ---- left: the slots, then the extras
function renderList() {
  const body = new Set(kit.bodySlots().map((s) => s.name));
  const pick = h('button', { type: 'button', class: 'pick', 'data-pick': '' }, h('span', { html: icon('back', 16) }), T.heroes); pick.onclick = openRoster;
  const share = h('button', { type: 'button', class: 'pick' }); shareButton(share);
  const langB = h('button', { type: 'button', class: 'pick', title: ru ? 'English' : 'Русский' }, ru ? 'EN' : 'RU');
  langB.onclick = () => { try { localStorage.setItem('loadout-lang', ru ? 'en' : 'ru'); } catch { /* private mode */ } location.reload(); };
  const row = (key, name, pic, rarity) => {
    const b = h('button', { type: 'button', class: 'slot', 'data-slot': key, 'aria-pressed': String(ui.slot === key), style: { '--r': rarity || 'transparent' } }, h('span', { class: 'name' }, name), h('span', { class: 'pic' }, pic ? h('img', { src: pic, alt: '' }) : null));
    b.onclick = () => choose(key);
    if (body.has(key)) { b.onmouseenter = () => { ui.line = key; }; b.onmouseleave = () => { ui.line = null; }; }
    return b;
  };
  const slots = kit.slots().map((s) => { const id = kit.shown(s.name), it = kit.item(id); return row(s.name, say(s.text), id && kit.picture(id, kit.styleOf(s.name)), it && !it.default ? RARITY[it.rarity] : null); });
  const pet = (k) => { const w = look.worn[k], p = w && pets.data?.[`${k}s`].find((x) => x.id === w[0]); const st = p && (p.styles[w[1] || 0]?.icon ? p.styles[w[1] || 0] : p.styles.find((x) => x.icon)); return st ? `/items/${p.id}/${st.icon}` : null; };
  const set = kit.sets().find((s) => kit.wearing(s));
  const extras = [row('#sets', T.sets, set ? kit.picture(set.items[0]) : null), row('#courier', T.courier, pet('courier')), row('#ward', T.ward, pet('ward')), row('#backdrop', T.backdrop, backdrop.current ? backdrop.current.thumb || backdrop.current.url : null), row('#effigy', T.effigy, null)];
  $('[data-slots]').replaceChildren(h('div', { class: 'head' }, pick, share, langB), h('h3', {}, T.outfit), ...slots, h('h3', {}, T.more), ...extras);
}
function choose(key) { ui.slot = key; ui.query = ''; render(); }

// ---- over him: his name behind, the chosen thing's name below
function renderTitle() {
  const hero = kit.hero;
  $('[data-title]').replaceChildren(h('p', { class: 'attr' }, h('img', { src: `/attributes/${hero.attribute}.webp`, alt: '' }), ATTRIBUTE[lang][hero.attribute]), h('h1', {}, say(hero.name)));
  const s = kit.slots().find((x) => x.name === ui.slot), id = s && kit.shown(s.name), it = kit.item(id);
  $('[data-now]').replaceChildren(...(s ? [h('span', { class: 'state' }, say(s.text)), h('b', {}, !it ? T.empty : it.default ? T.standard : say(it.name)), it && !it.default ? h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)) : null].filter(Boolean) : []));
}

// ---- right: the choices
function renderSide() {
  const key = ui.slot;
  if (key === '#sets') return side(T.sets, T.items(kit.sets().length), setsGrid());
  if (key === '#courier' || key === '#ward') return petSide(key.slice(1));
  if (key === '#backdrop') return side(T.backdrop, null, backdropGrid());
  if (key === '#effigy') return side(T.effigy, null, effigyGrid());
  const s = kit.slots().find((x) => x.name === key); if (s) slotSide(s);
}
// A panel: its title, a search if it has one, and what scrolls.
function side(title, count, ...body) { $('[data-side]').replaceChildren(h('header', {}, h('h2', {}, title), count ? h('span', {}, count) : null), h('div', { class: 'scroll' }, ...body)); }
function search(fill) {
  const input = h('input', { type: 'search', placeholder: T.find, value: ui.query, 'aria-label': T.find });
  input.oninput = () => { ui.query = input.value; fill(); };
  return h('label', { class: 'find', html: icon('search', 16) }, input);
}
const section = (title, note, ...body) => h('section', { class: 'extra' }, h('h3', {}, title, note ? h('small', {}, note) : null), ...body);
const chips = (list) => h('div', { class: 'chips' }, ...list.map(([text, on, act]) => { const b = h('button', { type: 'button', 'aria-pressed': String(on) }, text); b.onclick = act; return b; }));

function slotSide(s) {
  const worn = kit.shown(s.name), cur = kit.item(worn), style = kit.styleOf(s.name), mine = look.worn[s.name];
  const grid = h('div', { class: 'grid', 'data-grid': '' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id);
      const b = h('button', { type: 'button', class: 'item', 'aria-pressed': String(id === worn), title: it.default ? T.standard : id === worn ? `${say(it.name)}: ${T.off}` : say(it.name), style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } },
        h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), id === worn ? h('span', { class: 'mark', html: icon('check', 12) }) : null);
      b.onclick = () => toggle(s, id); return b;
    }) : [h('p', { class: 'none' }, T.nothing)]));
  };
  fill();
  const extras = [];
  if (cur && !cur.default && cur.styles.length > 1) extras.push(section(T.variants, null, h('div', { class: 'variants' }, ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(style === i), title: say(st.name) || String(i + 1) }, h('img', { src: kit.picture(worn, i), alt: say(st.name) || String(i + 1) })); b.onclick = () => kit.wear(s.name, worn, i); return b; }))));
  if (mine && cur?.prismatic && palette.length) {
    const own = typeof cur.prismatic === 'string' ? cur.prismatic : null, now = look.gems[s.name] || own;
    extras.push(section(T.gem, null, h('div', { class: 'gems' }, ...[...(own ? [] : [null]), ...[...palette].sort((a, b) => (b.key === own) - (a.key === own))].map((g) => {
      const b = h('button', { type: 'button', 'aria-pressed': String((g?.key || null) === now), title: g ? say(g.name) : T.none }, g ? h('img', { src: gemPicture(g.hex) || '/gems/gem.webp', alt: '' }) : h('span', { html: icon('close', 16) }));
      b.onclick = () => kit.gem(s.name, g?.key || null); return b;
    }))));
  }
  if (mine && cur?.unusual?.length) { const now = look.unusual[s.name] ?? null; extras.push(section(T.unusual, null, chips([[T.none, now === null, () => kit.unusual(s.name, null)], ...cur.unusual.map((u) => [say(u.name), u.id === now, () => kit.unusual(s.name, u.id)])]))); }
  if (mine && look.kinetics.length) { const now = look.kinetic[s.name] ?? null; extras.push(section(T.kinetic, T.kineticTip, chips([[T.none, now === null, () => kit.kinetic(s.name, null)], ...look.kinetics.map((k) => [say(k.name), k.id === now, () => kit.kinetic(s.name, k.id)])]))); }
  if (/^taunt/.test(s.name) && mine) extras.push(section(T.taunt, null, chips([[`▶ ${T.taunt}`, false, playTaunt]])));
  const fx = mine ? abilityEffects(s.name) : [];
  if (fx.length) extras.push(section(T.abilities, T.abilitiesTip, chips(fx.map((g) => [`▶ ${g.name}`, false, () => castEffects(g)]))));
  $('[data-side]').replaceChildren(h('header', {}, h('h2', {}, say(s.text)), h('span', {}, T.skins(s.items.length))), search(fill), h('div', { class: 'scroll' }, grid, ...extras));
}
// A click puts a skin on; on the one he wears (not his own default) it takes it off again.
async function toggle(s, id) {
  const it = kit.item(id), on = look.worn[s.name]?.[0] === id;
  await kit.wear(s.name, on || it.default ? null : id, 0);
  if (/^taunt/.test(s.name) && !on && !it.default) playTaunt();
}
const playTaunt = () => { const a = viewer.animations.find((x) => x.activity === 'ACT_DOTA_TAUNT'); if (a) play(a.name); };

// The effects a slot's item puts in place of the hero's abilities', by ability.
function abilityEffects(slot) {
  const hero = kit.hero, groups = new Map();
  for (const { from } of viewer.abilityEffects.filter((x) => x.slot === slot && !/loadout|ambient|portrait|_idle/.test(x.from.split('/').pop()))) {
    const i = abilityOf(from, hero.abilities || []), key = i >= 0 ? i : from;
    (groups.get(key) || groups.set(key, { i, name: i >= 0 ? say(hero.abilities[i].name) : from.split('/').pop().replace(/_/g, ' '), systems: [] }).get(key)).systems.push(from);
  }
  return [...groups.values()].sort((a, b) => (a.i < 0) - (b.i < 0) || a.i - b.i);
}
function castEffects(g) {
  const a = g.i >= 0 && viewer.animations.find((x) => x.activity === `ACT_DOTA_CAST_ABILITY_${g.i + 1}`);
  if (a) play(a.name);
  setTimeout(() => { for (const s of g.systems) viewer.cast(s); }, a ? 250 : 0);
}

// ---- sets: a click puts a whole set on, a click on the worn one takes it off
function setsGrid() {
  return h('div', { class: 'sets' }, ...kit.sets().map((s) => {
    const on = kit.wearing(s), pics = s.items.slice(0, 4).map((id) => kit.picture(id));
    const b = h('button', { type: 'button', class: 'set', 'aria-pressed': String(on), style: { '--r': RARITY[s.rarity] } },
      h('span', { class: `collage n${pics.length}` }, ...pics.map((src) => h('img', { src, alt: '', loading: 'lazy' }))),
      h('span', { class: 'sname' }, setName(s)), h('span', { class: 'srar' }, on ? T.setOn : `${rarityName(s.rarity)}, ${T.items(s.items.length)}`));
    b.onclick = async () => { if (on) { for (const id of s.items) await kit.wear(kit.item(id).slot, null); } else await kit.wearSet(s); };
    return b;
  }));
}

// ---- courier and ward: any hero's, they stay when he changes
const pets = { data: null };
async function petSide(kind) {
  pets.data ||= await look.couriers();
  if (ui.slot !== `#${kind}`) return;
  const list = pets.data[`${kind}s`] || [], worn = look.worn[kind];
  const grid = h('div', { class: 'grid' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), xs = list.filter((x) => !q || [x.name.en, x.name.ru].some((n) => n?.toLowerCase().includes(q)));
    grid.replaceChildren(...(xs.length ? xs.map((x) => {
      const on = worn?.[0] === x.id, pic = x.styles[on ? worn[1] || 0 : 0]?.icon || x.styles.find((st) => st.icon)?.icon;
      const b = h('button', { type: 'button', class: 'item', 'aria-pressed': String(on), title: on ? `${say(x.name)}: ${T.off}` : say(x.name), style: { '--r': x.default ? 'transparent' : RARITY[x.rarity] } }, pic ? h('img', { src: `/items/${x.id}/${pic}`, alt: '', loading: 'lazy' }) : null, on ? h('span', { class: 'mark', html: icon('check', 12) }) : null);
      b.onclick = () => kit.wear(kind, on ? null : x.id, 0); return b;
    }) : [h('p', { class: 'none' }, T.nothing)]));
  };
  fill();
  const cur = worn && list.find((x) => x.id === worn[0]);
  const variants = cur && cur.styles.length > 1 ? section(T.variants, null, chips(cur.styles.map((st, i) => [say(st.name) || String(i + 1), (worn[1] || 0) === i, () => kit.wear(kind, cur.id, i)]))) : null;
  $('[data-side]').replaceChildren(h('header', {}, h('h2', {}, kind === 'courier' ? T.courier : T.ward), h('span', {}, T.items(list.length))), search(fill), h('div', { class: 'scroll' }, variants, grid));
}

// ---- backdrops: none (the collection's own navy), his loading screens, the game's scenes
const backdrop = { list: [], screens: [], current: null, image: null };
const savedBackdrop = (() => { try { return localStorage.getItem('loadout-backdrop-v12'); } catch { return null; } })();
const screenOf = (s) => ({ key: `ls${s.id}`, name: s.name, url: `/screens/${s.id}.webp`, thumb: `/screens/${s.id}-s.webp` });
async function heroScreens() { const hero = kit.hero, d = await fetch(`/heroes/${hero.id}/screens.json`).then((r) => (r.ok ? r.json() : { screens: [] })).catch(() => ({ screens: [] })); if (kit.hero === hero) { backdrop.screens = d.screens || []; if (ui.slot === '#backdrop') renderSide(); } }
function setBackdrop(b, save = true) {
  backdrop.current = b; const layer = $('[data-backdrop]');
  if (save) { try { localStorage.setItem('loadout-backdrop-v12', b ? JSON.stringify(b) : 'none'); } catch { /* private mode */ } }
  if (!b) { backdrop.image = null; layer.hidden = true; } else { const img = new Image(); img.src = b.url; backdrop.image = img; layer.style.backgroundImage = `url("${b.url}")`; layer.hidden = false; }
  if (kit.hero) render();
}
function backdropGrid() {
  const card = (b, name) => { const on = (backdrop.current?.key || null) === (b?.key || null), x = h('button', { type: 'button', class: 'scene', 'aria-pressed': String(on) }, h('span', { class: 'pic' }, b ? h('img', { src: b.thumb || b.url, alt: '', loading: 'lazy' }) : null), h('span', {}, name)); x.onclick = () => setBackdrop(b); return x; };
  return h('div', {}, h('div', { class: 'scenes' }, card(null, T.noBackdrop)),
    backdrop.screens.length ? section(T.screens, String(backdrop.screens.length), h('div', { class: 'scenes' }, ...backdrop.screens.map((s) => card(screenOf(s), say(s.name))))) : null,
    section(T.scenes, null, h('div', { class: 'scenes' }, ...backdrop.list.map((b) => card(b, say(b.name))))));
}
fetch('/backgrounds/index.json').then((r) => (r.ok ? r.json() : { backgrounds: [] })).then((d) => {
  backdrop.list = (d.backgrounds || []).map((b) => ({ key: b.key, name: b.name, url: `/backgrounds/${b.file}` }));
  try { const s = savedBackdrop && savedBackdrop !== 'none' ? JSON.parse(savedBackdrop) : null; if (s?.url) setBackdrop(s, false); } catch { /* an old value */ }
}).catch(() => {});

// ---- effigy: a statue of gold, frost, jade or stone; the pause holds the pose
function effigyGrid() {
  const stuffs = [[null, T.hero, '#3a4652'], ...Object.entries(STUFFS).map(([k, c]) => [k, T.stuffs[k], c])];
  return h('div', {}, h('p', { class: 'tipline' }, T.effigyTip), h('div', { class: 'stuffs' }, ...stuffs.map(([k, name, c]) => {
    const b = h('button', { type: 'button', class: 'stuff', 'aria-pressed': String(ui.effigy === k), style: { '--c': c } }, h('span', { class: 'ball' }), h('span', {}, name));
    b.onclick = () => { ui.effigy = k; viewer.statue(k); if (k && !viewer.paused) viewer.paused = true; if (!k && viewer.paused) viewer.paused = false; render(); }; return b;
  })));
}

// ---- under him: animation, pause, frame, video, embed, to the game
function play(name) { viewer.play(name); const sel = $('[data-tools] select'); if (sel) sel.value = name; }
function renderTools() {
  const list = viewer.animations, sel = h('select', { 'aria-label': T.anim }, ...list.map((a) => h('option', { value: a.name }, animName(kit.hero, a))));
  const playing = list.find((a) => a.name === renderTools.last) || list.find((a) => a.activity === 'ACT_DOTA_LOADOUT') || list[0];
  if (playing) sel.value = playing.name;
  sel.onchange = () => { renderTools.last = sel.value; viewer.play(sel.value); };
  const pause = h('button', { type: 'button', class: 'tool', 'aria-pressed': String(viewer.paused), title: viewer.paused ? T.play : T.pause, 'aria-label': viewer.paused ? T.play : T.pause, html: icon(viewer.paused ? 'play' : 'pause', 16) }); pause.onclick = () => { viewer.paused = !viewer.paused; renderTools(); };
  const frame = h('button', { type: 'button', class: 'tool' }, T.frame); frame.onclick = saveFrame;
  const video = h('button', { type: 'button', class: `tool${recording.recorder ? ' rec' : ''}` }, recording.recorder ? `${T.stop} ${clock()}` : T.video); video.onclick = toggleVideo;
  const embed = h('button', { type: 'button', class: 'tool' }, T.embed); embed.onclick = openEmbed;
  const game = h('button', { type: 'button', class: 'tool' }, T.game); game.onclick = openGame;
  $('[data-tools]').replaceChildren(h('label', { class: 'anim' }, sel, h('span', { html: icon('down', 14) })), pause, frame, video, embed, game);
}
// A frame or a video of the stage as it looks: the canvas over the backdrop (or the navy).
const canvas = $('[data-view]'), flat = document.createElement('canvas');
function flatten() {
  if (flat.width !== canvas.width || flat.height !== canvas.height) { flat.width = canvas.width; flat.height = canvas.height; }
  const x = flat.getContext('2d'); x.fillStyle = '#0f1923'; x.fillRect(0, 0, flat.width, flat.height);
  const img = backdrop.image;
  if (img?.complete && img.naturalWidth) { const s = Math.max(flat.width / img.naturalWidth, flat.height / img.naturalHeight), sw = flat.width / s, sh = flat.height / s; x.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, flat.width, flat.height); x.fillStyle = 'rgba(15, 25, 35, 0.45)'; x.fillRect(0, 0, flat.width, flat.height); }
  x.drawImage(canvas, 0, 0);
}
const fileName = (ext) => `${kit.hero?.id || 'hero'}-loadout.${ext}`;
const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
const nextFrame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
async function saveFrame() { await nextFrame(); flatten(); flat.toBlob((b) => { if (b) { download(b, fileName('png')); toast(T.saved); } }, 'image/png'); }
const recording = { recorder: null, started: 0, timer: 0, loop: 0 };
const clock = () => { const s = Math.floor((performance.now() - recording.started) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function toggleVideo() {
  if (recording.recorder) { recording.recorder.stop(); return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => globalThis.MediaRecorder?.isTypeSupported(m));
  if (!type || !flat.captureStream) { toast(T.noVideo); return; }
  const tick = () => { flatten(); recording.loop = requestAnimationFrame(tick); }; tick();
  const chunks = [], r = new MediaRecorder(flat.captureStream(60), { mimeType: type, videoBitsPerSecond: 16e6 });
  r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  r.onstop = () => { cancelAnimationFrame(recording.loop); clearInterval(recording.timer); recording.recorder = null; renderTools(); download(new Blob(chunks, { type }), fileName(type.startsWith('video/mp4') ? 'mp4' : 'webm')); toast(T.saved); };
  recording.recorder = r; recording.started = performance.now(); r.start(250);
  // A minute at most.
  recording.timer = setInterval(() => { renderTools(); if (performance.now() - recording.started > 60000) r.stop(); }, 500);
  renderTools();
}
const dialog = $('[data-embed]');
function openEmbed() {
  const code = `<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/",
  "dota-loadout/element": "https://cdn.jsdelivr.net/npm/${NPM}/src/element.js"
} }
</script>
<script type="module">import 'dota-loadout/element';</script>

<dota-hero loadout="${look.address}" style="width: 480px; height: 640px"></dota-hero>`;
  const copy = h('button', { type: 'button', class: 'primary' }, T.copy);
  copy.onclick = async () => { try { await navigator.clipboard.writeText(code); copy.textContent = T.copied; setTimeout(() => { copy.textContent = T.copy; }, 1500); } catch { /* no clipboard */ } };
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 20) }); close.onclick = () => dialog.close();
  dialog.replaceChildren(h('header', {}, h('h2', {}, T.embed), close), h('p', {}, T.embedText), h('pre', {}, h('code', {}, code)), copy);
  dialog.showModal();
}
// The outfit for the game itself: how to put it in, and the file (kit.toGame) with what went in.
function openGame() {
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 20) }); close.onclick = () => dialog.close();
  const get = h('button', { type: 'button', class: 'primary' }, T.download), report = h('div', { class: 'report' });
  const nameOf = (slot) => say(kit.slots().find((s) => s.name === slot)?.text) || T[slot] || slot;
  get.onclick = async () => {
    get.disabled = true; report.replaceChildren();
    try {
      const { file, done, skipped } = await kit.toGame((n) => { get.textContent = n < 0 ? T.building : T.loadingGame((n / 1048576).toFixed(0)); });
      if (file) download(new Blob([file], { type: 'application/octet-stream' }), 'pak01_dir.vpk');
      const extras = (d) => [d.unusual != null && T.unusual, d.kinetic != null && T.kinetic, d.color && T.gem].filter(Boolean).map((x) => x.toLowerCase());
      report.replaceChildren(...[
        file ? h('ul', {}, ...done.map((d) => h('li', {}, h('b', {}, nameOf(d.slot)), ` ${say(kit.item(d.item)?.name)}`, extras(d).length ? h('small', {}, ` + ${extras(d).join(', ')}`) : null))) : h('p', {}, T.gameNothing),
        skipped.length ? h('p', {}, T.gameLeft, ...skipped.map((x) => h('span', {}, ` ${nameOf(x.slot)} — ${T.gameWhy[x.reason] || x.reason}.`))) : null].filter(Boolean));
    } catch (e) { console.error(e); report.replaceChildren(h('p', {}, T.gameFailed)); }
    get.disabled = false; get.textContent = T.download;
  };
  dialog.replaceChildren(h('header', {}, h('h2', {}, T.game), close), h('p', {}, T.gameText), h('ol', {}, ...T.gameSteps.map((x) => h('li', {}, x))), get, report);
  dialog.showModal();
}
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
function shareButton(b) {
  const label = (done) => b.replaceChildren(h('span', { html: icon(done ? 'check' : 'link', 16) }), done ? T.copied : T.share);
  label(false); b.onclick = async () => { try { await navigator.clipboard.writeText(kit.link); } catch { /* no clipboard */ } label(true); setTimeout(() => label(false), 1600); };
}
function toast(text) { const n = $('[data-toast]'); n.textContent = text; n.classList.add('on'); clearTimeout(toast.timer); toast.timer = setTimeout(() => n.classList.remove('on'), 1600); }

// ---- prismatic gems: their colours, and the game's gem picture tinted with each
let palette = [];
look.gemColours().then((p) => { palette = p; if (kit.hero && !EXTRAS.includes(ui.slot)) renderSide(); });
const gemArt = { base: null, mask: null, cache: new Map() };
const loadImage = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
Promise.all([loadImage('/gems/gem.webp'), loadImage('/gems/gem-mask.webp')]).then(([b, m]) => { gemArt.base = b; gemArt.mask = m; if (kit.hero && !EXTRAS.includes(ui.slot)) renderSide(); }).catch(() => {});
function gemPicture(hex) {
  if (!gemArt.base) return null; if (gemArt.cache.has(hex)) return gemArt.cache.get(hex);
  const { base, mask } = gemArt, w = base.width, ht = base.height, tint = document.createElement('canvas'), x = tint.getContext('2d');
  tint.width = w; tint.height = ht; x.drawImage(mask, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = hex; x.fillRect(0, 0, w, ht);
  x.globalCompositeOperation = 'color-dodge'; x.drawImage(tint, 0, 0);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0);
  const out = document.createElement('canvas'), o = out.getContext('2d'); out.width = w; out.height = ht; o.drawImage(base, 0, 0); o.drawImage(tint, 0, 0);
  const url = out.toDataURL('image/webp', 0.9); gemArt.cache.set(hex, url); return url;
}

// ---- pointing at him
const tip = $('[data-tip]');
let down = null, last = 0, hover = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { tip.hidden = true; return; }
  const now = performance.now(); if (now - last < 50) return; last = now;
  hover = kit.pick(e.clientX, e.clientY); if (hover && !kit.slots().some((s) => s.name === hover)) hover = null;
  canvas.style.cursor = hover ? 'pointer' : '';
  const s = hover && kit.slots().find((x) => x.name === hover); if (!s) { tip.hidden = true; return; }
  tip.textContent = say(s.text); tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`; tip.hidden = false;
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; hover = null; });
canvas.addEventListener('click', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; const slot = kit.pick(e.clientX, e.clientY); if (slot && kit.slots().some((s) => s.name === slot)) { tip.hidden = true; choose(slot); } });
function lines() {
  requestAnimationFrame(lines);
  const svg = $('[data-leaders]'), slot = ui.line || hover;
  const row = slot && document.querySelector(`[data-slots] [data-slot="${slot}"]`), a = row && kit.anchor(slot, 'left');
  if (!a) { svg.innerHTML = ''; return; }
  const r = row.getBoundingClientRect(), y = r.top + r.height / 2;
  svg.innerHTML = `<path d="M${r.right + 8} ${y} H${r.right + 32} L${a.x} ${a.y}"/><path class="tick" d="M${a.x - 6} ${a.y} H${a.x + 6} M${a.x} ${a.y - 6} V${a.y + 6}"/>`;
}
requestAnimationFrame(lines);

// ---- the roster: every hero, by attribute
const roster = $('[data-roster]');
function openRoster() {
  const input = h('input', { type: 'search', placeholder: T.findHero, 'aria-label': T.findHero });
  const list = h('div', { class: 'faces' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren(...['str', 'agi', 'int', 'all'].flatMap((a) => kit.heroes.filter((x) => x.attribute === a && (!q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q))))).map((x) => {
      const b = h('button', { type: 'button', 'aria-current': String(x.id === kit.hero?.id), style: { '--a': ACCENT[x.attribute] } }, h('img', { src: kit.portrait(x.id), alt: '', loading: 'lazy' }), h('span', {}, say(x.name)));
      b.onclick = () => { roster.hidden = true; if (x.id !== kit.hero?.id) kit.open(x.id); }; return b;
    }));
  };
  input.oninput = fill; input.onkeydown = (e) => { if (e.key === 'Enter') list.querySelector('button')?.click(); };
  fill();
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 20) }); close.onclick = () => { roster.hidden = true; };
  roster.replaceChildren(h('header', {}, h('h2', {}, T.heroes), h('label', { class: 'find', html: icon('search', 16) }, input), close), list);
  roster.hidden = false; input.focus();
}

// ---- keys: / heroes, space pause, arrows turn him or step through the heroes, Escape closes
const step = (by) => { const order = ['str', 'agi', 'int', 'all'].flatMap((a) => kit.heroes.filter((x) => x.attribute === a)), i = order.findIndex((x) => x.id === kit.hero?.id), next = order[(i + by + order.length) % order.length]; if (next) kit.open(next.id); };
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { roster.hidden = true; return; }
  if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || !roster.hidden || dialog.open) return;
  if (e.key === '/') { e.preventDefault(); openRoster(); }
  if (e.key === ' ' && !e.target.matches('button')) { e.preventDefault(); viewer.paused = !viewer.paused; renderTools(); }
  if (e.key === 'ArrowLeft') viewer.rotate(-0.6, { relative: true });
  if (e.key === 'ArrowRight') viewer.rotate(0.6, { relative: true });
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); }
});
heroScreens(); render();
