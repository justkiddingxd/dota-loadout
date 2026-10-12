// Sets: browse on the left, the hero in the middle, what he wears on the right. The left shows his
// sets (one click puts a set on) or, once a slot on the right is chosen, that slot's items. The right
// column is the outfit, each slot with a line to its thing on him.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { heroDialog, shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { sets: 'Наборы', find: 'Найти набор', findItem: 'Найти', back: 'Наборы', standard: 'Стандарт', empty: 'Не выбрано', none: 'Ничего не нашлось', setOn: 'Надет', worn: 'Надето', style: 'Стиль', items: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'вещь' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'вещи' : 'вещей'}`, outfit: 'Надето' }
  : { sets: 'Sets', find: 'Find a set', findItem: 'Find', back: 'Sets', standard: 'Default', empty: 'None', none: 'Nothing found', setOn: 'Worn', worn: 'Worn', style: 'Style', items: (n) => `${n} items`, outfit: 'Worn' };
const ui = { slot: null, query: '' };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.slot = null; ui.query = ''; } render(); },
});
const setName = (s) => say(s.name) || s.key.replace(/_/g, ' ');

function render() {
  const hero = kit.hero; if (!hero) return;
  $('[data-who]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', { class: 'name' }, say(hero.name)), h('span', { html: icon('down', 16) }));
  document.title = `${say(hero.name)} — Loadout`;
  renderBrowse(); renderOutfit();
}

// ---- left: his sets, or a slot's items
function renderBrowse() {
  const box = $('[data-browse]');
  if (ui.slot) return box.replaceChildren(slotItems());
  const input = h('input', { type: 'search', placeholder: T.find, value: ui.query, 'aria-label': T.find });
  const list = h('div', { class: 'sets', 'data-sets': '' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), sets = kit.sets().filter((s) => !q || setName(s).toLowerCase().includes(q) || s.items.some((id) => say(kit.item(id).name).toLowerCase().includes(q)));
    list.replaceChildren(...(sets.length ? sets.map((s) => {
      const on = kit.wearing(s), pics = s.items.slice(0, 5).map((id) => kit.picture(id));
      const b = h('button', { type: 'button', class: 'set', 'aria-pressed': String(on), style: { '--r': RARITY[s.rarity] } },
        h('span', { class: 'strip' }, ...pics.map((src) => h('img', { src, alt: '', loading: 'lazy' }))),
        h('span', { class: 'line' }, h('b', {}, setName(s)), on ? h('span', { class: 'on', html: icon('check', 14) }) : null),
        h('span', { class: 'rar' }, `${rarityName(s.rarity)}, ${T.items(s.items.length)}`));
      b.onclick = () => kit.wearSet(s); return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  box.replaceChildren(h('header', {}, h('h1', {}, T.sets, h('small', {}, String(kit.sets().length))), h('label', { class: 'find', html: icon('search', 16) }, input)), list);
}
function slotItems() {
  const s = kit.slots().find((x) => x.name === ui.slot), shown = kit.shown(s.name), cur = kit.item(shown);
  const back = h('button', { type: 'button', class: 'back' }, h('span', { html: icon('back', 18) }), T.back); back.onclick = () => { ui.slot = null; ui.query = ''; render(); };
  const input = h('input', { type: 'search', placeholder: `${T.findItem}: ${say(s.text).toLowerCase()}`, value: ui.query, 'aria-label': T.findItem });
  const grid = h('div', { class: 'grid' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id), b = h('button', { type: 'button', class: 'item', 'aria-pressed': String(id === shown), style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } }, h('span', { class: 'pic' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' })), h('span', { class: 'iname' }, it.default ? T.standard : say(it.name)));
      b.onclick = () => kit.wear(s.name, id, 0); return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  const styles = cur && !cur.default && cur.styles.length > 1 ? h('div', { class: 'styles' }, ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, shown, i); return b; })) : null;
  return h('div', { class: 'slot-view' }, h('header', {}, back, h('h1', {}, say(s.text), h('small', {}, String(s.items.length))), h('label', { class: 'find', html: icon('search', 16) }, input)), styles, grid);
}

// ---- right: the outfit
function renderOutfit() {
  const body = new Set(kit.bodySlots().map((s) => s.name));
  $('[data-outfit]').replaceChildren(h('h2', {}, T.outfit), ...kit.slots().map((s) => {
    const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name)), plain = !it || it.default;
    const b = h('button', { type: 'button', class: 'tile', 'data-slot': s.name, 'data-body': String(body.has(s.name)), 'aria-pressed': String(ui.slot === s.name), style: { '--r': plain ? 'transparent' : RARITY[it.rarity] } },
      h('span', { class: 'txt' }, h('small', {}, say(s.text)), h('b', {}, !it ? T.empty : plain ? T.standard : say(it.name))), h('span', { class: 'pic' }, pic ? h('img', { src: pic, alt: '' }) : null));
    b.onclick = () => { ui.slot = ui.slot === s.name ? null : s.name; ui.query = ''; render(); };
    return b;
  }));
}

// Lines from the outfit's slots on his body to their things.
function lines() {
  requestAnimationFrame(lines);
  const out = [];
  for (const t of document.querySelectorAll('[data-outfit] .tile[data-body="true"]')) {
    const a = kit.anchor(t.dataset.slot, 'right'); if (!a) continue;
    const r = t.getBoundingClientRect(), on = t.getAttribute('aria-pressed') === 'true';
    out.push(`<path class="${on ? 'on' : ''}" d="M${r.left} ${r.top + r.height / 2} H${r.left - 24} L${a.x} ${a.y}"/><circle class="${on ? 'on' : ''}" cx="${a.x}" cy="${a.y}" r="${on ? 5 : 3.5}"/>`);
  }
  $('[data-leaders]').innerHTML = out.join('');
}
requestAnimationFrame(lines);

$('[data-who]').onclick = heroDialog($('[data-heroes]'), kit);
shareButton($('[data-share]'), kit);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.slot) { ui.slot = null; render(); } });
render();
