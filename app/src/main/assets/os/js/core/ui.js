/* Общие UI-компоненты: контекстные меню, диалоги, уведомления, выбор файлов */
'use strict';

/** Менеджер всплывающих панелей оболочки (Пуск, быстрые настройки и т. д.) */
const Shell = (() => {
  const flyouts = {};
  const em = new Emitter();
  return {
    register(name, def) { flyouts[name] = def; },
    isOpen(name) { return !!flyouts[name]?.el.classList.contains('open'); },
    open(name, arg) {
      this.closeAll(name);
      UI.closeMenus();
      const f = flyouts[name];
      if (!f || this.isOpen(name)) return;
      f.el.classList.add('open');
      f.onOpen?.(arg);
      em.emit('change', name, true);
    },
    close(name) {
      const f = flyouts[name];
      if (!f || !this.isOpen(name)) return;
      f.el.classList.remove('open');
      f.onClose?.();
      em.emit('change', name, false);
    },
    toggle(name, arg) { this.isOpen(name) ? this.close(name) : this.open(name, arg); },
    closeAll(except) { Object.keys(flyouts).forEach(n => n !== except && this.close(n)); },
    anyOpen() { return Object.keys(flyouts).some(n => this.isOpen(n)); },
    on: (e, f) => em.on(e, f),
    contains(target) {
      return Object.values(flyouts).some(f => f.el.contains(target)) || !!target.closest?.('[data-flyout]');
    },
  };
})();

