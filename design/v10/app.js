// Layers: the outfit as a list of layers, one per slot, as in an editor. A layer opens in place, its
// items right under it (no other screen to go to and come back from); the open layer has a line to
// its thing on the hero, and a button takes its item off.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';
import { animMenu, heroDialog, shareButton } from '../parts.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { standard: 'Стандарт', empty: 'Не выбрано', find: 'Найти', none: 'Ничего не нашлось', off: 'Снять', style: 'Стиль' }
  : { standard: 'Default', empty: 'None', find: 'Find', none: 'Nothing found', off: 'Take off', style: 'Style' };
const ui = { open: null, query: '', hover: null };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.open = null; ui.query = ''; } render(); },
});

function render() {
  const hero = kit.hero; if (!hero) return;
  $('[data-who]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', { class: 'name' }, say(hero.name)), h('span', { class: 'attr' }, ATTRIBUTE[lang][hero.attribute]), h('span', { html: icon('down', 16) }));
  document.title = `${say(hero.name)} — Loadout`;
  animMenu($('[data-anim]'), kit);
  const keep = $('[data-layers] .layer[data-open="true"] .grid')?.scrollTop || 0;
  $('[data-layers]').replaceChildren(...kit.slots().map(layer));
  const grid = $('[data-layers] .layer[data-open="true"] .grid'); if (grid) grid.scrollTop = keep;
}

function layer(s) {
  const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name)), plain = !it || it.default, open = ui.open === s.name;
  const row = h('button', { type: 'button', class: 'row', 'aria-expanded': String(open) },
    h('span', { class: 'pic', style: { '--r': plain ? 'transparent' : RARITY[it.rarity] } }, pic ? h('img', { src: pic, alt: '' }) : null),
    h('span', { class: 'txt' }, h('small', {}, say(s.text)), h('b', {}, !it ? T.empty : plain ? T.standard : say(it.name))),
    plain ? null : h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)),
    h('span', { class: 'chev', html: icon('down', 18) }));
  row.onclick = () => { ui.open = open ? null : s.name; ui.query = ''; render(); if (!open) $('[data-layers] .layer[data-open="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const box = h('section', { class: 'layer', 'data-slot': s.name, 'data-open': String(open) }, row);
  box.onmouseenter = () => { ui.hover = s.name; }; box.onmouseleave = () => { ui.hover = null; };
  if (!open) return box;
  const input = h('input', { type: 'search', placeholder: `${T.find}: ${say(s.text).toLowerCase()}`, value: ui.query, 'aria-label': T.find });
  const grid = h('div', { class: 'grid' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((x) => !q || say(kit.item(x).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((x) => {
      const item = kit.item(x), b = h('button', { type: 'button', class: 'item', 'aria-pressed': String(x === id), title: item.default ? T.standard : say(item.name), style: { '--r': item.default ? 'transparent' : RARITY[item.rarity] } }, h('span', { class: 'pic' }, h('img', { src: kit.picture(x), alt: '', loading: 'lazy' })), h('span', { class: 'iname' }, item.default ? T.standard : say(item.name)));
      b.onclick = () => kit.wear(s.name, x, 0); return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); }; fill();
  const styles = it && !plain && it.styles.length > 1 ? h('div', { class: 'styles' }, h('span', {}, T.style), ...it.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, id, i); return b; })) : null;
  const off = !plain ? (() => { const b = h('button', { type: 'button', class: 'off' }, h('span', { html: icon('close', 14) }), T.off); b.onclick = () => kit.wear(s.name, null); return b; })() : null;
  box.append(h('div', { class: 'body' }, h('div', { class: 'tools' }, h('label', { class: 'find', html: icon('search', 16) }, input), off), styles, grid));
  return box;
}

// The line from the open (or pointed) layer to its thing on him.
function lines() {
  requestAnimationFrame(lines);
  const slot = ui.open || ui.hover, svg = $('[data-leaders]');
  const row = slot && document.querySelector(`[data-layers] [data-slot="${slot}"] .row`), a = row && kit.anchor(slot, 'left');
  if (!a) { svg.innerHTML = ''; return; }
  const r = row.getBoundingClientRect(), y = r.top + r.height / 2;
  svg.innerHTML = `<path d="M${r.right} ${y} H${r.right + 30} L${a.x} ${a.y}"/><circle cx="${a.x}" cy="${a.y}" r="5"/>`;
}
requestAnimationFrame(lines);

$('[data-who]').onclick = heroDialog($('[data-heroes]'), kit);
shareButton($('[data-share]'), kit);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.open) { ui.open = null; render(); } });
render();
