// Pieces the later prototypes share, styled by each page: the share button, the hero picker (a
// dialog with search and attributes), the animation menu.
import { animName, ATTRIBUTE, h, icon, lang, say } from './kit.js';

const ru = lang === 'ru';
export const W = ru
  ? { share: 'Ссылка', copied: 'Скопировано', findHero: 'Найти героя', close: 'Закрыть', anim: 'Анимация' }
  : { share: 'Link', copied: 'Copied', findHero: 'Find a hero', close: 'Close', anim: 'Animation' };

// A button that copies the outfit's link and says so for a moment.
export function shareButton(button, kit) {
  const label = (done) => button.replaceChildren(h('span', { html: icon(done ? 'check' : 'link', 18) }), h('span', { class: 'word' }, done ? W.copied : W.share));
  label(false);
  button.onclick = async () => { try { await navigator.clipboard.writeText(kit.link); } catch { /* no clipboard */ } label(true); setTimeout(() => label(false), 1600); };
}

// The heroes in a dialog: type to find, by attribute; Enter takes the first.
export function heroDialog(dialog, kit) {
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  return () => {
    const input = h('input', { type: 'search', placeholder: W.findHero, 'aria-label': W.findHero });
    const list = h('div', { class: 'hero-list' });
    let first = null;
    const fill = () => {
      const q = input.value.trim().toLowerCase(); first = null;
      list.replaceChildren(...['str', 'agi', 'int', 'all'].flatMap((a) => {
        const xs = kit.heroes.filter((x) => x.attribute === a && (!q || [x.name.en, x.name.ru, x.id].some((n) => n?.toLowerCase().includes(q))));
        first ||= xs[0] || null;
        return xs.length ? [h('h3', {}, ATTRIBUTE[lang][a]), h('div', { class: 'hero-grid' }, ...xs.map((x) => { const b = h('button', { type: 'button', 'aria-current': String(x.id === kit.hero?.id) }, h('img', { src: kit.portrait(x.id), alt: '', loading: 'lazy' }), h('span', {}, say(x.name))); b.onclick = () => go(x); return b; }))] : [];
      }));
    };
    const go = (x) => { dialog.close(); if (x.id !== kit.hero?.id) kit.open(x.id); };
    input.oninput = fill; input.onkeydown = (e) => { if (e.key === 'Enter' && first) go(first); };
    fill();
    const close = h('button', { type: 'button', class: 'x', 'aria-label': W.close, html: icon('close', 20) }); close.onclick = () => dialog.close();
    dialog.replaceChildren(h('header', {}, h('label', { class: 'find', html: icon('search', 18) }, input), close), list);
    dialog.showModal(); input.focus();
  };
}

// The hero's animations in a native menu.
export function animMenu(box, kit) {
  const list = kit.viewer.animations; if (!list.length) return box.replaceChildren();
  const sel = h('select', { 'aria-label': W.anim }, ...list.map((a) => h('option', { value: a.name }, animName(kit.hero, a))));
  sel.value = list.find((a) => a.activity === 'ACT_DOTA_LOADOUT')?.name || list[0].name;
  sel.onchange = () => kit.viewer.play(sel.value);
  box.replaceChildren(sel, h('span', { html: icon('down', 14) }));
}
