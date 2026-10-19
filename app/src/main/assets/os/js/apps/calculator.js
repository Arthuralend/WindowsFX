/* Калькулятор */
'use strict';

Apps.register({
  id: 'calculator', name: 'Калькулятор', icon: 'calculator', desc: 'Обычный, инженерный, конвертер',
  keywords: 'калькулятор счёт математика calc',
  launch: args => openCalculator(args),
});

function openCalculator(args = {}) {
  let mode = Persist.get('calc.mode', 'standard');
  let expr = '';           // накопленное выражение (верхняя строка)
  let entry = '0';         // текущий ввод
  let fresh = true;        // следующий ввод цифры заменяет entry
  let justEval = false;
  let deg = true;
  let memory = Persist.get('calc.memory', []);
  let history = Persist.get('calc.history', []);
  let panel = 'history';

  const win = WM.open({ app: 'calculator', title: 'Калькулятор', width: 360, height: 560, minWidth: 320, minHeight: 470 });
  const b = win.body;
  b.classList.add('calc');
  b.innerHTML = `
    <div class="calc-top">
      <button class="icon-btn calc-menu" title="Режим">${Icons.ui('menu', 16)}</button>
      <b class="calc-mode-name"></b>
      <span class="spacer"></span>
      <button class="icon-btn calc-hist-btn" title="Журнал">${Icons.ui('history', 16)}</button>
    </div>
    <div class="calc-wrap">
      <div class="calc-main">
        <div class="calc-display"><div class="calc-expr"></div><div class="calc-entry">0</div></div>
        <div class="calc-mem"></div>
        <div class="calc-keys"></div>
        <div class="calc-conv hidden"></div>
      </div>
      <div class="calc-side hidden">
        <div class="pivot"><button data-p="history">Журнал</button><button data-p="memory">Память</button></div>
        <div class="calc-list"></div>
        <button class="icon-btn calc-clear-list" title="Очистить">${Icons.ui('trash', 16)}</button>
      </div>
    </div>`;
  const exprEl = $('.calc-expr', b), entryEl = $('.calc-entry', b);

  const fmt = v => {
    if (typeof v === 'string') return v;
    const s = MathParser.format(v);
    if (s === 'Ошибка' || s.includes('e') || s.includes('∞')) return s;
    const [i, d] = s.split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d !== undefined ? ',' + d : '');
  };
  const entryNum = () => parseFloat(entry.replace(',', '.'));
  const showExpr = s => s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\./g, ',');

  function render() {
    exprEl.textContent = showExpr(expr);
    let e = entry;
    if (/^-?\d+(\.\d*)?$/.test(e)) { const [i, d] = e.split('.'); e = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d !== undefined ? ',' + d : ''); }
    entryEl.textContent = e;
    const len = e.length;
    entryEl.style.fontSize = len > 18 ? '1.6rem' : len > 13 ? '2.2rem' : '3rem';
    $('.calc-mem', b).innerHTML = ['MC', 'MR', 'M+', 'M−', 'MS'].map(m => `<button data-mem="${m}" ${(m === 'MC' || m === 'MR') && !memory.length ? 'disabled' : ''}>${m}</button>`).join('');
  }

  function error(msg) { entry = msg; fresh = true; justEval = true; expr = ''; render(); }

  function digit(d) {
    if (justEval) { expr = ''; justEval = false; }
    if (fresh || entry === '0' || isNaN(entryNum())) { entry = d === '.' ? '0.' : d; fresh = false; }
    else {
      if (d === '.' && entry.includes('.')) return;
      if (entry.replace(/[-.]/g, '').length >= 16) return;
      entry += d;
    }
    render();
  }

  function op(o) {
    if (isNaN(entryNum())) return;
    if (justEval) { expr = ''; justEval = false; }
    if (fresh && expr && /[+\-*/^]\s*$/.test(expr)) expr = expr.replace(/[+\-*/^]\s*$/, o + ' ');
    else if (fresh && expr.endsWith(')')) expr += ' ' + o + ' ';
    else { expr += num(entry) + ' ' + o + ' '; }
    fresh = true;
    render();
  }
  const num = s => { const n = parseFloat(String(s).replace(',', '.')); return n < 0 ? `(${n})` : String(n); };

  function equals() {
    if (isNaN(entryNum()) && !justEval) return;
    let full = justEval ? expr : expr + (fresh && expr.endsWith(')') ? '' : num(entry));
    if (justEval) return;
    const opens = (full.match(/\(/g) || []).length - (full.match(/\)/g) || []).length;
    full += ')'.repeat(Math.max(0, opens));
    try {
      const v = MathParser.evaluate(full, { deg });
      if (!isFinite(v)) throw new Error(isNaN(v) ? 'Недопустимый ввод' : 'Переполнение');
      history.unshift({ e: showExpr(full) + ' =', r: fmt(v) });
      history = history.slice(0, 50);
      Persist.set('calc.history', history);
      expr = full + ' =';
      entry = MathParser.format(v);
      fresh = true; justEval = true;
      render(); renderSide();
    } catch (e) { error(e.message); }
  }

  function unary(fn, label) {
    const x = entryNum();
    if (isNaN(x)) return;
    try {
      let v;
      const r = deg ? x * Math.PI / 180 : x;
      switch (fn) {
        case 'sqr': v = x * x; break;
        case 'cube': v = x * x * x; break;
        case 'sqrt': if (x < 0) throw new Error('Недопустимый ввод'); v = Math.sqrt(x); break;
        case 'inv': if (x === 0) throw new Error('Деление на ноль невозможно'); v = 1 / x; break;
        case 'neg': entry = entry.startsWith('-') ? entry.slice(1) : (entry === '0' ? '0' : '-' + entry); render(); return;
        case 'pct': {
          const m = expr.match(/(-?[\d.]+)\)?\s*[+\-]\s*$/);
          v = m ? parseFloat(m[1]) * x / 100 : x / 100; break;
        }
        case 'sin': v = Math.sin(r); break;
        case 'cos': v = Math.cos(r); break;
        case 'tan': v = Math.tan(r); break;
        case 'ln': if (x <= 0) throw new Error('Недопустимый ввод'); v = Math.log(x); break;
        case 'log': if (x <= 0) throw new Error('Недопустимый ввод'); v = Math.log10(x); break;
        case 'exp': v = Math.exp(x); break;
        case 'abs': v = Math.abs(x); break;
        case 'fact': v = MathParser.evaluate(`${x}!`); break;
        case 'pow10': v = Math.pow(10, x); break;
      }
      if (justEval) { expr = ''; justEval = false; }
      entry = MathParser.format(v);
      fresh = true;
      render();
    } catch (e) { error(e.message); }
  }

  function paren(p) {
    if (justEval) { expr = ''; justEval = false; }
    if (p === '(') { expr += '( '; fresh = true; }
    else {
      const opens = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
      if (opens <= 0) return;
      expr += num(entry) + ' ) ';
      expr = expr.replace(/\s+\)\s*$/, ')');
      fresh = true;
    }
    render();
  }

  function constant(c) { if (justEval) { expr = ''; justEval = false; } entry = MathParser.format(c === 'pi' ? Math.PI : Math.E); fresh = true; render(); }
  function clearAll() { expr = ''; entry = '0'; fresh = true; justEval = false; render(); }
  function clearEntry() { entry = '0'; fresh = true; if (justEval) { expr = ''; justEval = false; } render(); }
  function backspace() {
    if (fresh || justEval) { if (justEval) { expr = ''; justEval = false; } return; }
    entry = entry.length > 1 && !(entry.length === 2 && entry.startsWith('-')) ? entry.slice(0, -1) : '0';
    if (entry === '0') fresh = true;
    render();
  }

  function memOp(m) {
    const x = entryNum();
    if (m === 'MC') memory = [];
    else if (m === 'MR') { if (memory.length) { entry = String(memory[0]); fresh = true; } }
    else if (m === 'MS') { if (!isNaN(x)) memory.unshift(x); }
    else if (m === 'M+' || m === 'M−') {
      if (isNaN(x)) return;
      if (!memory.length) memory.unshift(0);
      memory[0] = +MathParser.format(memory[0] + (m === 'M+' ? x : -x));
    }
    Persist.set('calc.memory', memory);
    render(); renderSide();
  }

  // ---------- Раскладки клавиш ----------
  const STD = [
    ['%', 'pct', 'fn'], ['CE', 'ce', 'fn'], ['C', 'c', 'fn'], ['⌫', 'bs', 'fn'],
    ['¹⁄ₓ', 'inv', 'fn'], ['x²', 'sqr', 'fn'], ['²√x', 'sqrt', 'fn'], ['÷', '/', 'op'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*', 'op'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-', 'op'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'],
    ['+/−', 'neg'], ['0', '0'], [',', '.'], ['=', '=', 'eq'],
  ];
  const SCI = [
    ['sin', 'sin', 'fn'], ['cos', 'cos', 'fn'], ['tan', 'tan', 'fn'], ['DEG', 'deg', 'fn'], ['C', 'c', 'fn'],
    ['x²', 'sqr', 'fn'], ['x³', 'cube', 'fn'], ['xʸ', '^', 'op'], ['n!', 'fact', 'fn'], ['⌫', 'bs', 'fn'],
    ['²√x', 'sqrt', 'fn'], ['10ˣ', 'pow10', 'fn'], ['log', 'log', 'fn'], ['ln', 'ln', 'fn'], ['÷', '/', 'op'],
    ['π', 'pi', 'fn'], ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*', 'op'],
    ['e', 'e', 'fn'], ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-', 'op'],
    ['(', '(', 'fn'], ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'],
    [')', ')', 'fn'], ['+/−', 'neg'], ['0', '0'], [',', '.'], ['=', '=', 'eq'],
  ];

  function press(k) {
    if (/^[0-9.]$/.test(k)) return digit(k);
    if (['+', '-', '*', '/', '^'].includes(k)) return op(k);
    switch (k) {
      case '=': return equals();
      case 'c': return clearAll();
      case 'ce': return clearEntry();
      case 'bs': return backspace();
      case '(': case ')': return paren(k);
      case 'pi': case 'e': return constant(k);
      case 'deg': deg = !deg; renderKeys(); return;
      default: return unary(k);
    }
  }

  function renderKeys() {
    const keys = $('.calc-keys', b);
    const conv = $('.calc-conv', b);
    const isConv = mode === 'converter';
    keys.classList.toggle('hidden', isConv);
    $('.calc-display', b).classList.toggle('hidden', isConv);
    $('.calc-mem', b).classList.toggle('hidden', isConv);
    conv.classList.toggle('hidden', !isConv);
    $('.calc-mode-name', b).textContent = { standard: 'Обычный', scientific: 'Инженерный', converter: 'Конвертер величин' }[mode];
    if (isConv) return renderConverter();
    const layout = mode === 'scientific' ? SCI : STD;
    keys.className = 'calc-keys ' + (mode === 'scientific' ? 'sci' : 'std');
    keys.innerHTML = '';
    layout.forEach(([label, k, cls]) => {
      const btn = h(`<button class="ck ${cls || 'num'}">${k === 'deg' ? (deg ? 'DEG' : 'RAD') : label}</button>`);
      btn.onclick = () => press(k);
      keys.append(btn);
    });
  }

  // ---------- Конвертер ----------
  const UNITS = {
    'Длина': { 'Миллиметры': 0.001, 'Сантиметры': 0.01, 'Метры': 1, 'Километры': 1000, 'Дюймы': 0.0254, 'Футы': 0.3048, 'Ярды': 0.9144, 'Мили': 1609.344 },
    'Масса': { 'Граммы': 0.001, 'Килограммы': 1, 'Тонны': 1000, 'Унции': 0.0283495, 'Фунты': 0.453592 },
    'Площадь': { 'Кв. метры': 1, 'Гектары': 10000, 'Кв. километры': 1e6, 'Акры': 4046.86, 'Кв. футы': 0.092903 },
    'Объём': { 'Миллилитры': 0.001, 'Литры': 1, 'Куб. метры': 1000, 'Галлоны (США)': 3.78541, 'Чашки': 0.24 },
    'Скорость': { 'м/с': 1, 'км/ч': 1 / 3.6, 'мили/ч': 0.44704, 'Узлы': 0.514444 },
    'Время': { 'Секунды': 1, 'Минуты': 60, 'Часы': 3600, 'Дни': 86400, 'Недели': 604800, 'Годы': 31557600 },
    'Данные': { 'Байты': 1, 'Килобайты': 1024, 'Мегабайты': 1048576, 'Гигабайты': 1073741824, 'Терабайты': 1099511627776 },
    'Температура': { 'Цельсий': 'C', 'Фаренгейт': 'F', 'Кельвин': 'K' },
  };
  let convCat = 'Длина';
  function renderConverter() {
    const conv = $('.calc-conv', b);
    const units = Object.keys(UNITS[convCat]);
    const st = Persist.get('calc.conv', {});
    conv.innerHTML = `
      <select class="input cv-cat">${Object.keys(UNITS).map(c => `<option ${c === convCat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <input class="input cv-a" type="number" value="${st.v ?? 1}">
      <select class="input cv-ua">${units.map((u, i) => `<option ${i === 2 % units.length ? 'selected' : ''}>${u}</option>`).join('')}</select>
      <div class="cv-eq">=</div>
      <div class="cv-b"></div>
      <select class="input cv-ub">${units.map((u, i) => `<option ${i === 3 % units.length ? 'selected' : ''}>${u}</option>`).join('')}</select>
      <button class="btn cv-swap">${Icons.ui('sort', 14)} Поменять местами</button>`;
    const calc = () => {
      const v = parseFloat($('.cv-a', conv).value);
      const ua = $('.cv-ua', conv).value, ub = $('.cv-ub', conv).value;
      let r;
      if (isNaN(v)) r = '—';
      else if (convCat === 'Температура') {
        const c = ua === 'Цельсий' ? v : ua === 'Фаренгейт' ? (v - 32) * 5 / 9 : v - 273.15;
        r = ub === 'Цельсий' ? c : ub === 'Фаренгейт' ? c * 9 / 5 + 32 : c + 273.15;
      } else r = v * UNITS[convCat][ua] / UNITS[convCat][ub];
      $('.cv-b', conv).textContent = typeof r === 'number' ? fmt(r) : r;
      Persist.set('calc.conv', { v: $('.cv-a', conv).value });
    };
    $('.cv-cat', conv).onchange = e => { convCat = e.target.value; renderConverter(); };
    $('.cv-a', conv).oninput = calc;
    $('.cv-ua', conv).onchange = calc;
    $('.cv-ub', conv).onchange = calc;
    $('.cv-swap', conv).onclick = () => { const a = $('.cv-ua', conv), c = $('.cv-ub', conv); [a.value, c.value] = [c.value, a.value]; calc(); };
    calc();
  }

  // ---------- Журнал и память ----------
  function renderSide() {
    const list = $('.calc-list', b);
    $$('.calc-side .pivot button', b).forEach(x => x.classList.toggle('on', x.dataset.p === panel));
    const items = panel === 'history' ? history : memory;
    list.innerHTML = items.length ? '' : `<div class="muted small" style="padding:12px">${panel === 'history' ? 'Журнал пока пуст' : 'В памяти ничего не сохранено'}</div>`;
    items.forEach((it, i) => {
      const r = panel === 'history'
        ? h(`<div class="calc-li"><span class="muted small">${esc(it.e)}</span><b>${esc(it.r)}</b></div>`)
        : h(`<div class="calc-li"><b>${esc(fmt(it))}</b><span class="row-gap calc-mbtns"><button class="btn sm" data-a="mc">MC</button><button class="btn sm" data-a="m+">M+</button><button class="btn sm" data-a="m-">M−</button></span></div>`);
      r.onclick = e => {
        const a = e.target.dataset.a;
        if (a) {
          e.stopPropagation();
          if (a === 'mc') memory.splice(i, 1);
          else { const x = entryNum(); if (!isNaN(x)) memory[i] = +MathParser.format(memory[i] + (a === 'm+' ? x : -x)); }
          Persist.set('calc.memory', memory); render(); renderSide(); return;
        }
        entry = panel === 'history' ? it.r.replace(/\s/g, '').replace(',', '.') : String(it);
        fresh = true; justEval = false; expr = ''; render();
      };
      list.append(r);
    });
  }
  $$('.calc-side .pivot button', b).forEach(x => x.onclick = () => { panel = x.dataset.p; renderSide(); });
  $('.calc-clear-list', b).onclick = () => {
    if (panel === 'history') { history = []; Persist.set('calc.history', []); } else { memory = []; Persist.set('calc.memory', []); }
    render(); renderSide();
  };
  $('.calc-hist-btn', b).onclick = () => { $('.calc-side', b).classList.toggle('hidden'); renderSide(); if (!$('.calc-side', b).classList.contains('hidden') && win.bounds.w < 560) win.setBounds({ w: 600 }, true); };
  $('.calc-mem', b).addEventListener('click', e => { const m = e.target.dataset.mem; if (m) memOp(m); });
  $('.calc-menu', b).onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const set = m => { mode = m; Persist.set('calc.mode', m); renderKeys(); if (m === 'scientific' && win.bounds.w < 420) win.setBounds({ w: 440, h: Math.max(win.bounds.h, 600) }, true); };
    UI.menu(r.left, r.bottom + 4, [
      { header: 'Калькулятор' },
      { label: 'Обычный', checked: mode === 'standard', action: () => set('standard') },
      { label: 'Инженерный', checked: mode === 'scientific', action: () => set('scientific') },
      { header: 'Конвертер' },
      { label: 'Конвертер величин', checked: mode === 'converter', action: () => set('converter') },
    ]);
  };

  // Клавиатура
  win.el.addEventListener('keydown', e => {
    if (e.target.closest('input, select')) return;
    const k = e.key;
    let handled = true;
    if (/^[0-9]$/.test(k)) digit(k);
    else if (k === '.' || k === ',') digit('.');
    else if (['+', '-', '*', '/', '^'].includes(k)) op(k);
    else if (k === 'Enter' || k === '=') equals();
    else if (k === 'Backspace') backspace();
    else if (k === 'Escape') clearAll();
    else if (k === 'Delete') clearEntry();
    else if (k === '%') unary('pct');
    else if (k === '(' || k === ')') paren(k);
    else if (e.ctrlKey && e.code === 'KeyC') { navigator.clipboard?.writeText(entry); }
    else if (e.ctrlKey && e.code === 'KeyV') { navigator.clipboard?.readText().then(t => { const v = parseFloat(t.replace(/\s/g, '').replace(',', '.')); if (!isNaN(v)) { entry = String(v); fresh = true; render(); } }).catch(() => {}); }
    else handled = false;
    if (handled) {
      e.preventDefault();
      const btn = $$('.ck', b).find(x => x.textContent === k || (k === 'Enter' && x.textContent === '=') || (k === '*' && x.textContent === '×') || (k === '/' && x.textContent === '÷') || (k === '-' && x.textContent === '−'));
      if (btn) { btn.classList.add('press'); setTimeout(() => btn.classList.remove('press'), 100); }
    }
  });

  renderKeys();
  render();
  if (args.expr) {
    try { const v = MathParser.evaluate(args.expr); expr = args.expr + ' ='; entry = MathParser.format(v); fresh = true; justEval = true; render(); } catch {}
  }
  win.onArgs = a => { if (a.expr) { try { const v = MathParser.evaluate(a.expr); expr = a.expr + ' ='; entry = MathParser.format(v); fresh = true; justEval = true; render(); } catch {} } };
  win.el.tabIndex = -1;
  setTimeout(() => win.el.focus(), 50);
  return win;
}
