// Armory: the game's own loadout screen. The hero in the middle before one of his loading screens; his
// slots down the left, each framed with what it wears; the chosen slot's inventory on the right (an
// item goes on him while hovered, stays when clicked). A thing on him can be clicked too. The heroes
// are chosen from a grid by attribute, as in the game.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { animMenu, shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { outfit: 'Наряд', sets: 'Наборы', heroes: 'Герои', standard: 'Стандарт', empty: 'Пусто', find: 'Поиск', none: 'Ничего не нашлось', trying: 'Примерка', keep: 'нажмите, чтобы надеть', hint: 'Нажмите на вещь на герое, чтобы открыть её слот', all: 'Все', style: 'Стиль', setOn: 'Надет', items: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'предмет' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'предмета' : 'предметов'}`, findHero: 'Найти героя', close: 'Закрыть' }
  : { outfit: 'Loadout', sets: 'Sets', heroes: 'Heroes', standard: 'Default', empty: 'Empty', find: 'Search', none: 'Nothing found', trying: 'Trying on', keep: 'click to equip', hint: 'Click a thing on the hero to open its slot', all: 'All', style: 'Style', setOn: 'Equipped', items: (n) => `${n} items`, findHero: 'Find a hero', close: 'Close' };
const RANK = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana', 'ancient', 'seasonal'];
const ui = { tab: 'outfit', slot: null, query: '', rarity: null, trying: null, line: null };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.slot = null; ui.query = ''; ui.rarity = null; scene(); } ui.trying = null; showTrying(); render(); },
});
const setName = (s) => say(s.name) || s.key.replace(/_/g, ' ');

// The backdrop: the newest of his loading screens, else the game's dashboard.
async function scene() {
  const hero = kit.hero, d = await fetch(`/heroes/${hero.id}/screens.json`).then((r) => (r.ok ? r.json() : { screens: [] })).catch(() => ({ screens: [] }));
  if (kit.hero !== hero) return;
  const url = d.screens[0] ? `/screens/${d.screens[0].id}.webp` : '/backgrounds/dashboard.webp';
  $('[data-scene]').style.backgroundImage = `url("${url}")`;
}

function render() {
  const hero = kit.hero; if (!hero) return;
  ui.slot ||= kit.slots()[0]?.name || null;
  document.title = `${say(hero.name)} — Loadout`;
  $('[data-tabs]').replaceChildren(...[['outfit', T.outfit], ['sets', T.sets]].map(([k, text]) => { const b = h('button', { type: 'button', 'aria-selected': String(ui.tab === k) }, text); b.onclick = () => { ui.tab = k; render(); }; return b; }));
  $('[data-pick]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), T.heroes);
  $('[data-hint]').textContent = T.hint;
  animMenu($('[data-anim]'), kit);
  renderLoadout(); renderInventory();
}

// ---- left: the hero and his slots
function renderLoadout() {
  const hero = kit.hero, body = new Set(kit.bodySlots().map((s) => s.name));
  const rows = kit.slots().map((s) => {
    const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name)), plain = !it || it.default;
    const b = h('button', { type: 'button', class: 'slot', 'data-slot': s.name, 'aria-pressed': String(ui.tab === 'outfit' && ui.slot === s.name), style: { '--r': plain ? 'rgba(255,255,255,.12)' : RARITY[it.rarity] } },
      h('span', { class: 'frame' }, pic ? h('img', { src: pic, alt: '' }) : null),
      h('span', { class: 'txt' }, h('small', {}, say(s.text)), h('b', { class: plain ? 'plain' : '' }, !it ? T.empty : plain ? T.standard : say(it.name))));
    b.onclick = () => { ui.tab = 'outfit'; ui.slot = s.name; ui.query = ''; ui.rarity = null; render(); };
    if (body.has(s.name)) { b.onmouseenter = () => { ui.line = s.name; }; b.onmouseleave = () => { ui.line = null; }; }
    return b;
  });
  $('[data-loadout]').replaceChildren(
    h('header', { class: 'hero' }, h('img', { src: `/attributes/${hero.attribute}.webp`, alt: '' }), h('div', {}, h('h1', {}, say(hero.name)), h('p', {}, ATTRIBUTE[lang][hero.attribute]))),
    h('div', { class: 'slots' }, ...rows));
}

