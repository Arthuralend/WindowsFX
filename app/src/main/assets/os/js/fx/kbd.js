/* WindowsFX: языки ввода как в Windows — ENG / РУС / ՀԱՅ на физической клавиатуре.
   Раскладки Windows: «США», «Русская» (ЙЦУКЕН), «Армянская фонетическая» (kbdarmph).
   Переключение: Alt+Shift, Ctrl+Shift или Win+Пробел, щелчок по индикатору на панели задач;
   вместе с клавиатурой Android (язык текущей раскладки системы). */
'use strict';

const Kbd = (() => {
  const L = (s) => { const m = {}; s.trim().split(/\s+/).forEach(t => { const [k, a, b] = t.split('|'); m[k] = [a, b]; }); return m; };
  const enMap = L(`
    Backquote|\`|~ Digit1|1|! Digit2|2|@ Digit3|3|# Digit4|4|$ Digit5|5|% Digit6|6|^ Digit7|7|& Digit8|8|* Digit9|9|( Digit0|0|) Minus|-|_ Equal|=|+
    KeyQ|q|Q KeyW|w|W KeyE|e|E KeyR|r|R KeyT|t|T KeyY|y|Y KeyU|u|U KeyI|i|I KeyO|o|O KeyP|p|P BracketLeft|[|{ BracketRight|]|} Backslash|\\||
    KeyA|a|A KeyS|s|S KeyD|d|D KeyF|f|F KeyG|g|G KeyH|h|H KeyJ|j|J KeyK|k|K KeyL|l|L Semicolon|;|: Quote|'|"
    KeyZ|z|Z KeyX|x|X KeyC|c|C KeyV|v|V KeyB|b|B KeyN|n|N KeyM|m|M Comma|,|< Period|.|> Slash|/|? IntlBackslash|\\||`);
  // «|» внутри записи разделяет состояния, поэтому для Backslash задаём вручную
  enMap.Backslash = ['\\', '|']; enMap.IntlBackslash = ['\\', '|'];
  const ruMap = L(`
    Backquote|ё|Ё Digit1|1|! Digit2|2|" Digit3|3|№ Digit4|4|; Digit5|5|% Digit6|6|: Digit7|7|? Digit8|8|* Digit9|9|( Digit0|0|) Minus|-|_ Equal|=|+
    KeyQ|й|Й KeyW|ц|Ц KeyE|у|У KeyR|к|К KeyT|е|Е KeyY|н|Н KeyU|г|Г KeyI|ш|Ш KeyO|щ|Щ KeyP|з|З BracketLeft|х|Х BracketRight|ъ|Ъ
    KeyA|ф|Ф KeyS|ы|Ы KeyD|в|В KeyF|а|А KeyG|п|П KeyH|р|Р KeyJ|о|О KeyK|л|Л KeyL|д|Д Semicolon|ж|Ж Quote|э|Э
    KeyZ|я|Я KeyX|ч|Ч KeyC|с|С KeyV|м|М KeyB|и|И KeyN|т|Т KeyM|ь|Ь Comma|б|Б Period|ю|Ю Slash|.|,`);
  ruMap.Backslash = ['\\', '/']; ruMap.IntlBackslash = ['\\', '/'];
  // Армянская фонетическая (Windows): строчная | прописная
  const hyMap = L(`
    Backquote|՝|՜ Digit1|է|Է Digit2|թ|Թ Digit3|փ|Փ Digit4|ձ|Ձ Digit5|ջ|Ջ Digit6|ւ|Ւ Digit7|և|և Digit8|ր|Ր Digit9|չ|Չ Digit0|ճ|Ճ Minus|-|— Equal|ժ|Ժ
    KeyQ|ք|Ք KeyW|ո|Ո KeyE|ե|Ե KeyR|ռ|Ռ KeyT|տ|Տ KeyY|ը|Ը KeyU|ւ|Ւ KeyI|ի|Ի KeyO|օ|Օ KeyP|պ|Պ BracketLeft|խ|Խ BracketRight|ծ|Ծ Backslash|շ|Շ
    KeyA|ա|Ա KeyS|ս|Ս KeyD|դ|Դ KeyF|ֆ|Ֆ KeyG|գ|Գ KeyH|հ|Հ KeyJ|յ|Յ KeyK|կ|Կ KeyL|լ|Լ Semicolon|;|։ Quote|՛|"
    KeyZ|զ|Զ KeyX|ղ|Ղ KeyC|ց|Ց KeyV|վ|Վ KeyB|բ|Բ KeyN|ն|Ն KeyM|մ|Մ Comma|,|< Period|․|> Slash|/|՞ IntlBackslash|»|«`);
  // AltGr (Ctrl+Alt) в армянской раскладке Windows — цифры и латинская пунктуация
  const hyAlt = L(`Digit1|1|! Digit2|2|@ Digit3|3|# Digit4|4|$ Digit5|5|% Digit6|6|^ Digit7|7|& Digit8|8|* Digit9|9|( Digit0|0|) Minus|-|_ Equal|=|+
    BracketLeft|[|{ BracketRight|]|} Semicolon|;|: Quote|'|" Backquote|\`|~ Comma|,|< Period|.|> Slash|/|?`);
  hyAlt.Backslash = ['\\', '|'];

  const LANGS = {
    en: { short: 'ENG', name: 'English (United States)', kb: 'США', map: enMap },
    ru: { short: 'РУС', name: 'Русский', kb: 'Русская', map: ruMap },
    hy: { short: 'ՀԱՅ', name: 'Հայերեն (Армянский)', kb: 'Армянская фонетическая (Windows)', map: hyMap, alt: hyAlt },
  };
  const em = new Emitter();
  const list = () => (Store.get('kbdLangs') || ['en', 'ru']).filter(l => LANGS[l]);
  let cur = list().includes(Store.get('kbdCur')) ? Store.get('kbdCur') : list()[0];

  function set(l, quiet) {
    if (!LANGS[l] || l === cur) return;
    cur = l;
    Store.set('kbdCur', l);
    em.emit('change', l);
    if (!quiet) osd();
  }
  function next() { const ls = list(); set(ls[(ls.indexOf(cur) + 1) % ls.length]); }

  let osdEl = null, osdT = 0;
  function osd() {
    if (!document.body) return;
    if (!osdEl) { osdEl = h('<div class="kbd-osd"></div>'); document.body.append(osdEl); }
    osdEl.innerHTML = list().map(l => `<div class="${l === cur ? 'on' : ''}"><b>${LANGS[l].short}</b><span>${esc(LANGS[l].name)}</span></div>`).join('');
    osdEl.classList.add('show');
    clearTimeout(osdT);
    osdT = setTimeout(() => osdEl.classList.remove('show'), 1300);
  }

  /** Символ для нажатия на физической клавиатуре в текущем языке ввода (null — не вмешиваться) */
  function translate(e) {
    if (e.isComposing || e.keyCode === 229 || e.metaKey || !e.code) return null;
    const lang = LANGS[cur];
    let m;
    if (e.ctrlKey && e.altKey) { if (!lang.alt) return null; m = lang.alt[e.code]; }
    else if (e.ctrlKey || e.altKey) return null;
    else m = lang.map[e.code];
    if (!m) return null;
    // Верхний регистр: по самому символу (Shift, CapsLock и экранные клавиатуры Android сообщают о нём по-разному)
    let upper = e.shiftKey;
    const k = e.key || '';
    if (k.length === 1 && k.toLowerCase() !== k.toUpperCase()) upper = k !== k.toLowerCase();
    else if (k.length === 1) {
      for (const id in LANGS) {
        const mm = LANGS[id].map[e.code];
        if (mm && k === mm[1] && k !== mm[0]) { upper = true; break; }
        if (mm && k === mm[0]) { upper = false; break; }
      }
    }
    const letter = m[0].toLowerCase() !== m[0].toUpperCase();
    let ch = upper ? m[1] : m[0];
    if (letter && k.length === 1 && k.toLowerCase() !== k.toUpperCase()) ch = upper ? m[1] : m[0];
    if (!ch || ch === e.key) return null;
    return ch;
  }

  /** Вставить символ в поле ввода документа doc (input, textarea, contenteditable) */
  function insert(doc, ch) {
    const a = doc.activeElement;
    if (!a) return false;
    const editable = a.isContentEditable || (a.tagName === 'TEXTAREA') || (a.tagName === 'INPUT' && /^(text|search|url|email|tel|password|number|)$/i.test(a.type || ''));
    if (!editable || a.readOnly || a.disabled) return false;
    if (a.tagName === 'INPUT' && a.type === 'number') return false;
    return doc.execCommand('insertText', false, ch);
  }

  function isHotkey(e) {
    const hk = Store.get('kbdHotkey') || 'alt+shift';
    if ((e.key === 'Shift' && e.altKey && !e.ctrlKey) || (e.key === 'Alt' && e.shiftKey && !e.ctrlKey)) return hk === 'alt+shift' || hk === 'any';
    if ((e.key === 'Shift' && e.ctrlKey && !e.altKey) || (e.key === 'Control' && e.shiftKey && !e.altKey)) return hk === 'ctrl+shift' || hk === 'any';
    if (e.code === 'Space' && e.metaKey) return true;
    return false;
  }

  /** Обработчик keydown для документа doc (оболочка или окно приложения) */
  function onKeyDown(e, doc) {
    if (isHotkey(e)) { e.preventDefault(); next(); return true; }
    const ch = translate(e);
    if (!ch) return false;
    if (insert(doc, ch)) { e.preventDefault(); e.stopImmediatePropagation(); return true; }
    return false;
  }
  document.addEventListener('keydown', e => { if (!e.defaultPrevented) onKeyDown(e, document); }, true);

  // Вместе с клавиатурой Android: язык текущей раскладки системы
  const ANDROID = { en: 'en', ru: 'ru', hy: 'hy', uk: 'ru', be: 'ru' };
  let lastIme = '';
  function pollIme() {
    if (Store.get('kbdFollowAndroid') === false) return;
    const loc = (FX.tryCall('imeLocale') || '').toLowerCase();
    const l = ANDROID[loc.split(/[-_]/)[0]];
    if (loc && loc !== lastIme) {
      lastIme = loc;
      if (l && list().includes(l)) set(l, true);
    }
  }
  if (FX.available) {
    setInterval(() => { if (document.hasFocus()) pollIme(); }, 1500);
    FX.on('resume', pollIme);
    FX.on('ime', d => { lastIme = ''; pollIme(); });
  }

  return {
    LANGS, list, current: () => cur, set, next, translate, insert, onKeyDown,
    on: (e, f) => em.on(e, f),
    setList(ls) { Store.set('kbdLangs', ls.filter(l => LANGS[l])); if (!list().includes(cur)) set(list()[0], true); em.emit('change', cur); },
  };
})();
