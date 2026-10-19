/* Общие утилиты */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Создаёт DOM-элемент из HTML-строки */
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let __uidSeq = 0;
function uid(prefix = 'id') {
  return prefix + Date.now().toString(36) + (++__uidSeq).toString(36) + Math.random().toString(36).slice(2, 6);
}

class Emitter {
  constructor() { this._h = {}; }
  on(evt, fn) {
    (this._h[evt] ||= new Set()).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this._h[evt]?.delete(fn); }
  emit(evt, ...args) {
    this._h[evt]?.forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } });
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function throttle(fn, ms) {
  let last = 0, t;
  return (...a) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); }
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function fmtBytes(b) {
  if (b < 1024) return b + ' Б';
  const u = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return (b < 10 ? b.toFixed(1) : Math.round(b)).toString().replace('.', ',') + ' ' + u[i];
}

const pad2 = n => String(n).padStart(2, '0');

function fmtTime(ts, seconds = false) {
  const d = new Date(ts);
  const h24 = Store.get('clock24');
  let hh = d.getHours();
  let suffix = '';
  if (!h24) { suffix = hh < 12 ? ' AM' : ' PM'; hh = hh % 12 || 12; }
  return (h24 ? pad2(hh) : hh) + ':' + pad2(d.getMinutes()) + (seconds ? ':' + pad2(d.getSeconds()) : '') + suffix;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
}

function fmtDateTime(ts) { return fmtDate(ts) + ' ' + fmtTime(ts); }

function fmtDateLong(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' ' + plural(m, 'минуту', 'минуты', 'минут') + ' назад';
  const hh = Math.round(m / 60);
  if (hh < 24) return hh + ' ' + plural(hh, 'час', 'часа', 'часов') + ' назад';
  const d = Math.round(hh / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
  return fmtDate(ts);
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function dateKey(d) {
  d = new Date(d);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function readFileAs(file, as = 'dataURL') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    if (as === 'text') r.readAsText(file); else r.readAsDataURL(file);
  });
}

function dataURLtoBlob(url) {
  const [head, data] = url.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  if (head.includes(';base64')) {
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}

function downloadBlob(name, data, mime = 'text/plain;charset=utf-8') {
  let blob = data;
  if (typeof data === 'string') blob = data.startsWith('data:') ? dataURLtoBlob(data) : new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Уменьшает изображение (dataURL) до maxW по ширине, возвращает JPEG/PNG dataURL */
function downscaleImage(url, maxW = 1920, type = 'image/jpeg', q = 0.86) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL(type, q));
    };
    img.onerror = () => res(url);
    img.src = url;
  });
}

/** Долговременное хранилище данных приложений */
const Persist = {
  get(key, def) {
    try {
      const v = localStorage.getItem('w12.' + key);
      return v === null ? (typeof def === 'function' ? def() : def) : JSON.parse(v);
    } catch { return typeof def === 'function' ? def() : def; }
  },
  set(key, val) {
    try { localStorage.setItem('w12.' + key, JSON.stringify(val)); return true; }
    catch (e) {
      console.warn('Persist error', e);
      if (typeof UI !== 'undefined') UI.notify({ title: 'Недостаточно места', body: 'Не удалось сохранить данные: хранилище браузера заполнено.', icon: 'settings' });
      return false;
    }
  },
  remove(key) { localStorage.removeItem('w12.' + key); },
};

