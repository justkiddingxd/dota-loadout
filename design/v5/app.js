// Paper doll: an equipment screen. Each slot's label stands at the side of the screen with a line to
// where its item is on the hero, following him as he moves; a label opens that slot's items beside it.
// Slots with nothing on his body (a taunt, an emblem) sit in a row below.
import { Vector3 } from 'three';
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { change: 'Другой герой', share: 'Ссылка', copied: 'Скопировано', standard: 'Стандарт', find: 'Найти', findHero: 'Найти героя', close: 'Закрыть', style: 'Стиль', empty: 'Не выбрано' }
  : { change: 'Another hero', share: 'Link', copied: 'Copied', standard: 'Default', find: 'Find', findHero: 'Find a hero', close: 'Close', style: 'Style', empty: 'None' };
const ui = { open: null, sides: new Map() };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.open = null; ui.sides.clear(); } render(); },
});

// ---- where each slot's item is on screen: a few of its vertices, as he is posed now
const point = new Vector3();
// Where a slot's item is on screen: its vertices as he is posed now (a few of them), projected; the
// point is the middle of the part nearest the side its label stands on (a pair of bracers: the near arm).
function anchor(slot, side) {
  const meshes = kit.viewer.hero?.slotMeshes(slot).filter((m) => m.visible && m.geometry?.attributes.position) || [];
  const r = kit.viewer.canvas.getBoundingClientRect(), pts = [];
  for (const m of meshes) {
    const count = m.geometry.attributes.position.count, step = Math.max(1, Math.floor(count / 50));
    for (let i = 0; i < count; i += step) { m.getVertexPosition(i, point).applyMatrix4(m.matrixWorld).project(kit.viewer.camera); pts.push([r.left + ((point.x + 1) / 2) * r.width, r.top + ((1 - point.y) / 2) * r.height]); }
  }
  if (!pts.length) return null;
  const mean = (list) => ({ x: list.reduce((a, p) => a + p[0], 0) / list.length, y: list.reduce((a, p) => a + p[1], 0) / list.length });
  const all = mean(pts); if (!side) return all;
  const near = [...pts].sort((a, b) => (side === 'left' ? a[0] - b[0] : b[0] - a[0])).slice(0, Math.max(1, Math.ceil(pts.length * 0.3)));
  return { ...mean(near), mid: all };
}

// ---- the labels
function render() {
  const hero = kit.hero; if (!hero) return;
  $('[data-name]').textContent = say(hero.name);
  $('[data-change]').replaceChildren(T.change, h('span', { html: icon('next', 16) }));
  document.title = `${say(hero.name)} — Loadout`;
  const body = [], other = [];
  for (const s of kit.slots()) (kit.viewer.hero?.slotMeshes(s.name).length ? body : other).push(s);
  $('[data-callouts]').replaceChildren(...body.map((s) => label(s, 'callout')));
  $('[data-other]').replaceChildren(...other.map((s) => label(s, 'chip')));
  if (ui.open) openPop(ui.open);
}
function label(s, kind) {
  const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name));
  const b = h('button', { type: 'button', class: kind, 'data-slot': s.name, 'aria-expanded': String(ui.open === s.name), style: { '--r': it && !it.default ? RARITY[it.rarity] : 'rgba(255,255,255,.25)' } },
    pic ? h('img', { src: pic, alt: '' }) : null,
    h('span', { class: 'txt' }, h('small', {}, say(s.text)), h('b', {}, !it ? T.empty : it.default ? T.standard : say(it.name))));
  b.onclick = (e) => { e.stopPropagation(); ui.open = ui.open === s.name ? null : s.name; if (ui.open) openPop(s.name); else closePop(); markOpen(); };
  return b;
}
const markOpen = () => { for (const b of document.querySelectorAll('[data-slot]')) b.setAttribute('aria-expanded', String(b.dataset.slot === ui.open)); };