// ---- right: the chosen slot's inventory, or the sets
function renderInventory() {
  const box = $('[data-inventory]');
  if (ui.tab === 'sets') return box.replaceChildren(setsPanel());
  const s = kit.slots().find((x) => x.name === ui.slot); if (!s) return box.replaceChildren();
  const shown = kit.shown(s.name), cur = kit.item(shown);
  const input = h('input', { type: 'search', placeholder: T.find, value: ui.query, 'aria-label': T.find });
  const have = RANK.filter((r) => s.items.some((id) => !kit.item(id).default && kit.item(id).rarity === r));
  const rar = h('div', { class: 'rarities' }, ...[null, ...have].map((r) => { const b = h('button', { type: 'button', title: r ? rarityName(r) : T.all, 'aria-pressed': String(ui.rarity === r), style: { '--r': r ? RARITY[r] : 'transparent' } }, r ? '' : T.all); b.onclick = () => { ui.rarity = r; renderInventory(); }; return b; }));
  const grid = h('div', { class: 'items', 'data-grid': '' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => { const it = kit.item(id); return (!q || say(it.name).toLowerCase().includes(q)) && (!ui.rarity || (!it.default && it.rarity === ui.rarity)); });
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id), on = id === shown;
      const b = h('button', { type: 'button', class: 'item', 'aria-pressed': String(on), title: it.default ? T.standard : say(it.name), style: { '--r': it.default ? 'rgba(255,255,255,.14)' : RARITY[it.rarity] } },
        h('span', { class: 'frame' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), on ? h('span', { class: 'eq', html: icon('check', 13) }) : null), h('span', { class: 'iname' }, it.default ? T.standard : say(it.name)));
      let timer = null;
      b.onmouseenter = () => { if (!on) timer = setTimeout(() => tryOn(s, id), 260); };
      b.onmouseleave = () => { clearTimeout(timer); if (ui.trying?.id === id) untry(); };
      b.onclick = () => { clearTimeout(timer); ui.trying = null; showTrying(); kit.wear(s.name, id, 0); };
      return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  const styles = cur && !cur.default && cur.styles.length > 1
    ? h('div', { class: 'styles' }, h('small', {}, T.style), h('div', {}, ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i), title: say(st.name) || String(i + 1) }, h('img', { src: kit.picture(shown, i), alt: '' }), h('span', {}, say(st.name) || String(i + 1))); b.onclick = () => kit.wear(s.name, shown, i); return b; })))
    : null;
  box.replaceChildren(...[h('header', {}, h('h2', {}, say(s.text)), h('span', {}, T.items(s.items.length))),
    h('div', { class: 'filters' }, h('label', { class: 'find', html: icon('search', 16) }, input), rar), styles, grid].filter(Boolean));
}
function setsPanel() {
  const sets = kit.sets();
  return h('div', { class: 'sets-panel' }, h('header', {}, h('h2', {}, T.sets), h('span', {}, String(sets.length))), h('div', { class: 'sets' }, ...sets.map((s) => {
    const on = kit.wearing(s), pics = s.items.slice(0, 4).map((id) => kit.picture(id));
    const b = h('button', { type: 'button', class: 'set', 'aria-pressed': String(on), style: { '--r': RARITY[s.rarity] } },
      h('span', { class: `collage n${pics.length}` }, ...pics.map((src) => h('img', { src, alt: '', loading: 'lazy' }))),
      h('span', { class: 'sname' }, setName(s)), h('span', { class: 'srar' }, on ? T.setOn : `${rarityName(s.rarity)}, ${T.items(s.items.length)}`));
    b.onclick = () => kit.wearSet(s); return b;
  })));
}

