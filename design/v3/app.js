// Configurator: the outfit put together step by step, as a car is: one slot a step, its options in
// a row under the hero, Next to the following slot; the last step sums it up with the link.
import { ATTRIBUTE, h, icon, lang, RARITY, rarityName, say, start } from '../kit.js';

const $ = (s) => document.querySelector(s);
const ru = lang === 'ru';
const T = ru
  ? { summary: 'Итог', next: 'Далее', back: 'Назад', of: (a, b) => `Шаг ${a} из ${b}`, standard: 'Стандарт', copy: 'Скопировать ссылку', copied: 'Ссылка скопирована', restart: 'Начать заново', change: 'Сменить', findHero: 'Найти героя', chosen: (n) => (n ? `Выбрано вещей: ${n}` : 'Пока всё стандартное'), style: 'Стиль', close: 'Закрыть' }
  : { summary: 'Summary', next: 'Next', back: 'Back', of: (a, b) => `Step ${a} of ${b}`, standard: 'Default', copy: 'Copy link', copied: 'Link copied', restart: 'Start over', change: 'Change', findHero: 'Find a hero', chosen: (n) => (n ? `${n} items chosen` : 'All default so far'), style: 'Style', close: 'Close' };
const ui = { step: 0 };

const kit = await start($('[data-view]'), {
  viewer: { framing: 'hero' },
  onProgress: (a, b) => { $('[data-bar]').style.width = `${b ? (a / b) * 100 : 0}%`; },
  onLoading: (on) => { $('[data-loading]').hidden = !on; },
  onChange: (why) => { if (why === 'hero') { ui.step = 0; kit.viewer.zoom(1.3); } render(); },
});
// The console takes the bottom of the screen: the hero a little closer.
kit.viewer.zoom(1.3);
// The steps: the slots that have a choice (more than their default), then the summary.
const steps = () => kit.slots().filter((s) => s.items.length > 1);

function render() { renderWho(); renderSteps(); renderConsole(); }

function renderWho() {
  const hero = kit.hero; if (!hero) return;
  $('[data-who]').replaceChildren(h('img', { src: kit.portrait(hero.id, 'icon'), alt: '' }), h('span', { class: 'name' }, say(hero.name)), h('span', { class: 'change' }, T.change));
  document.title = `${say(hero.name)} — Loadout`;
}