/** Безопасный вычислитель математических выражений (без eval) */
const MathParser = (() => {
  const FUNCS = {
    sin: 1, cos: 1, tan: 1, tg: 1, asin: 1, acos: 1, atan: 1, sqrt: 1, cbrt: 1, ln: 1, log: 1, lg: 1,
    abs: 1, exp: 1, floor: 1, ceil: 1, round: 1, sinh: 1, cosh: 1, tanh: 1,
  };
  function tokenize(s) {
    s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        if (s[j] === 'e' && /[0-9+-]/.test(s[j + 1] || '') && !/[a-z]/i.test(s[j + 1])) {
          j++;
          if (s[j] === '+' || s[j] === '-') j++;
          while (j < s.length && /[0-9]/.test(s[j])) j++;
        }
        const num = parseFloat(s.slice(i, j));
        if (isNaN(num)) throw new Error('Неверное число');
        toks.push({ t: 'n', v: num });
        i = j; continue;
      }
      if (/[a-zа-я]/i.test(c)) {
        let j = i;
        while (j < s.length && /[a-zа-я0-9]/i.test(s[j])) j++;
        toks.push({ t: 'id', v: s.slice(i, j).toLowerCase() });
        i = j; continue;
      }
      if ('+-*/^()!%'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('Неизвестный символ: ' + c);
    }
    return toks;
  }
  function fact(n) {
    if (n < 0 || !Number.isInteger(n)) throw new Error('Факториал определён для целых ≥ 0');
    if (n > 170) return Infinity;
    let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
  }
  function evaluate(str, opts = {}) {
    const deg = !!opts.deg;
    const toks = tokenize(str);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const toRad = x => deg ? x * Math.PI / 180 : x;
    const fromRad = x => deg ? x * 180 / Math.PI : x;
    function expr() {
      let v = term();
      while (isOp('+') || isOp('-')) { const o = toks[p++].v; const r = term(); v = o === '+' ? v + r : v - r; }
      return v;
    }
    function term() {
      let v = factor();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const o = toks[p++].v; const r = factor();
          if (o === '/' && r === 0) throw new Error('Деление на ноль невозможно');
          v = o === '*' ? v * r : v / r;
        } else if (peek() && (peek().t === 'n' || peek().t === 'id' || isOp('('))) {
          v = v * factor(); // неявное умножение: 2pi, 3(4)
        } else break;
      }
      return v;
    }
    function factor() {
      const b = unary();
      if (isOp('^')) { p++; return Math.pow(b, factor()); }
      return b;
    }
    function unary() {
      if (isOp('-')) { p++; return -unary(); }
      if (isOp('+')) { p++; return unary(); }
      return postfix();
    }
    function postfix() {
      let v = primary();
      for (;;) {
        if (isOp('!')) { p++; v = fact(v); }
        else if (isOp('%')) { p++; v = v / 100; }
        else break;
      }
      return v;
    }
    function primary() {
      const tk = toks[p++];
      if (!tk) throw new Error('Неполное выражение');
      if (tk.t === 'n') return tk.v;
      if (tk.t === 'op' && tk.v === '(') {
        const v = expr();
        if (!isOp(')')) throw new Error('Ожидалась «)»');
        p++; return v;
      }
      if (tk.t === 'id') {
        if (tk.v === 'pi' || tk.v === 'пи') return Math.PI;
        if (tk.v === 'e') return Math.E;
        if (FUNCS[tk.v]) {
          let arg;
          if (isOp('(')) { p++; arg = expr(); if (!isOp(')')) throw new Error('Ожидалась «)»'); p++; }
          else arg = unary();
          switch (tk.v) {
            case 'sin': return Math.sin(toRad(arg));
            case 'cos': return Math.cos(toRad(arg));
            case 'tan': case 'tg': return Math.tan(toRad(arg));
            case 'asin': return fromRad(Math.asin(arg));
            case 'acos': return fromRad(Math.acos(arg));
            case 'atan': return fromRad(Math.atan(arg));
            case 'sinh': return Math.sinh(arg);
            case 'cosh': return Math.cosh(arg);
            case 'tanh': return Math.tanh(arg);
            case 'sqrt': if (arg < 0) throw new Error('Недопустимый ввод'); return Math.sqrt(arg);
            case 'cbrt': return Math.cbrt(arg);
            case 'ln': if (arg <= 0) throw new Error('Недопустимый ввод'); return Math.log(arg);
            case 'log': case 'lg': if (arg <= 0) throw new Error('Недопустимый ввод'); return Math.log10(arg);
            case 'abs': return Math.abs(arg);
            case 'exp': return Math.exp(arg);
            case 'floor': return Math.floor(arg);
            case 'ceil': return Math.ceil(arg);
            case 'round': return Math.round(arg);
          }
        }
        throw new Error('Неизвестная функция: ' + tk.v);
      }
      throw new Error('Синтаксическая ошибка');
    }
    const v = expr();
    if (p < toks.length) throw new Error('Синтаксическая ошибка');
    return v;
  }
  function format(v) {
    if (!isFinite(v)) return isNaN(v) ? 'Ошибка' : (v > 0 ? '∞' : '-∞');
    if (Math.abs(v) >= 1e16 || (Math.abs(v) < 1e-10 && v !== 0)) return v.toExponential(10).replace(/\.?0+e/, 'e');
    return String(parseFloat(v.toPrecision(15)));
  }
  return { evaluate, format };
})();

/** Обновляет заливку ползунка .slider */
function fillSlider(el) {
  const min = +el.min || 0, max = +el.max || 100;
  el.style.setProperty('--val', ((el.value - min) / (max - min) * 100) + '%');
}
document.addEventListener('input', e => { if (e.target.matches?.('input.slider')) fillSlider(e.target); }, true);
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches('input.slider')) fillSlider(n);
    n.querySelectorAll?.('input.slider').forEach(fillSlider);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

/** HTML переключателя */
function toggleHTML(cls, checked, label = true) {
  return `<label class="toggle ${cls}"><input type="checkbox" ${checked ? 'checked' : ''}><span class="track"></span>${label ? `<span class="tlabel">${checked ? 'Вкл.' : 'Откл.'}</span>` : ''}</label>`;
}
document.addEventListener('change', e => {
  const t = e.target.closest?.('.toggle');
  if (t && e.target.type === 'checkbox') { const l = t.querySelector('.tlabel'); if (l) l.textContent = e.target.checked ? 'Вкл.' : 'Откл.'; }
}, true);
