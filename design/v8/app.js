// Locker Pro: the board of the Locker with more to it. The hero's sets first (one click wears a set),
// then a tile per slot naming its item, set and styles; a tile's line runs to the item on him. A slot
// opens with what is worn in it (its styles as pictures, its set) and the items, which go on him while
// the cursor rests on them and stay when clicked.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { animMenu, heroDialog, shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { change: 'Сменить героя', back: 'Наряд', sets: 'Наборы', outfit: 'Наряд', standard: 'Стандарт', empty: 'Не выбрано', find: 'Найти', none: 'Ничего не нашлось', worn: 'Надето', now: 'Сейчас надето', fromSet: 'Из набора', wearSet: 'Надеть весь набор', setOn: 'Набор надет', styles: (n) => `${n} ${n < 5 ? 'стиля' : 'стилей'}`, items: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'вещь' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'вещи' : 'вещей'}`, trying: 'Примерка', keep: 'нажмите, чтобы оставить', turn: 'Повернуть', reset: 'Снять всё' }
  : { change: 'Change hero', back: 'Outfit', sets: 'Sets', outfit: 'Outfit', standard: 'Default', empty: 'None', find: 'Find', none: 'Nothing found', worn: 'Worn', now: 'Worn now', fromSet: 'From the set', wearSet: 'Wear the whole set', setOn: 'Set worn', styles: (n) => `${n} styles`, items: (n) => `${n} items`, trying: 'Trying on', keep: 'click to keep', turn: 'Turn', reset: 'Take all off' };
const ui = { view: 'board', slot: null, query: '', line: null, trying: null };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.view = 'board'; ui.query = ''; } ui.trying = null; showTrying(); render(); },
});
const setOf = (id) => kit.sets().find((s) => s.items.includes(+id)) || null;
const setName = (s) => say(s.name) || s.key.replace(/_/g, ' ');

function render(moved = false) {
  const hero = kit.hero; if (!hero) return;
  document.title = `${say(hero.name)} — Loadout`;
  animMenu($('[data-anim]'), kit);
  const view = ui.view === 'slot' ? slotView() : board();
  if (moved) view.classList.add('enter');
  $('[data-panel]').replaceChildren(view); if (moved) $('[data-panel]').scrollTop = 0;
}
const go = (view, slot = null) => { ui.view = view; ui.slot = slot; ui.query = ''; ui.line = null; render(true); };

// ---- the board: who, his sets, his slots
function board() {
  const hero = kit.hero;
  const change = h('button', { type: 'button', class: 'text-btn' }, T.change, h('span', { html: icon('next', 16) })); change.onclick = openHeroes;
  const head = h('header', { class: 'hero-head' }, h('img', { class: 'portrait', src: kit.portrait(hero.id), alt: '' }),
    h('div', {}, h('h1', {}, say(hero.name)), h('p', {}, ATTRIBUTE[lang][hero.attribute]), change));
  const sets = kit.sets();
  const setCards = sets.map((s) => {
    const on = kit.wearing(s), pics = s.items.slice(0, 4).map((id) => kit.picture(id));
    const b = h('button', { type: 'button', class: 'set', 'aria-pressed': String(on), style: { '--r': RARITY[s.rarity] } },
      h('span', { class: `collage n${pics.length}` }, ...pics.map((src) => h('img', { src, alt: '', loading: 'lazy' }))),
      h('span', { class: 'sname' }, setName(s)), h('span', { class: 'rar' }, on ? T.setOn : `${rarityName(s.rarity)}, ${T.items(s.items.length)}`));
    b.onclick = () => kit.wearSet(s);
    return b;
  });
  const body = new Set(kit.bodySlots().map((s) => s.name));
  const tiles = kit.slots().map((s) => {
    const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name)), plain = !it || it.default, set = !plain && setOf(id);
    const b = h('button', { type: 'button', class: `tile${plain ? ' plain' : ''}`, 'data-slot': s.name, style: { '--r': plain ? 'transparent' : RARITY[it.rarity] } },
      h('span', { class: 'pic' }, pic ? h('img', { src: pic, alt: '' }) : null),
      h('span', { class: 'slot' }, say(s.text)),
      h('span', { class: 'iname' }, !it ? T.empty : plain ? T.standard : say(it.name)),
      plain ? null : h('span', { class: 'meta' }, h('span', { class: 'rar' }, rarityName(it.rarity)), set ? h('span', {}, setName(set)) : null, it.styles.length > 1 ? h('span', {}, T.styles(it.styles.length)) : null));
    b.onclick = () => go('slot', s.name);
    if (body.has(s.name)) { b.onmouseenter = () => { ui.line = s.name; }; b.onmouseleave = () => { ui.line = null; }; }
    return b;
  });
  const reset = h('button', { type: 'button', class: 'text-btn quiet' }, T.reset);
  reset.onclick = async () => { for (const s of kit.slots()) if (kit.look.worn[s.name]) await kit.wear(s.name, null); };
  return h('section', {}, head,
    sets.length ? h('div', { class: 'block' }, h('h2', {}, T.sets, h('small', {}, String(sets.length))), h('div', { class: 'sets' }, ...setCards)) : null,
    h('div', { class: 'block' }, h('h2', {}, T.outfit, Object.values(kit.look.worn).some(Boolean) ? reset : null), h('div', { class: 'board', 'data-board': '' }, ...tiles)));
}