// Each frame: labels down each side in the order of their items' heights, lines to the items.
const SIDE_W = 230, GAP = 66;
function layout() {
  requestAnimationFrame(layout);
  const callouts = [...document.querySelectorAll('[data-callouts] .callout')]; if (!callouts.length) return;
  const vw = innerWidth, svg = $('[data-leaders]'), lines = [];
  const placed = callouts.map((el) => ({ el, a: anchor(el.dataset.slot, ui.sides.get(el.dataset.slot)) })).filter((x) => x.a);
  // A label keeps its side unless its item crosses well over the middle (he turns).
  for (const x of placed) { const side = ui.sides.get(x.el.dataset.slot), mid = vw / 2, cx = (x.a.mid || x.a).x; ui.sides.set(x.el.dataset.slot, side === 'left' ? (cx > mid + vw * 0.08 ? 'right' : 'left') : side === 'right' ? (cx < mid - vw * 0.08 ? 'left' : 'right') : cx < mid ? 'left' : 'right'); }
  for (const side of ['left', 'right']) {
    const col = placed.filter((x) => ui.sides.get(x.el.dataset.slot) === side).sort((p, q) => p.a.y - q.a.y);
    let y = 110;
    const total = col.length * GAP, top = Math.max(110, Math.min(innerHeight - 140 - total, (col[0]?.a.y ?? 0) - GAP));
    y = top;
    for (const x of col) {
      const w = x.el.offsetWidth || SIDE_W, edge = vw < 760 ? 10 : 32;
      y = Math.max(y, Math.min(x.a.y - 24, innerHeight - 150)); const cx = side === 'left' ? edge : vw - edge - w;
      x.el.style.transform = `translate(${cx}px, ${y}px)`; x.el.dataset.side = side;
      const ex = side === 'left' ? cx + w : cx, ey = y + x.el.offsetHeight / 2;
      lines.push(`<path d="M${ex} ${ey} H${ex + (side === 'left' ? 24 : -24)} L${x.a.x} ${x.a.y}"/><circle cx="${x.a.x}" cy="${x.a.y}" r="3.5"/>`);
      y += GAP;
    }
  }
  for (const el of callouts) if (!placed.some((x) => x.el === el)) el.style.transform = 'translate(-999px, 0)';
  svg.innerHTML = lines.join('');
  const pop = $('[data-pop]'), owner = ui.open && document.querySelector(`[data-callouts] [data-slot="${ui.open}"]`);
  if (!pop.hidden && owner) { const r = owner.getBoundingClientRect(), left = owner.dataset.side === 'left'; pop.style.left = `${left ? r.right + 16 : r.left - 16 - pop.offsetWidth}px`; pop.style.top = `${Math.max(90, Math.min(r.top - 20, innerHeight - pop.offsetHeight - 24))}px`; }
}
requestAnimationFrame(layout);

// ---- a slot's items, next to its label
function openPop(slotName) {
  const s = kit.slots().find((x) => x.name === slotName); if (!s) return closePop();
  const pop = $('[data-pop]'), shown = kit.shown(s.name), cur = kit.item(shown);
  const input = h('input', { type: 'search', placeholder: `${T.find}: ${say(s.text).toLowerCase()}`, 'aria-label': T.find });
  const grid = h('div', { class: 'grid' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    grid.replaceChildren(...s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q)).map((id) => {
      const it = kit.item(id), b = h('button', { type: 'button', 'aria-pressed': String(id === shown), title: it.default ? T.standard : say(it.name), style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), h('span', {}, it.default ? T.standard : say(it.name)));
      b.onclick = () => kit.wear(s.name, id, 0); return b;
    }));
  };
  input.oninput = fill; fill();
  const styles = cur && !cur.default && cur.styles.length > 1 ? h('div', { class: 'styles' }, ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, shown, i); return b; })) : null;
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 18) }); close.onclick = () => { ui.open = null; closePop(); markOpen(); };
  pop.replaceChildren(h('header', {}, h('h2', {}, say(s.text)), cur && !cur.default ? h('span', { class: 'rar', style: { '--r': RARITY[cur.rarity] } }, rarityName(cur.rarity)) : null, close), h('label', { class: 'find', html: icon('search', 16) }, input), styles, grid);
  pop.hidden = false;
  // A slot below (not on his body) opens its items above the row.
  if (!document.querySelector(`[data-callouts] [data-slot="${slotName}"]`)) { const r = document.querySelector(`[data-other] [data-slot="${slotName}"]`)?.getBoundingClientRect(); if (r) { pop.style.left = `${Math.min(r.left, innerWidth - pop.offsetWidth - 16)}px`; pop.style.top = `${r.top - pop.offsetHeight - 12}px`; } }
}
function closePop() { $('[data-pop]').hidden = true; }
addEventListener('click', (e) => { const pop = $('[data-pop]'); if (!pop.hidden && !pop.contains(e.target)) { ui.open = null; closePop(); markOpen(); } });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.open = null; closePop(); markOpen(); } });

// ---- heroes and the link
const sheet = $('[data-heroes]');
$('[data-change]').onclick = () => {
  const input = h('input', { type: 'search', placeholder: T.findHero, 'aria-label': T.findHero });
  const list = h('div', { class: 'faces' });
  const fill = () => { const q = input.value.trim().toLowerCase(); list.replaceChildren(...['str', 'agi', 'int', 'all'].flatMap((a) => { const xs = kit.heroes.filter((x) => x.attribute === a && (!q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q)))); return xs.length ? [h('h3', {}, ATTRIBUTE[lang][a]), ...xs.map((x) => { const b = h('button', { type: 'button', 'aria-current': String(x.id === kit.hero?.id) }, h('img', { src: kit.portrait(x.id, 'icon'), alt: '' }), say(x.name)); b.onclick = () => { sheet.close(); if (x.id !== kit.hero?.id) kit.open(x.id); }; return b; })] : []; })); };
  input.oninput = fill; fill();
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 18) }); close.onclick = () => sheet.close();
  sheet.replaceChildren(h('header', {}, h('label', { class: 'find', html: icon('search', 16) }, input), close), list);
  sheet.showModal(); input.focus();
};
const share = $('[data-share]');
const shareLabel = (done) => share.replaceChildren(h('span', { html: icon(done ? 'check' : 'link', 18) }), done ? T.copied : T.share);
shareLabel(false);
share.onclick = async () => { try { await navigator.clipboard.writeText(kit.link); } catch { /* no clipboard */ } shareLabel(true); setTimeout(() => shareLabel(false), 1600); };
render();
