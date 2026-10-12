// Pointer: point at a thing on the hero and click it. Hovering him names what is under the cursor;
// a click opens that slot's items in the panel. The panel's board lists his slots too, and a row
// under the cursor draws a line to its item.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { animMenu, heroDialog, shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { hint: 'Нажмите на вещь на герое, чтобы сменить её', outfit: 'Наряд', back: 'Наряд', standard: 'Стандарт', empty: 'Не выбрано', find: 'Найти', none: 'Ничего не нашлось', style: 'Стиль', worn: 'Надето', other: 'Не на теле' }
  : { hint: 'Click a thing on the hero to change it', outfit: 'Outfit', back: 'Outfit', standard: 'Default', empty: 'None', find: 'Find', none: 'Nothing found', style: 'Style', worn: 'Worn', other: 'Not on the body' };
const ui = { slot: null, hover: null, line: null, query: '' };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.slot = null; ui.query = ''; } render(); },
});

function render() {
  const hero = kit.hero; if (!hero) return;
  $('[data-who]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', { class: 'name' }, say(hero.name)), h('span', { html: icon('down', 16) }));
  $('[data-hint]').textContent = T.hint;
  document.title = `${say(hero.name)} — Loadout`;
  animMenu($('[data-anim]'), kit);
  $('[data-panel]').replaceChildren(ui.slot ? slotView() : board());
}
const shownName = (s) => { const it = kit.item(kit.shown(s.name)); return !it ? T.empty : it.default ? T.standard : say(it.name); };

// ---- the board: rows of his slots; those on his body first
function board() {
  const body = new Set(kit.bodySlots().map((s) => s.name));
  const row = (s) => {
    const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name));
    const b = h('button', { type: 'button', class: 'row', 'data-slot': s.name },
      h('span', { class: 'pic', style: { '--r': it && !it.default ? RARITY[it.rarity] : 'transparent' } }, pic ? h('img', { src: pic, alt: '' }) : null),
      h('span', { class: 'txt' }, h('small', {}, say(s.text)), h('b', {}, shownName(s))), it && !it.default ? h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)) : null, h('span', { class: 'go', html: icon('next', 18) }));
    b.onclick = () => open(s.name);
    b.onmouseenter = () => { if (body.has(s.name)) ui.line = s.name; }; b.onmouseleave = () => { ui.line = null; };
    return b;
  };
  const slots = kit.slots();
  return h('section', { class: 'view' }, h('h1', {}, T.outfit), h('div', { class: 'rows', 'data-board': '' }, ...slots.filter((s) => body.has(s.name)).map(row)),
    h('h2', {}, T.other), h('div', { class: 'rows' }, ...slots.filter((s) => !body.has(s.name)).map(row)));
}

// ---- a slot's items
function slotView() {
  const s = kit.slots().find((x) => x.name === ui.slot); if (!s) { ui.slot = null; return board(); }
  const back = h('button', { type: 'button', class: 'back' }, h('span', { html: icon('back', 18) }), T.back); back.onclick = () => open(null);
  const shown = kit.shown(s.name), cur = kit.item(shown);
  const input = h('input', { type: 'search', placeholder: `${T.find}: ${say(s.text).toLowerCase()}`, value: ui.query, 'aria-label': T.find });
  const grid = h('div', { class: 'grid' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id), on = id === shown;
      const b = h('button', { type: 'button', class: 'card', 'aria-pressed': String(on) }, h('span', { class: 'pic', style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), on ? h('span', { class: 'on' }, T.worn) : null), h('span', { class: 'iname' }, it.default ? T.standard : say(it.name)), it.default ? null : h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)));
      b.onclick = () => kit.wear(s.name, id, 0); return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  const styles = cur && !cur.default && cur.styles.length > 1 ? h('div', { class: 'styles' }, h('span', {}, T.style), ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, shown, i); return b; })) : null;
  return h('section', { class: 'view' }, back, h('h1', {}, say(s.text), h('small', {}, String(s.items.length))), h('label', { class: 'find', html: icon('search', 18) }, input), styles, grid);
}
function open(slot) { ui.slot = slot; ui.query = ''; ui.line = null; render(); $('[data-panel]').scrollTop = 0; $('[data-panel] .view').classList.add('enter'); }

// ---- pointing at him: what is under the cursor, and a click opens it
const canvas = $('[data-view]'), tip = $('[data-tip]');
let down = null, last = 0;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { tip.hidden = true; return; }
  const now = performance.now(); if (now - last < 50) return; last = now;
  const slot = kit.pick(e.clientX, e.clientY); ui.hover = slot; canvas.style.cursor = slot ? 'pointer' : '';
  if (!slot) { tip.hidden = true; return; }
  const s = kit.slots().find((x) => x.name === slot);
  tip.replaceChildren(h('small', {}, say(s.text)), h('b', {}, shownName(s)));
  tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`; tip.hidden = false;
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; ui.hover = null; });
canvas.addEventListener('click', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const slot = kit.pick(e.clientX, e.clientY); if (slot) { tip.hidden = true; open(slot); }
});

// Each frame: the line from a board row (or the open slot's title) to its item.
function lines() {
  requestAnimationFrame(lines);
  const slot = ui.line || (ui.slot && kit.bodySlots().some((s) => s.name === ui.slot) ? ui.slot : null) || ui.hover;
  const svg = $('[data-leaders]'); if (!slot) { svg.innerHTML = ''; return; }
  const a = kit.anchor(slot, ui.line ? 'right' : undefined); if (!a) { svg.innerHTML = ''; return; }
  const from = ui.line ? document.querySelector(`[data-board] [data-slot="${slot}"]`)?.getBoundingClientRect() : null;
  svg.innerHTML = from ? `<path d="M${from.left} ${from.top + from.height / 2} H${from.left - 30} L${a.x} ${a.y}"/><circle cx="${a.x}" cy="${a.y}" r="5"/>` : `<circle cx="${a.x}" cy="${a.y}" r="5"/><circle class="ring" cx="${a.x}" cy="${a.y}" r="12"/>`;
}
requestAnimationFrame(lines);

$('[data-who]').onclick = heroDialog($('[data-heroes]'), kit);
shareButton($('[data-share]'), kit);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.slot) open(null); });
render();
