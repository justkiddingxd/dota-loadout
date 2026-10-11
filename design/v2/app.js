// Locker: the hero on the left; on the right a board of his slots, each a tile with what it wears.
// A tile opens that slot's items (back returns to the board); the hero is changed the same way, in
// the panel, not over it.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { change: 'Сменить героя', back: 'Назад', board: 'Наряд', find: 'Найти', findHero: 'Найти героя', all: 'Все', share: 'Ссылка', copied: 'Скопировано', turn: 'Повернуть', standard: 'Стандарт', none: 'Ничего не нашлось', style: 'Стиль', worn: 'Надето', heroes: 'Герои' }
  : { change: 'Change hero', back: 'Back', board: 'Outfit', find: 'Find', findHero: 'Find a hero', all: 'All', share: 'Link', copied: 'Copied', turn: 'Turn', standard: 'Default', none: 'Nothing found', style: 'Style', worn: 'Worn', heroes: 'Heroes' };
// The panel shows the board, a slot's items, or the heroes.
const ui = { view: 'board', slot: null, query: '', attr: null };

const kit = await start($('[data-view]'), {
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.view = 'board'; ui.query = ''; } render(); },
});

function go(view, slot = null) { ui.view = view; ui.slot = slot; ui.query = ''; render(true); }

function render(moved = false) {
  const panel = $('[data-panel]');
  const view = ui.view === 'slot' ? slotView() : ui.view === 'heroes' ? heroView() : boardView();
  view.classList.add('view'); if (moved) view.classList.add('enter');
  panel.replaceChildren(view); if (moved) panel.scrollTop = 0;
  const hero = kit.hero; if (hero) document.title = `${say(hero.name)} — Loadout`;
}

// ---- the board
function boardView() {
  const hero = kit.hero;
  const change = h('button', { type: 'button', class: 'text-btn' }, T.change, h('span', { html: icon('next', 16) })); change.onclick = () => go('heroes');
  const head = h('header', { class: 'hero-head' },
    h('img', { class: 'portrait', src: kit.portrait(hero.id), alt: '' }),
    h('div', {}, h('h1', {}, say(hero.name)), h('p', {}, ATTRIBUTE[lang][hero.attribute]), change));
  const tiles = kit.slots().map((s) => {
    const id = kit.shown(s.name), it = kit.item(id), pic = id && kit.picture(id, kit.styleOf(s.name)), plain = !it || it.default;
    const b = h('button', { type: 'button', class: `tile${plain ? ' plain' : ''}` },
      h('span', { class: 'pic' }, pic ? h('img', { src: pic, alt: '' }) : null),
      h('span', { class: 'slot' }, say(s.text)),
      h('span', { class: 'iname' }, !it ? '—' : plain ? T.standard : say(it.name)),
      plain ? null : h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)));
    b.onclick = () => go('slot', s.name);
    return b;
  });
  return h('section', {}, head, h('div', { class: 'board', 'data-board': '' }, ...tiles));
}

// ---- a slot's items
function slotView() {
  const s = kit.slots().find((x) => x.name === ui.slot); if (!s) return boardView();
  const back = h('button', { type: 'button', class: 'back' }, h('span', { html: icon('back', 18) }), T.board); back.onclick = () => go('board');
  const shown = kit.shown(s.name), cur = kit.item(shown);
  const input = h('input', { type: 'search', placeholder: `${T.find}: ${say(s.text).toLowerCase()}`, value: ui.query, 'aria-label': T.find });
  const grid = h('div', { class: 'grid' });
  const fill = () => {
    const q = ui.query.trim().toLowerCase(), ids = s.items.filter((id) => !q || say(kit.item(id).name).toLowerCase().includes(q));
    grid.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = kit.item(id), on = id === shown;
      const b = h('button', { type: 'button', class: 'card', 'aria-pressed': String(on) },
        h('span', { class: 'pic' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' }), on ? h('span', { class: 'on' }, T.worn) : null),
        h('span', { class: 'iname' }, it.default ? T.standard : say(it.name)),
        it.default ? null : h('span', { class: 'rar', style: { '--r': RARITY[it.rarity] } }, rarityName(it.rarity)));
      b.onclick = async () => { await kit.wear(s.name, id, 0); };
      return b;
    }) : [h('p', { class: 'none' }, T.none)]));
  };
  input.oninput = () => { ui.query = input.value; fill(); };
  fill();
  const styles = cur && !cur.default && cur.styles.length > 1
    ? h('div', { class: 'styles' }, h('span', {}, T.style), ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, shown, i); return b; }))
    : null;
  return h('section', {}, h('div', { class: 'bar' }, back), h('h2', { class: 'slot-title' }, say(s.text), h('small', {}, String(s.items.length))),
    h('label', { class: 'find', html: icon('search', 18) }, input), styles, grid);
}

// ---- the heroes
function heroView() {
  const back = h('button', { type: 'button', class: 'back' }, h('span', { html: icon('back', 18) }), T.board); back.onclick = () => go('board');
  const input = h('input', { type: 'search', placeholder: T.findHero, value: ui.query, 'aria-label': T.findHero });
  const grid = h('div', { class: 'heroes' });
  const attrs = h('div', { class: 'attrs' }, ...[null, 'str', 'agi', 'int', 'all'].map((a) => { const b = h('button', { type: 'button', 'aria-pressed': String(ui.attr === a) }, a ? ATTRIBUTE[lang][a] : T.all); b.onclick = () => { ui.attr = a; for (const x of attrs.children) x.setAttribute('aria-pressed', String(x === b)); fill(); }; return b; }));
  const fill = () => {
    const q = ui.query.trim().toLowerCase();
    const list = kit.heroes.filter((x) => (!ui.attr || x.attribute === ui.attr) && (!q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q))));
    grid.replaceChildren(...list.map((x) => { const b = h('button', { type: 'button', class: 'hero', 'aria-current': String(x.id === kit.hero?.id) }, h('img', { src: kit.portrait(x.id), alt: '', loading: 'lazy' }), h('span', {}, say(x.name))); b.onclick = () => (x.id === kit.hero?.id ? go('board') : kit.open(x.id)); return b; }));
  };
  input.oninput = () => { ui.query = input.value; fill(); };
  fill(); setTimeout(() => input.focus());
  return h('section', {}, h('div', { class: 'bar' }, back), h('h2', { class: 'slot-title' }, T.heroes, h('small', {}, String(kit.heroes.length))), h('label', { class: 'find', html: icon('search', 18) }, input), attrs, grid);
}

// ---- the stage's two actions
const share = $('[data-share]'), turn = $('[data-turn]');
const shareLabel = (done) => share.replaceChildren(h('span', { html: icon(done ? 'check' : 'link', 18) }), done ? T.copied : T.share);
shareLabel(false); turn.replaceChildren(h('span', { html: icon('turn', 18) }), T.turn);
share.onclick = async () => { try { await navigator.clipboard.writeText(kit.link); } catch { /* no clipboard */ } shareLabel(true); setTimeout(() => shareLabel(false), 1600); };
let angle = 0; turn.onclick = () => { angle += Math.PI / 2; kit.viewer.rotate(angle); };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.view !== 'board') go('board'); });
render();