// ---- trying on
async function tryOn(s, id) { ui.trying = { slot: s.name, id }; showTrying(); await kit.tryOn(s.name, id); }
async function untry() { const t = ui.trying; ui.trying = null; showTrying(); if (t) await kit.untry(t.slot); }
function showTrying() { const box = $('[data-trying]'), t = ui.trying; box.hidden = !t; if (t) box.replaceChildren(h('small', {}, T.trying), h('b', {}, say(kit.item(t.id)?.name)), h('span', {}, T.keep)); }

// ---- pointing at him
const canvas = $('[data-view]'), tip = $('[data-tip]');
let down = null, last = 0, hover = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { tip.hidden = true; return; }
  const now = performance.now(); if (now - last < 50) return; last = now;
  hover = kit.pick(e.clientX, e.clientY); canvas.style.cursor = hover ? 'pointer' : '';
  const s = hover && kit.slots().find((x) => x.name === hover); if (!s) { tip.hidden = true; return; }
  const it = kit.item(kit.shown(s.name));
  tip.replaceChildren(h('small', {}, say(s.text)), h('b', {}, it?.default ? T.standard : say(it?.name)));
  tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`; tip.hidden = false;
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; hover = null; });
canvas.addEventListener('click', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const slot = kit.pick(e.clientX, e.clientY); if (slot) { tip.hidden = true; ui.tab = 'outfit'; ui.slot = slot; ui.query = ''; ui.rarity = null; render(); }
});
// The line from a slot under the cursor (or a thing pointed at on him) to that thing.
function lines() {
  requestAnimationFrame(lines);
  const svg = $('[data-leaders]'), slot = ui.line || hover;
  const row = slot && document.querySelector(`[data-loadout] [data-slot="${slot}"]`), a = row && kit.anchor(slot, 'left');
  if (!a) { svg.innerHTML = ''; return; }
  const r = row.getBoundingClientRect(), y = r.top + r.height / 2, x = r.right + 6;
  svg.innerHTML = `<path d="M${x} ${y} H${x + 24} L${a.x} ${a.y}"/><rect x="${a.x - 4}" y="${a.y - 4}" width="8" height="8" transform="rotate(45 ${a.x} ${a.y})"/>`;
}
requestAnimationFrame(lines);

// ---- the heroes: the game's grid, by attribute
const grid = $('[data-heroes]');
function openHeroes() {
  const input = h('input', { type: 'search', placeholder: T.findHero, 'aria-label': T.findHero });
  const cols = h('div', { class: 'cols' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    cols.replaceChildren(...['str', 'agi', 'int', 'all'].map((a) => h('section', {}, h('h3', {}, h('img', { src: `/attributes/${a}.webp`, alt: '' }), ATTRIBUTE[lang][a]), h('div', { class: 'faces' }, ...kit.heroes.filter((x) => x.attribute === a).map((x) => {
      const hit = !q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q));
      const b = h('button', { type: 'button', class: hit ? '' : 'dim', 'aria-current': String(x.id === kit.hero?.id), title: say(x.name) }, h('img', { src: kit.portrait(x.id), alt: say(x.name), loading: 'lazy' }), h('span', {}, say(x.name)));
      b.onclick = () => { grid.hidden = true; if (x.id !== kit.hero?.id) kit.open(x.id); }; return b;
    })))));
  };
  input.oninput = fill; input.onkeydown = (e) => { if (e.key === 'Enter') grid.querySelector('.faces button:not(.dim)')?.click(); };
  fill();
  const close = h('button', { type: 'button', class: 'btn', 'aria-label': T.close, html: icon('close', 18) }); close.onclick = () => { grid.hidden = true; };
  grid.replaceChildren(h('header', {}, h('h2', {}, T.heroes), h('label', { class: 'find', html: icon('search', 16) }, input), close), cols);
  grid.hidden = false; input.focus();
}
$('[data-pick]').onclick = openHeroes;
shareButton($('[data-share]'), kit);
addEventListener('keydown', (e) => { if (e.key === 'Escape') grid.hidden = true; });
scene(); render();
