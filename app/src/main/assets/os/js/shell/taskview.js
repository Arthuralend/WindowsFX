/* Представление задач и виртуальные рабочие столы */
'use strict';

const TaskView = (() => {
  const el = () => document.getElementById('taskview');
  let open = false;

  function render() {
    const cur = WM.desktops.current();
    const wins = WM.list().filter(w => w.desktop === cur).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex);
    const active = WM.active();
    el().innerHTML = `<div class="tv-windows"></div><div class="tv-desks"></div>`;
    const box = $('.tv-windows', el());
    if (!wins.length) box.innerHTML = '<div class="tv-empty">На этом рабочем столе нет открытых окон</div>';
    wins.forEach((w, i) => {
      const ratio = w.bounds.h / w.bounds.w;
      const W = 280, H = clamp(Math.round(W * ratio), 120, 220);
      const card = h(`<div class="tv-card ${active === w ? 'active' : ''}" draggable="true" style="transition-delay:${i * 25}ms">
        <div class="tv-card-head">${Icons.get(w.icon, 18)}<span>${esc(w.title)}</span><button class="icon-btn" title="Закрыть">${Icons.ui('close', 12)}</button></div>
        <div class="tv-thumb" style="height:${H}px"></div>
      </div>`);
      $('.tv-thumb', card).append(Taskbar.thumb(w, W, H));
      card.onclick = () => { hide(); WM.focus(w); };
      $('.icon-btn', card).onclick = async e => { e.stopPropagation(); await w.close(); render(); };
      card.oncontextmenu = e => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(e.clientX, e.clientY, [
          { label: 'Развернуть', icon: 'maximize', action: () => { hide(); WM.maximize(w); WM.focus(w); } },
          { label: 'Прикрепить слева', icon: 'snap', action: () => { hide(); WM.snap(w, 'left'); } },
          { label: 'Прикрепить справа', icon: 'snap', action: () => { hide(); WM.snap(w, 'right'); } },
          { label: 'Переместить на', icon: 'taskview', items: [
            ...WM.desktops.list().map((d, i) => ({ label: d.name, disabled: i === cur, action: () => { WM.desktops.move(w, i); render(); } })),
            { label: 'Новый рабочий стол', icon: 'plus', action: () => { WM.desktops.move(w, WM.desktops.add()); render(); } },
          ] },
          { sep: true },
          { label: 'Закрыть', icon: 'close', action: async () => { await w.close(); render(); } },
        ]);
      };
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-w12-win', w.id); e.dataTransfer.effectAllowed = 'move'; });
      box.append(card);
    });

    const desks = $('.tv-desks', el());
    WM.desktops.list().forEach((d, i) => {
      const count = WM.list().filter(w => w.desktop === i).length;
      const dk = h(`<div class="tv-desk ${i === cur ? 'cur' : ''}">
        <div class="tv-desk-thumb" style="background:${Desktop.wallpaperCSS()};background-size:cover;background-position:center">
          ${WM.desktops.list().length > 1 ? `<button class="icon-btn x" title="Закрыть рабочий стол">${Icons.ui('close', 12)}</button>` : ''}
          <span class="cnt">${count ? count + ' ' + plural(count, 'окно', 'окна', 'окон') : ''}</span>
        </div>
        <div class="tv-desk-name">${esc(d.name)}</div>
      </div>`);
      $('.tv-desk-thumb', dk).onclick = () => { WM.desktops.switch(i); render(); };
      $('.tv-desk-name', dk).ondblclick = async () => {
        const n = await UI.prompt('Переименовать рабочий стол', 'Имя:', d.name);
        if (n) { WM.desktops.rename(i, n); render(); }
      };
      $('.x', dk)?.addEventListener('click', e => { e.stopPropagation(); WM.desktops.remove(i); render(); });
      dk.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-w12-win')) { e.preventDefault(); dk.classList.add('dragover'); } });
      dk.addEventListener('dragleave', () => dk.classList.remove('dragover'));
      dk.addEventListener('drop', e => {
        const w = WM.get(e.dataTransfer.getData('text/x-w12-win'));
        if (w) { WM.desktops.move(w, i); render(); }
      });
      dk.oncontextmenu = e => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(e.clientX, e.clientY, [
          { label: 'Переименовать', icon: 'rename', action: () => $('.tv-desk-name', dk).dispatchEvent(new Event('dblclick')) },
          { label: 'Закрыть', icon: 'close', disabled: WM.desktops.list().length < 2, action: () => { WM.desktops.remove(i); render(); } },
        ]);
      };
      desks.append(dk);
    });
    const add = h(`<div class="tv-desk tv-add"><div class="tv-desk-thumb">${Icons.ui('plus', 26)}</div><div class="tv-desk-name">Новый рабочий стол</div></div>`);
    add.onclick = () => { WM.desktops.add(); render(); };
    add.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-w12-win')) { e.preventDefault(); add.classList.add('dragover'); } });
    add.addEventListener('dragleave', () => add.classList.remove('dragover'));
    add.addEventListener('drop', e => { const w = WM.get(e.dataTransfer.getData('text/x-w12-win')); if (w) { WM.desktops.move(w, WM.desktops.add()); render(); } });
    desks.append(add);
  }

  function show() {
    Shell.closeAll();
    UI.closeMenus();
    open = true;
    render();
    requestAnimationFrame(() => el().classList.add('open'));
  }
  function hide() { open = false; el().classList.remove('open'); }
  function toggle() { open ? hide() : show(); }

  function init() {
    el().addEventListener('click', e => { if (e.target === el() || e.target.classList.contains('tv-windows')) hide(); });
    el().addEventListener('contextmenu', e => e.preventDefault());
    WM.on('desktops', () => { if (open) render(); });
  }

  return { init, show, hide, toggle, isOpen: () => open };
})();
