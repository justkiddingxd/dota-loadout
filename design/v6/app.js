// Character sheet: the slots stand still in two columns at the hero's sides, each on the side of its
// item, in the order of their heights; only the lines to the items move with him. A slot opens a wide
// drawer of its items at the bottom.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { animMenu, heroDialog, shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { standard: 'Стандарт', empty: 'Не выбрано', find: 'Найти', none: 'Ничего не нашлось', style: 'Стиль', close: 'Закрыть', items: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'вещь' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'вещи' : 'вещей'}` }
  : { standard: 'Default', empty: 'None', find: 'Find', none: 'Nothing found', style: 'Style', close: 'Close', items: (n) => `${n} items` };
const ui = { open: null, sides: new Map(), query: '' };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.open = null; ui.sides.clear(); } render(); },
});

// Sides and order: once per hero, from where the items are as he stands.
function arrange() {
  const mid = innerWidth / 2;
  for (const s of kit.bodySlots()) if (!ui.sides.has(s.name)) { const a = kit.anchor(s.name); if (a) ui.sides.set(s.name, { side: a.x < mid ? 'left' : 'right', y: a.y }); }
}

function render() {
  const hero = kit.hero; if (!hero) return;
  $('[data-who]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', { class: 'name' }, say(hero.name)), h('span', { class: 'attr' }, ATTRIBUTE[lang][hero.attribute]), h('span', { html: icon('down', 16) }));
  document.title = `${say(hero.name)} — Loadout`;
  arrange();
  for (const side of ['left', 'right']) {
    const slots = kit.bodySlots().filter((s) => ui.sides.get(s.name)?.side === side).sort((a, b) => ui.sides.get(a.name).y - ui.sides.get(b.name).y);
    $(`[data-col="${side}"]`).replaceChildren(...slots.map((s) => tile(s, side)));
  }
  const body = new Set(kit.bodySlots().map((s) => s.name));
  $('[data-more]').replaceChildren(...kit.slots().filter((s) => !body.has(s.name)).map((s) => tile(s, 'more')));
  animMenu($('[data-anim]'), kit);
  renderDrawer();
}

function tile(s, side) {
  const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name)), plain = !it || it.default;
  const b = h('button', { type: 'button', class: 'tile', 'data-slot': s.name, 'data-side': side, 'aria-expanded': String(ui.open === s.name), style: { '--r': plain ? 'transparent' : RARITY[it.rarity] } },
    h('span', { class: 'pic' }, pic ? h('img', { src: pic, alt: '' }) : null),
    h('span', { class: 'txt' }, h('small', {}, say(s.text)), h('b', {}, !it ? T.empty : plain ? T.standard : say(it.name))));
  b.onclick = () => { ui.open = ui.open === s.name ? null : s.name; ui.query = ''; for (const t of document.querySelectorAll('.tile')) t.setAttribute('aria-expanded', String(t.dataset.slot === ui.open)); renderDrawer(true); };
  return b;
}

// The drawer: the slot's items, large, with search and styles.
function renderDrawer(focus = false) {
  const box = $('[data-drawer]'), s = kit.slots().find((x) => x.name === ui.open);
  box.hidden = !s; document.body.classList.toggle('drawn', !!s); if (!s) return;
  const shown = kit.shown(s.name), cur = kit.item(shown);
  const input = h('input', { type: 'search', placeholder: `${T.find}: ${say(s.text).toLowerCase()}`, value: ui.query, 'aria-label': T.find });
  const grid = h('div', { class: 'grid' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id), b = h('button', { type: 'button', class: 'item', 'aria-pressed': String(id === shown), style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } },
        h('span', { class: 'pic' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' })), h('span', { class: 'iname' }, it.default ? T.standard : say(it.name)), it.default ? null : h('span', { class: 'rar' }, rarityName(it.rarity)));
      b.onclick = () => kit.wear(s.name, id, 0); return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  const styles = cur && !cur.default && cur.styles.length > 1 ? h('div', { class: 'styles' }, h('span', {}, T.style), ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, shown, i); return b; })) : null;
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 20) }); close.onclick = () => { ui.open = null; render(); };
  box.replaceChildren(h('header', {}, h('div', { class: 'head' }, h('h2', {}, say(s.text)), h('span', {}, T.items(s.items.length))), h('label', { class: 'find', html: icon('search', 16) }, input), close), styles, grid);
  if (focus) box.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
}

// Each frame: a line from every slot of the body to its item, and a dot where it is.
function lines() {
  requestAnimationFrame(lines);
  const out = [];
  for (const t of document.querySelectorAll('.col .tile')) {
    const side = t.dataset.side, a = kit.anchor(t.dataset.slot, side); if (!a) continue;
    const r = t.getBoundingClientRect(), x = side === 'left' ? r.right : r.left, y = r.top + r.height / 2, bend = side === 'left' ? x + 28 : x - 28;
    const on = t.getAttribute('aria-expanded') === 'true';
    out.push(`<path class="${on ? 'on' : ''}" d="M${x} ${y} H${bend} L${a.x} ${a.y}"/><circle class="${on ? 'on' : ''}" cx="${a.x}" cy="${a.y}" r="${on ? 5 : 3.5}"/>`);
  }
  $('[data-leaders]').innerHTML = out.join('');
}
requestAnimationFrame(lines);

const openHeroes = heroDialog($('[data-heroes]'), kit);
$('[data-who]').onclick = openHeroes;
shareButton($('[data-share]'), kit);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.open) { ui.open = null; render(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openHeroes(); } });
addEventListener('resize', () => { ui.sides.clear(); render(); });
// The first frame has to be drawn before the items' places are known.
requestAnimationFrame(() => requestAnimationFrame(render));