// ---- a slot: what is worn, then the items (resting the cursor tries one on)
function slotView() {
  const s = kit.slots().find((x) => x.name === ui.slot); if (!s) { ui.view = 'board'; return board(); }
  const back = h('button', { type: 'button', class: 'back' }, h('span', { html: icon('back', 18) }), T.back); back.onclick = () => go('board');
  const shown = kit.shown(s.name), cur = kit.item(shown), set = cur && !cur.default && setOf(shown);
  const now = cur && !cur.default ? h('div', { class: 'now', style: { '--r': RARITY[cur.rarity] } },
    h('img', { class: 'big', src: kit.picture(shown, kit.styleOf(s.name)), alt: '' }),
    h('div', { class: 'about' }, h('small', {}, T.now), h('b', {}, say(cur.name)), h('span', { class: 'rar' }, rarityName(cur.rarity)),
      set ? h('div', { class: 'fromset' }, h('span', {}, `${T.fromSet} «${setName(set)}»`), (() => { const on = kit.wearing(set), b = h('button', { type: 'button', class: 'text-btn', disabled: on }, on ? T.setOn : T.wearSet); b.onclick = () => kit.wearSet(set); return b; })()) : null),
    cur.styles.length > 1 ? h('div', { class: 'style-pics' }, ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i), title: say(st.name) || String(i + 1) }, h('img', { src: kit.picture(shown, i), alt: '' }), h('span', {}, say(st.name) || String(i + 1))); b.onclick = () => kit.wear(s.name, shown, i); return b; })) : null) : null;
  const input = h('input', { type: 'search', placeholder: `${T.find}: ${say(s.text).toLowerCase()}`, value: ui.query, 'aria-label': T.find });
  const grid = h('div', { class: 'grid', 'data-grid': '' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id), on = id === shown;
      const b = h('button', { type: 'button', class: 'card', 'aria-pressed': String(on) }, h('span', { class: 'pic', style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), on ? h('span', { class: 'on' }, T.worn) : null), h('span', { class: 'iname' }, it.default ? T.standard : say(it.name)), it.default ? null : h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)));
      let timer = null;
      b.onmouseenter = () => { if (on) return; timer = setTimeout(() => tryOn(s, id), 280); };
      b.onmouseleave = () => { clearTimeout(timer); if (ui.trying?.id === id) untry(); };
      b.onclick = () => { clearTimeout(timer); ui.trying = null; showTrying(); kit.wear(s.name, id, 0); };
      return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  return h('section', {}, back, h('h1', { class: 'slot-title' }, say(s.text), h('small', {}, String(s.items.length))), now, h('label', { class: 'find', html: icon('search', 18) }, input), grid);
}

// Trying on: the item goes on him, the stage says so; leaving puts back what is worn.
async function tryOn(s, id) { ui.trying = { slot: s.name, id }; showTrying(); await kit.tryOn(s.name, id); }
async function untry() { const t = ui.trying; ui.trying = null; showTrying(); if (t) await kit.untry(t.slot); }
function showTrying() {
  const box = $('[data-trying]'), t = ui.trying; box.hidden = !t; if (!t) return;
  box.replaceChildren(h('small', {}, T.trying), h('b', {}, say(kit.item(t.id)?.name)), h('span', {}, T.keep));
}

// The line from a tile to its item on him.
function lines() {
  requestAnimationFrame(lines);
  const svg = $('[data-leaders]'), slot = ui.line; if (!slot) { svg.innerHTML = ''; return; }
  const a = kit.anchor(slot, 'right'), from = document.querySelector(`[data-board] [data-slot="${slot}"]`)?.getBoundingClientRect();
  svg.innerHTML = a && from ? `<path d="M${from.left} ${from.top + from.height / 2} H${from.left - 30} L${a.x} ${a.y}"/><circle cx="${a.x}" cy="${a.y}" r="5"/>` : '';
}
requestAnimationFrame(lines);

const openHeroes = heroDialog($('[data-heroes]'), kit);
shareButton($('[data-share]'), kit);
const turn = $('[data-turn]'); turn.replaceChildren(h('span', { html: icon('turn', 18) }), h('span', { class: 'word' }, T.turn));
let angle = 0; turn.onclick = () => { angle += Math.PI / 2; kit.viewer.rotate(angle); };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.view !== 'board') go('board'); });
render();