function renderSteps() {
  const list = steps();
  $('[data-steps]').replaceChildren(...[...list.map((s) => say(s.text)), T.summary].map((name, i) => {
    const s = list[i], it = s && kit.item(kit.shown(s.name)), done = s && it && !it.default;
    const b = h('button', { type: 'button', 'aria-current': ui.step === i ? 'step' : null, class: done ? 'done' : null }, h('span', { class: 'n' }, String(i + 1)), name);
    b.onclick = () => { ui.step = i; render(); };
    return h('li', {}, b);
  }));
  $('[data-steps] [aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function renderConsole() {
  const list = steps(), box = $('[data-console]'), last = ui.step >= list.length;
  const nav = h('div', { class: 'nav' });
  if (ui.step > 0) { const b = h('button', { type: 'button', class: 'secondary' }, h('span', { html: icon('back', 18) }), T.back); b.onclick = () => { ui.step--; render(); }; nav.append(b); }
  if (!last) { const nextName = list[ui.step + 1] ? say(list[ui.step + 1].text) : T.summary; const b = h('button', { type: 'button', class: 'primary' }, `${T.next}: ${nextName}`, h('span', { html: icon('next', 18) })); b.onclick = () => { ui.step++; render(); }; nav.append(b); }
  if (last) return box.replaceChildren(summary(list), nav);
  const s = list[ui.step], shown = kit.shown(s.name), cur = kit.item(shown);
  const options = h('div', { class: 'options', role: 'listbox', 'aria-label': say(s.text) }, ...s.items.map((id) => {
    const it = kit.item(id), on = id === shown;
    const b = h('button', { type: 'button', class: 'option', role: 'option', 'aria-selected': String(on), style: { '--r': it.default ? 'transparent' : RARITY[it.rarity] } },
      h('span', { class: 'pic' }, h('img', { src: kit.picture(id), alt: '', loading: 'lazy' })), h('span', { class: 'oname' }, it.default ? T.standard : say(it.name)));
    b.onclick = () => kit.wear(s.name, id, 0);
    return b;
  }));
  const styles = cur && !cur.default && cur.styles.length > 1
    ? h('div', { class: 'styles' }, h('span', {}, T.style), ...cur.styles.map((st, i) => { const b = h('button', { type: 'button', 'aria-pressed': String(kit.styleOf(s.name) === i) }, say(st.name) || String(i + 1)); b.onclick = () => kit.wear(s.name, shown, i); return b; }))
    : null;
  const title = h('div', { class: 'title' }, h('p', {}, T.of(ui.step + 1, list.length + 1)), h('h2', {}, say(s.text)),
    h('p', { class: 'current' }, cur?.default ? T.standard : say(cur?.name)), cur && !cur.default ? h('p', { class: 'rar', style: { '--r': RARITY[cur.rarity] } }, rarityName(cur.rarity)) : null);
  box.replaceChildren(title, h('div', { class: 'pick' }, styles, options), nav);
  box.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// The last step: what was chosen, the link, a way back to the start.
function summary(list) {
  const chosen = list.map((s) => [s, kit.item(kit.shown(s.name))]).filter(([, it]) => it && !it.default);
  const copy = h('button', { type: 'button', class: 'primary' }, h('span', { html: icon('link', 18) }), T.copy);
  copy.onclick = async () => { try { await navigator.clipboard.writeText(kit.link); } catch { /* no clipboard */ } copy.replaceChildren(h('span', { html: icon('check', 18) }), T.copied); };
  const restart = h('button', { type: 'button', class: 'secondary' }, T.restart);
  restart.onclick = async () => { for (const s of list) if (kit.look.worn[s.name]) await kit.wear(s.name, null); ui.step = 0; render(); };
  return h('div', { class: 'summary' },
    h('div', { class: 'title' }, h('p', {}, T.of(list.length + 1, list.length + 1)), h('h2', {}, T.summary), h('p', { class: 'current' }, T.chosen(chosen.length))),
    h('ul', {}, ...chosen.map(([s, it]) => { const li = h('li', {}, h('img', { src: kit.picture(kit.shown(s.name), kit.styleOf(s.name)), alt: '' }), h('span', {}, h('small', {}, say(s.text)), say(it.name))); li.onclick = () => { ui.step = list.indexOf(s); render(); }; return li; })),
    h('div', { class: 'share' }, copy, restart));
}

// Heroes: a sheet over everything, portraits by attribute.
const sheet = $('[data-heroes]');
$('[data-who]').onclick = () => {
  const input = h('input', { type: 'search', placeholder: T.findHero, 'aria-label': T.findHero });
  const groups = h('div', { class: 'groups' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    groups.replaceChildren(...['str', 'agi', 'int', 'all'].map((a) => {
      const list = kit.heroes.filter((x) => x.attribute === a && (!q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q))));
      return list.length ? h('section', {}, h('h3', {}, ATTRIBUTE[lang][a]), h('div', { class: 'faces' }, ...list.map((x) => { const b = h('button', { type: 'button', title: say(x.name), 'aria-current': String(x.id === kit.hero?.id) }, h('img', { src: kit.portrait(x.id), alt: say(x.name), loading: 'lazy' }), h('span', {}, say(x.name))); b.onclick = () => { sheet.close(); if (x.id !== kit.hero?.id) kit.open(x.id); }; return b; }))) : null;
    }));
  };
  input.oninput = fill; fill();
  const close = h('button', { type: 'button', class: 'x', 'aria-label': T.close, html: icon('close', 20) }); close.onclick = () => sheet.close();
  sheet.replaceChildren(h('header', {}, h('label', { class: 'find', html: icon('search', 18) }, input), close), groups);
  sheet.showModal(); input.focus();
};
addEventListener('keydown', (e) => {
  if (sheet.open || e.target.matches('input')) return;
  if (e.key === 'ArrowRight' && ui.step < steps().length) { ui.step++; render(); }
  if (e.key === 'ArrowLeft' && ui.step > 0) { ui.step--; render(); }
});
render();