const UI = (() => {
  const layer = () => document.getElementById('overlay-layer');

  // ---------------- Контекстное меню ----------------
  let menus = [];

  function renderIcon(icon) {
    if (!icon) return '';
    if (icon.startsWith('<')) return icon;
    if (icon.startsWith('app:')) return Icons.get(icon.slice(4), 16);
    return Icons.ui(icon, 16);
  }

  function buildMenu(items, level) {
    const m = h('<div class="ctx-menu glass" role="menu"></div>');
    m.dataset.level = level;
    items.filter(Boolean).forEach(it => {
      if (it.sep) { m.append(h('<div class="ctx-sep"></div>')); return; }
      if (it.header) { m.append(h(`<div class="ctx-header">${esc(it.header)}</div>`)); return; }
      const row = h(`<div class="ctx-item ${it.disabled ? 'disabled' : ''} ${it.danger ? 'danger' : ''}" role="menuitem">
        <span class="ctx-ic">${it.checked ? Icons.ui('check', 16) : renderIcon(it.icon)}</span>
        <span class="ctx-label">${esc(it.label)}</span>
        ${it.items ? `<span class="ctx-sub">${Icons.ui('chevron-right', 12)}</span>` : `<span class="ctx-sc">${esc(it.shortcut || '')}</span>`}
      </div>`);
      if (it.items) {
        let sub = null, t;
        const openSub = () => {
          clearTimeout(t);
          menus.filter(x => +x.dataset.level > level).forEach(x => x.remove());
          menus = menus.filter(x => +x.dataset.level <= level);
          sub = buildMenu(it.items, level + 1);
          layer().append(sub);
          menus.push(sub);
          const r = row.getBoundingClientRect();
          place(sub, r.right - 4, r.top - 5, r.left + 4);
        };
        row.addEventListener('mouseenter', () => { t = setTimeout(openSub, 120); });
        row.addEventListener('mouseleave', () => clearTimeout(t));
        row.addEventListener('click', e => { e.stopPropagation(); if (!it.disabled) openSub(); });
      } else {
        row.addEventListener('mouseenter', () => {
          menus.filter(x => +x.dataset.level > level).forEach(x => x.remove());
          menus = menus.filter(x => +x.dataset.level <= level);
        });
        row.addEventListener('click', e => {
          e.stopPropagation();
          if (it.disabled) return;
          closeMenus();
          it.action?.();
        });
      }
      m.append(row);
    });
    m.addEventListener('contextmenu', e => e.preventDefault());
    return m;
  }

  function place(el, x, y, altX) {
    const r = el.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    if (x + r.width > W - 6) x = altX !== undefined ? altX - r.width : W - r.width - 6;
    if (y + r.height > H - 6) y = Math.max(6, H - r.height - 6);
    el.style.left = Math.max(6, x) + 'px';
    el.style.top = Math.max(6, y) + 'px';
  }

  function menu(x, y, items, opts = {}) {
    closeMenus();
    const m = buildMenu(items, 0);
    if (opts.className) m.classList.add(opts.className);
    layer().append(m);
    menus.push(m);
    if (opts.above) y = y - m.getBoundingClientRect().height;
    place(m, x, y);
    m.classList.add('show');
    return m;
  }

  function closeMenus() {
    menus.forEach(m => m.remove());
    menus = [];
  }

  document.addEventListener('pointerdown', e => {
    if (menus.length && !e.target.closest('.ctx-menu')) closeMenus();
  }, true);
  window.addEventListener('blur', closeMenus);
  window.addEventListener('resize', closeMenus);

  // ---------------- Диалоги ----------------
  const DLG_ICONS = { warning: ['alert', '#ffb020'], error: ['close', '#ff5b5b'], info: ['info', 'var(--accent)'], question: ['info', 'var(--accent)'] };

  function dialog(opts) {
    return new Promise(resolve => {
      const back = h('<div class="dlg-backdrop"></div>');
      const ic = DLG_ICONS[opts.icon];
      const dlg = h(`<div class="dlg glass ${opts.wide ? 'wide' : ''}" role="dialog">
        <div class="dlg-title">${opts.appIcon ? Icons.get(opts.appIcon, 16) : ''}<span>${esc(opts.title || '')}</span><button class="dlg-x" title="Закрыть">${Icons.ui('close', 14)}</button></div>
        <div class="dlg-body">
          ${ic ? `<div class="dlg-icon" style="color:${ic[1]}">${Icons.ui(ic[0], 30)}</div>` : ''}
          <div class="dlg-main">
            ${opts.message ? `<div class="dlg-msg">${opts.html ? opts.message : esc(opts.message).replace(/\n/g, '<br>')}</div>` : ''}
            ${opts.input ? `<input class="input dlg-input" type="${opts.input.type || 'text'}" placeholder="${esc(opts.input.placeholder || '')}" value="${esc(opts.input.value ?? '')}">` : ''}
            <div class="dlg-error"></div>
          </div>
        </div>
        <div class="dlg-buttons"></div>
      </div>`);
      if (opts.content) $('.dlg-main', dlg).append(opts.content);
      const buttons = opts.buttons || [{ label: 'OK', value: true, primary: true }];
      const cancelValue = opts.cancelValue !== undefined ? opts.cancelValue : (buttons.find(b => b.cancel)?.value ?? null);
      const input = $('.dlg-input', dlg);
      const finish = (val) => {
        if (val !== cancelValue && opts.validate) {
          const err = opts.validate(input ? input.value : undefined, val);
          if (err) { $('.dlg-error', dlg).textContent = err; input?.focus(); return; }
        }
        document.removeEventListener('keydown', onKey, true);
        back.classList.add('closing');
        setTimeout(() => back.remove(), 150);
        resolve({ button: val, value: input ? input.value : undefined });
      };
      buttons.forEach(b => {
        const btn = h(`<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}">${esc(b.label)}</button>`);
        btn.onclick = () => finish(b.value);
        $('.dlg-buttons', dlg).append(btn);
      });
      $('.dlg-x', dlg).onclick = () => finish(cancelValue);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(cancelValue); }
        else if (e.key === 'Enter' && !e.shiftKey && (e.target === input || !['TEXTAREA', 'BUTTON'].includes(e.target.tagName))) {
          e.preventDefault(); e.stopPropagation();
          const p = buttons.find(b => b.primary) || buttons[0];
          finish(p.value);
        }
      };
      document.addEventListener('keydown', onKey, true);
      back.append(dlg);
      layer().append(back);
      // перетаскивание диалога
      const title = $('.dlg-title', dlg);
      title.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        const r = dlg.getBoundingClientRect();
        const ox = e.clientX - r.left, oy = e.clientY - r.top;
        dlg.style.position = 'fixed'; dlg.style.margin = '0';
        const mv = ev => { dlg.style.left = clamp(ev.clientX - ox, 0, innerWidth - 80) + 'px'; dlg.style.top = clamp(ev.clientY - oy, 0, innerHeight - 40) + 'px'; };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      if (opts.sound !== false) Sound.play(opts.icon === 'error' ? 'error' : 'notify');
      setTimeout(() => {
        if (input) {
          input.focus();
          if (opts.input.selectStem && input.value.lastIndexOf('.') > 0) input.setSelectionRange(0, input.value.lastIndexOf('.'));
          else input.select();
        } else $('.btn.primary', dlg)?.focus();
      }, 30);
    });
  }

  async function prompt(title, label, value = '', opts = {}) {
    const r = await dialog({
      title, message: label, input: { value, placeholder: opts.placeholder, selectStem: opts.selectStem, type: opts.type },
      buttons: [{ label: opts.ok || 'OK', value: true, primary: true }, { label: 'Отмена', value: false, cancel: true }],
      validate: opts.validate, sound: false,
    });
    return r.button ? r.value : null;
  }

  async function confirm(title, message, opts = {}) {
    const r = await dialog({
      title, message, icon: opts.icon || 'warning',
      buttons: [{ label: opts.ok || 'Да', value: true, primary: true, danger: opts.danger }, { label: opts.cancel || 'Отмена', value: false, cancel: true }],
    });
    return !!r.button;
  }

  function alert(title, message, icon = 'info') {
    return dialog({ title, message, icon, buttons: [{ label: 'OK', value: true, primary: true }] });
  }

  // ---------------- Уведомления ----------------
  const notifEm = new Emitter();
  let notifications = Persist.get('notifications', []);
  const handlers = new Map();

  function saveNotifs() { Persist.set('notifications', notifications.slice(0, 40)); }

  function notifIcon(icon) {
    if (!icon) return Icons.get('start', 20);
    if (Icons.has(icon)) return Icons.get(icon, 20);
    return `<span class="nicon-glyph">${Icons.ui(icon, 16)}</span>`;
  }

  function notify(n) {
    const item = { id: uid('n'), title: n.title || '', body: n.body || '', icon: n.icon || n.app || 'start', app: n.app ? (Apps.get(n.app)?.name || n.app) : (n.appName || 'Система'), ts: Date.now() };
    if (n.onClick || n.actions) handlers.set(item.id, { onClick: n.onClick, actions: n.actions });
    if (!n.transient) {
      notifications.unshift(item);
      notifications = notifications.slice(0, 40);
      saveNotifs();
      notifEm.emit('change');
    }
    if (!Store.get('dnd') && Store.get('toasts')) {
      showToast(item, n);
      if (!n.silent) Sound.play('notify');
    }
    return item.id;
  }

  function showToast(item, n) {
    const t = h(`<div class="toast glass">
      <div class="toast-head"><span class="toast-app">${notifIcon(item.icon)}<span>${esc(item.app)}</span></span><button class="toast-x" title="Закрыть">${Icons.ui('close', 12)}</button></div>
      <div class="toast-title">${esc(item.title)}</div>
      ${item.body ? `<div class="toast-body">${esc(item.body)}</div>` : ''}
      ${n.actions ? `<div class="toast-actions">${n.actions.map((a, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`);
    const box = document.getElementById('toasts');
    box.append(t);
    let timer;
    const close = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 250); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, n.duration || 6000); };
    if (!n.sticky) arm();
    t.addEventListener('mouseenter', () => clearTimeout(timer));
    t.addEventListener('mouseleave', () => { if (!n.sticky) arm(); });
    $('.toast-x', t).onclick = e => { e.stopPropagation(); close(); };
    $$('.toast-actions button', t).forEach(b => b.onclick = e => { e.stopPropagation(); n.actions[+b.dataset.i].fn?.(); close(); });
    t.onclick = () => { n.onClick?.(); close(); };
    while (box.children.length > 4) box.firstElementChild.remove();
    return close;
  }

  const Notifications = {
    list: () => notifications,
    on: (e, f) => notifEm.on(e, f),
    dismiss(id) { notifications = notifications.filter(n => n.id !== id); handlers.delete(id); saveNotifs(); notifEm.emit('change'); },
    clear() { notifications = []; handlers.clear(); saveNotifs(); notifEm.emit('change'); },
    activate(id) { handlers.get(id)?.onClick?.(); this.dismiss(id); },
  };

  // ---------------- Диалог выбора файла ----------------
  function filePicker(opts = {}) {
    const mode = opts.mode || 'open';
    let cur = opts.dir && FS.isDir(opts.dir) ? FS.realPath(opts.dir) : FS.P.docs;
    const kinds = opts.kinds; // ['text','code'] и т. п.
    return new Promise(resolve => {
      const back = h('<div class="dlg-backdrop"></div>');
      const dlg = h(`<div class="dlg glass picker">
        <div class="dlg-title">${Icons.get('explorer', 16)}<span>${esc(opts.title || (mode === 'save' ? 'Сохранение' : 'Открытие'))}</span><button class="dlg-x">${Icons.ui('close', 14)}</button></div>
        <div class="pk-bar">
          <button class="icon-btn pk-up" title="Вверх">${Icons.ui('up', 16)}</button>
          <div class="pk-path input"></div>
          <button class="icon-btn pk-new" title="Новая папка">${Icons.ui('new-folder', 16)}</button>
        </div>
        <div class="pk-main">
          <div class="pk-side"></div>
          <div class="pk-list"></div>
        </div>
        <div class="pk-foot">
          <label>Имя файла:</label>
          <input class="input pk-name" value="${esc(opts.name || '')}" ${mode !== 'save' ? 'readonly placeholder="Выберите файл"' : ''}>
          <span class="pk-type">${esc(opts.typeLabel || (kinds ? 'Поддерживаемые файлы' : 'Все файлы (*.*)'))}</span>
          <button class="btn primary pk-ok">${opts.okLabel || (mode === 'save' ? 'Сохранить' : mode === 'folder' ? 'Выбрать папку' : 'Открыть')}</button>
          <button class="btn pk-cancel">Отмена</button>
        </div>
      </div>`);
      back.append(dlg);
      layer().append(back);
      const nameIn = $('.pk-name', dlg);
      let selected = null;

      const side = $('.pk-side', dlg);
      [['Рабочий стол', FS.P.desktop, 'folder-desktop'], ['Документы', FS.P.docs, 'folder-docs'], ['Загрузки', FS.P.downloads, 'folder-downloads'],
        ['Изображения', FS.P.pictures, 'folder-images'], ['Музыка', FS.P.music, 'folder-music'], ['Видео', FS.P.videos, 'folder-video'],
        ['Диск C:', 'C:', 'drive-win'], ['Диск D:', 'D:', 'drive']].forEach(([n, p, ic]) => {
        const b = h(`<div class="pk-side-item">${Icons.get(ic, 18)}<span>${esc(n)}</span></div>`);
        b.onclick = () => go(p);
        side.append(b);
      });

      function matches(item) {
        if (mode === 'folder') return item.isDir;
        if (item.isDir) return true;
        if (!kinds) return true;
        return kinds.includes(FS.typeOf(item.path, item.node).kind);
      }

      function go(p) {
        cur = FS.realPath(p);
        selected = null;
        $('.pk-path', dlg).textContent = FS.display(cur);
        const listEl = $('.pk-list', dlg);
        listEl.innerHTML = '';
        const items = FS.list(cur).filter(matches);
        if (!items.length) listEl.innerHTML = '<div class="pk-empty">Эта папка пуста.</div>';
        items.forEach(it => {
          const t = FS.typeOf(it.path, it.node);
          const row = h(`<div class="pk-item">${Icons.get(t.icon, 18, { shortcut: t.shortcut })}<span class="pk-n">${esc(it.name)}</span><span class="pk-d">${fmtDateTime(it.node.mt)}</span><span class="pk-t">${esc(t.label)}</span></div>`);
          row.onclick = () => {
            $$('.pk-item.sel', listEl).forEach(x => x.classList.remove('sel'));
            row.classList.add('sel');
            if (!it.isDir) { selected = it.path; nameIn.value = it.name; }
            else if (mode === 'folder') { selected = it.path; nameIn.value = it.name; }
          };
          row.ondblclick = () => it.isDir ? go(it.path) : (selected = it.path, nameIn.value = it.name, ok());
          listEl.append(row);
        });
        if (mode === 'folder') nameIn.value = FS.basename(cur) || FS.display(cur);
      }

      const finish = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
      async function ok() {
        if (mode === 'folder') { finish(FS.realPath(selected || cur)); return; }
        if (mode === 'open') {
          if (!selected) {
            const n = nameIn.value.trim();
            if (n && FS.get(cur + '/' + n)?.t === 'f') selected = cur + '/' + n; else return;
          }
          finish(FS.realPath(selected));
        } else {
          let n = nameIn.value.trim();
          try { FS.validName(n); } catch (e) { alert('Сохранение', e.message, 'error'); return; }
          if (opts.ext && !FS.ext(n)) n += '.' + opts.ext;
          const p = cur + '/' + n;
          const ex = FS.get(p);
          if (ex && ex.t === 'd') { go(p); return; }
          if (ex) {
            const yes = await confirm('Подтвердить сохранение', `${n} уже существует.\nВы хотите заменить его?`);
            if (!yes) return;
          }
          finish(p);
        }
      }
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        if (e.key === 'Enter' && e.target === nameIn) { e.preventDefault(); ok(); }
      };
      document.addEventListener('keydown', onKey, true);
      $('.pk-ok', dlg).onclick = ok;
      $('.pk-cancel', dlg).onclick = () => finish(null);
      $('.dlg-x', dlg).onclick = () => finish(null);
      $('.pk-up', dlg).onclick = () => { const p = FS.parent(cur); if (p) go(p); };
      $('.pk-new', dlg).onclick = async () => {
        const n = await prompt('Новая папка', 'Имя папки:', FS.unique(cur, 'Новая папка'));
        if (!n) return;
        try { go(FS.mkdir(cur + '/' + n)); } catch (e) { alert('Ошибка', e.message, 'error'); }
      };
      go(cur);
      setTimeout(() => { nameIn.focus(); if (mode === 'save') nameIn.setSelectionRange(0, FS.stem(nameIn.value).length); }, 30);
    });
  }

  // ---------------- Свойства ----------------
  function properties(path) {
    const node = FS.get(path);
    if (!node) return;
    const t = FS.typeOf(path, node);
    const size = FS.nodeSize(node);
    const name = FS.basename(path);
    let extra = '';
    if (node.t === 'd') {
      const c = FS.countItems(node);
      extra = `<tr><td>Содержит:</td><td>Файлов: ${c.files}; папок: ${c.dirs}</td></tr>`;
    }
    if (t.kind === 'lnk' && t.target) {
      const target = t.target.args?.path ? FS.display(t.target.args.path).replace('thispc:\\\\', 'Этот компьютер') : (Apps.get(t.target.app)?.name || t.target.app);
      extra += `<tr><td>Объект:</td><td>${esc(target)}</td></tr>`;
    }
    const content = h(`<div class="props">
      <div class="props-head">${Icons.get(t.icon, 40, { shortcut: t.shortcut })}<input class="input" value="${esc(name)}" readonly></div>
      <table>
        <tr><td>Тип:</td><td>${esc(t.label)}</td></tr>
        <tr><td>Расположение:</td><td>${esc(FS.display(FS.parent(path)))}</td></tr>
        <tr><td>Размер:</td><td>${fmtBytes(size)} (${size.toLocaleString('ru-RU')} байт)</td></tr>
        ${extra}
        <tr class="sep"><td>Создан:</td><td>${fmtDateLong(node.ct)}, ${fmtTime(node.ct)}</td></tr>
        <tr><td>Изменён:</td><td>${fmtDateLong(node.mt)}, ${fmtTime(node.mt)}</td></tr>
        <tr class="sep"><td>Атрибуты:</td><td>${FS.isProtected(path) ? 'Системный, только чтение' : 'Обычный'}</td></tr>
      </table>
    </div>`);
    return dialog({ title: 'Свойства: ' + name, content, buttons: [{ label: 'OK', value: true, primary: true }], sound: false });
  }

  return { menu, closeMenus, dialog, prompt, confirm, alert, notify, Notifications, filePicker, properties, renderIcon };
})();
