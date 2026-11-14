/* WindowsFX: общий буфер обмена с Android.
   В Android WebView navigator.clipboard работает не полностью: readText()/read() запрещены,
   а write() с HTML (так Lexicon и Tabs копируют таблицы) доходит до системы не на всех версиях.
   Здесь navigator.clipboard рабочего стола и окон Lexicon / Tabs / Photostore заменяется
   на системный буфер Android (FXNative.clipRead / clipWrite):
     - скопированное в WindowsFX сразу доступно в других Android-приложениях (текст и HTML-таблицы);
     - скопированное в Android вставляется в WindowsFX (кнопки «Вставить», Ctrl+V, readText()).
   В браузерной и Mac-версиях (нет clipRead) ничего не меняется. */
'use strict';

const Clip = (() => {
  const N = window.FXNative;
  const native = !!(N && typeof N.clipRead === 'function' && typeof N.clipWrite === 'function');
  const em = new Emitter();

  function readSystem() {
    try {
      const r = JSON.parse(N.clipRead());
      if (r && r.ok) return { text: r.ok.text || '', html: r.ok.html || '', empty: !!r.ok.empty };
    } catch (e) { console.warn('clipRead', e); }
    return { text: '', html: '', empty: true };
  }

  function writeSystem(text, html) {
    const r = JSON.parse(N.clipWrite(String(text == null ? '' : text), html ? String(html) : ''));
    if (r && r.err) throw new DOMException(r.msg || 'Clipboard write failed', 'NotAllowedError');
  }

  /** Текст из HTML — на случай, если приложение положило только HTML. */
  function htmlToText(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...d.querySelectorAll('tr')];
    if (rows.length) return rows.map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()).join('\t')).join('\n');
    return (d.body && d.body.innerText != null ? d.body.innerText : d.body?.textContent) || '';
  }

  const blobText = async v => { const b = await v; return typeof b === 'string' ? b : b.text(); };

  /** navigator.clipboard для окна win (рабочий стол или iframe приложения). */
  function makeApi(win) {
    const orig = win.navigator.clipboard;
    const origWrite = orig && orig.write ? orig.write.bind(orig) : null;
    return {
      async writeText(text) { writeSystem(text, ''); em.emit('write', { text: String(text), html: '' }); },
      async write(items) {
        let text = null, html = null, other = false;
        for (const it of items || []) {
          for (const t of it.types || []) {
            if (t === 'text/plain' && text == null) text = await blobText(it.getType(t));
            else if (t === 'text/html' && html == null) html = await blobText(it.getType(t));
            else if (t !== 'text/plain' && t !== 'text/html') other = true;
          }
        }
        // картинки (Photostore) — как и раньше, средствами WebView
        if (text == null && html == null) {
          if (other && origWrite) return origWrite(items);
          throw new DOMException('Нечего копировать', 'DataError');
        }
        if (text == null) text = htmlToText(html);
        writeSystem(text, html);
        em.emit('write', { text, html: html || '' });
      },
      async readText() { return readSystem().text; },
      async read() {
        const d = readSystem();
        const rec = {};
        const B = win.Blob, CI = win.ClipboardItem;
        if (!d.empty) rec['text/plain'] = new B([d.text], { type: 'text/plain' });
        if (d.html) rec['text/html'] = new B([d.html], { type: 'text/html' });
        if (!CI || !Object.keys(rec).length) return [];
        return [new CI(rec)];
      },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    };
  }

  /** Подменить navigator.clipboard в окне win. Вызывается до запуска кода приложения. */
  function install(win) {
    if (!native || !win || win.__fxClip) return;
    try {
      const impl = makeApi(win);
      // обещания — из «мира» самого окна: код приложения (wasm-bindgen) может проверять instanceof Promise
      const api = {};
      for (const k of Object.keys(impl)) {
        api[k] = /^(write|writeText|read|readText)$/.test(k)
          ? (...a) => win.Promise.resolve().then(() => impl[k](...a))
          : impl[k];
      }
      Object.defineProperty(win.navigator, 'clipboard', { configurable: true, get: () => api });
      win.__fxClip = true;
    } catch (e) { console.warn('Clip.install', e); }
  }

  /** Вставить содержимое буфера Android в документ doc так, как это сделал бы Ctrl+V:
   *  событием paste с текстом и HTML (Lexicon и Tabs принимают таблицы именно так). */
  function pasteInto(doc) {
    const d = native ? readSystem() : null;
    if (!d || d.empty) return false;
    const win = doc.defaultView;
    const dt = new win.DataTransfer();
    dt.setData('text/plain', d.text);
    if (d.html) dt.setData('text/html', d.html);
    let t = doc.activeElement;
    if (!t || t === doc.body || t === doc.documentElement) t = doc.querySelector('canvas') || doc.body;
    t.dispatchEvent(new win.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }));
    return true;
  }

  install(window);
  // Буфер изменён в другом приложении (или нами) — Android сообщает, пока WindowsFX на экране
  if (native && typeof FX !== 'undefined') FX.on('clipboard', d => em.emit('change', d || {}));

  return {
    native, install, pasteInto, htmlToText,
    read: () => (native ? readSystem() : null),
    write: (text, html) => { if (native) writeSystem(text, html); else navigator.clipboard?.writeText(String(text)); },
    on: (ev, fn) => em.on(ev, fn),
  };
})();
window.FXClip = Clip;
