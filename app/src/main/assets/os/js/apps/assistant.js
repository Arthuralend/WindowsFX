/* Ассистент: локальный помощник, понимающий команды на русском */
'use strict';

Apps.register({
  id: 'assistant', name: 'Ассистент', icon: 'assistant', desc: 'Умный помощник WindowsFX', single: true,
  keywords: 'ассистент помощник ai ии copilot чат',
  launch: () => openAssistant(),
});

function openAssistant() {
  const a = WM.area();
  const win = WM.open({ app: 'assistant', title: 'Ассистент', width: 420, height: Math.min(680, a.h - 40), x: a.w - 440, y: 20, minWidth: 340, minHeight: 400, remember: false });
  const b = win.body;
  b.classList.add('as');
  b.innerHTML = `<div class="as-log"></div>
    <div class="as-chips"></div>
    <form class="as-form"><input class="input" placeholder="Спросите или попросите что-нибудь…" spellcheck="false"><button class="icon-btn as-send" type="submit">${Icons.ui('send', 16)}</button></form>`;
  const log = $('.as-log', b), inp = $('.as-form input', b);

  function say(html, who = 'bot') {
    const m = h(`<div class="as-msg ${who}">${who === 'bot' ? `<span class="as-av">${Icons.get('assistant', 20)}</span>` : ''}<div class="as-bubble"></div></div>`);
    log.append(m);
    const bub = $('.as-bubble', m);
    if (who === 'bot' && Store.get('animations')) {
      bub.innerHTML = '<span class="as-typing"><i></i><i></i><i></i></span>';
      setTimeout(() => { bub.innerHTML = html; log.scrollTop = log.scrollHeight; }, 450);
    } else bub.innerHTML = html;
    log.scrollTop = log.scrollHeight;
    return bub;
  }

  const APPS = [['проводник', 'explorer'], ['файлы', 'explorer'], ['параметры', 'settings'], ['настройки', 'settings'], ['браузер', 'browser'], ['интернет', 'browser'], ['блокнот', 'notepad'], ['калькулятор', 'calculator'], ['paint', 'paint'], ['пэинт', 'paint'], ['рисовалк', 'paint'], ['терминал', 'terminal'], ['консол', 'terminal'], ['диспетчер', 'taskmgr'], ['фото', 'photos'], ['музык', 'music'], ['плеер', 'music'], ['часы', 'clock'], ['будильник', 'clock'], ['календар', 'calendar'], ['погод', 'weather'], ['сап', 'minesweeper'], ['2048', 'game2048'], ['doom', 'doom'], ['дум', 'doom'], ['камер', 'camera']];
  const findApp = t => APPS.find(([k]) => t.includes(k))?.[1];

  async function answer(text) {
    const t = text.toLowerCase().replace(/ё/g, 'е').trim();
    let m;
    // Секретная команда: вторжение демонов
    if (/doom\s*-?\s*mod|дум\s*-?\s*мод/.test(t)) {
      if (DoomMod.active()) return say('Вторжение уже идёт! Стреляйте! 🔥');
      say('<b style="color:#ff4a3a">КРИТИЧЕСКАЯ ОШИБКА 0x666</b><br>Обнаружен разлом в ядре системы… Я не могу его закрыть. Берите дробовик. 😱');
      setTimeout(() => DoomMod.start(), 1400);
      return;
    }
    if (/^(привет|здравствуй|добрый|хай|hello|hi)/.test(t)) return say(`Привет, ${esc(Store.get('userName'))}! 👋 Чем могу помочь?`);
    if (/что (ты )?умеешь|помощь|help|команды/.test(t)) return say(`Я умею:<ul><li>открывать приложения — «открой калькулятор»</li><li>менять тему, обои и цвет — «тёмная тема», «смени обои», «сделай акцент зелёным»</li><li>ставить таймеры и напоминания — «таймер на 5 минут», «напомни через 10 минут позвонить»</li><li>считать — «посчитай 15% от 2400» или просто «2^10»</li><li>отвечать про время, дату и погоду</li><li>создавать заметки — «создай заметку купить молоко»</li><li>управлять системой — «выключи wifi», «громкость 30», «заблокируй»</li></ul>`);
    if ((m = t.match(/(открой|запусти|включи|покажи)\s+(.+)/)) && findApp(m[2])) { const id = findApp(m[2]); Apps.launch(id); return say(`Открываю «${esc(Apps.get(id).name)}» ✨`); }
    if (/темн(ую|ая|ой)? тем|ночн(ой|ая) режим/.test(t)) { Store.set('theme', 'dark'); return say('Включила тёмную тему 🌙'); }
    if (/светл(ую|ая|ой)? тем/.test(t)) { Store.set('theme', 'light'); return say('Включила светлую тему ☀️'); }
    if (/обои|фон/.test(t)) {
      const ids = Object.keys(Desktop.WALLPAPERS).filter(x => x !== Store.get('wallpaper'));
      const id = ids[Math.floor(Math.random() * ids.length)];
      Store.set('wallpaper', id);
      return say(`Поставила обои «${esc(Desktop.WALLPAPERS[id].name)}». Нравится? Скажите «смени обои» ещё раз для другого варианта.`);
    }
    const COLORS = { красн: '#e81123', оранж: '#ff8c00', желт: '#ffb900', зелен: '#10893e', бирюз: '#00b7c3', голуб: '#0099bc', син: '#4f8cff', фиолет: '#8764b8', розов: '#e3008c', сер: '#68768a' };
    if (/акцент|цвет/.test(t)) { const c = Object.entries(COLORS).find(([k]) => t.includes(k)); if (c) { Store.set('accent', c[1]); return say(`Готово — цвет акцента изменён <span class="st-swatch" style="background:${c[1]};display:inline-block;vertical-align:middle"></span>`); } }
    if ((m = t.match(/таймер.*?(\d+)\s*(сек|мин|час)/))) {
      const ms = +m[1] * (m[2].startsWith('сек') ? 1e3 : m[2].startsWith('мин') ? 60e3 : 3600e3);
      ClockService.addTimer(ms, `Таймер на ${m[1]} ${m[2]}`);
      return say(`Таймер на ${m[1]} ${m[2]}. запущен ⏱ Я сообщу, когда время выйдет.`);
    }
    if ((m = t.match(/напомни.*?через\s+(\d+)\s*(сек|мин|час)\w*\s*(.*)/))) {
      const ms = +m[1] * (m[2].startsWith('сек') ? 1e3 : m[2].startsWith('мин') ? 60e3 : 3600e3);
      const what = text.split(/(сек|мин|час)\w*/i).pop().trim() || 'Напоминание';
      ClockService.addTimer(ms, what);
      return say(`Хорошо, напомню через ${m[1]} ${m[2]}.: «${esc(what)}» 🔔`);
    }
    if (/котор(ый)? час|сколько (сейчас )?времени|время\??$/.test(t)) return say(`Сейчас <b>${fmtTime(Date.now())}</b>`);
    if (/како[ея] (сегодня )?(число|дата|день)|сегодня/.test(t)) return say(`Сегодня ${esc(fmtDateLong(Date.now()))}`);
    if (/погод/.test(t)) {
      try {
        const d = await Weather.load();
        return say(`${Weather.icon(d.current.code, d.current.isDay, 40)}<br>В городе ${esc(d.place.name)} сейчас <b>${Weather.temp(d.current.temp)}</b>, ${esc(Weather.desc(d.current.code).toLowerCase())}. Ощущается как ${Weather.temp(d.current.feels)}, ветер ${Math.round(d.current.wind)} м/с.`);
      } catch (e) { return say('Не удалось получить погоду: ' + esc(e.message)); }
    }
    if ((m = text.match(/(?:создай|запиши|сохрани)\s+заметку[:\s]*(.+)/i))) {
      const p = FS.write(FS.P.docs + '/' + FS.unique(FS.P.docs, 'Заметка.txt'), m[1] + '\n');
      const bub = say(`Создала заметку в «Документах» 📝 <button class="btn sm">Открыть</button>`);
      setTimeout(() => $('button', bub)?.addEventListener('click', () => FileOps.open(p)), 500);
      return;
    }
    if ((m = t.match(/громкост\w*\s*(на\s*)?(\d+)/))) { Store.set('volume', clamp(+m[2], 0, 100)); Store.set('muted', false); return say(`Громкость: ${Store.get('volume')}% 🔊`); }
    if ((m = t.match(/яркост\w*\s*(на\s*)?(\d+)/))) { Store.set('brightness', clamp(+m[2], 20, 100)); return say(`Яркость: ${Store.get('brightness')}%`); }
    if (/(выключи|отключи).*(wi-?fi|вай|интернет)/.test(t)) { Store.set('wifi', false); return say('Wi-Fi отключён.'); }
    if (/(включи).*(wi-?fi|вай|интернет)/.test(t)) { Store.set('wifi', true); Store.set('airplane', false); return say('Wi-Fi включён.'); }
    if (/не беспокоить/.test(t)) { Store.set('dnd', !/выключи|отключи/.test(t)); return say(Store.get('dnd') ? 'Режим «Не беспокоить» включён 🔕' : 'Режим «Не беспокоить» выключен.'); }
    if (/ночной свет/.test(t)) { Store.set('nightLight', !/выключи|отключи/.test(t)); return say(Store.get('nightLight') ? 'Ночной свет включён.' : 'Ночной свет выключен.'); }
    if (/заблокируй|блокировк/.test(t)) { say('Блокирую компьютер 🔒'); setTimeout(() => Power.lock(), 900); return; }
    if (/сверни (все|всё)|покажи рабочий стол/.test(t)) { WM.toggleDesktop(); return say('Готово.'); }
    if ((m = t.match(/(?:найди|поищи)\s+(?:файл\s+)?(.+)/))) {
      const res = FS.search(FS.P.home, m[1], 6);
      if (!res.length) { const bub = say(`Файлов «${esc(m[1])}» не нашла. <button class="btn sm">Искать в Интернете</button>`); setTimeout(() => $('button', bub)?.addEventListener('click', () => Apps.launch('browser', { search: m[1] })), 500); return; }
      const bub = say('Вот что нашлось:<div class="as-files">' + res.map((r, i) => `<button class="btn sm" data-i="${i}">${esc(r.name)}</button>`).join('') + '</div>');
      setTimeout(() => $$('[data-i]', bub).forEach(x => x.onclick = () => FileOps.open(res[+x.dataset.i].path)), 500);
      return;
    }
    if ((m = t.match(/(?:посчитай|сколько будет|вычисли)\s+(.+)/)) || /^[\d\s+\-*/×÷^().,%!]+$/.test(t)) {
      let expr = (m ? m[1] : t).replace(/(\d+(?:[.,]\d+)?)\s*% от\s*(\d+(?:[.,]\d+)?)/, '($1/100)*$2').replace(/умножить на|x/g, '*').replace(/разделить на/g, '/').replace(/плюс/g, '+').replace(/минус/g, '-').replace(/\?/g, '');
      try { return say(`${esc(expr)} = <b>${MathParser.format(MathParser.evaluate(expr))}</b>`); } catch {}
    }
    if (/шутк|анекдот/.test(t)) {
      const j = ['Почему программисты путают Хэллоуин и Рождество? Потому что 31 OCT = 25 DEC.', 'Компьютер, у которого всё работает с первого раза, — это компьютер, который ещё не включали.', 'Я бы рассказала шутку про UDP, но не уверена, что она до вас дойдёт.'];
      return say(j[Math.floor(Math.random() * j.length)] + ' 😄');
    }
    if (/спасибо|благодар/.test(t)) return say('Всегда пожалуйста! 💙');
    if (/как дела|как ты/.test(t)) return say('Отлично! Все системы работают нормально 😊 А у вас?');
    if (/кто ты|как тебя зовут/.test(t)) return say('Я — Ассистент WindowsFX. Работаю прямо на вашем компьютере и помогаю управлять системой.');
    if (findApp(t)) { const id = findApp(t); Apps.launch(id); return say(`Открываю «${esc(Apps.get(id).name)}».`); }
    const bub = say(`Пока не знаю, как ответить на это 🤔 <button class="btn sm">Искать в Интернете</button>`);
    setTimeout(() => $('button', bub)?.addEventListener('click', () => Apps.launch('browser', { search: text })), 500);
  }

  const chips = ['Что ты умеешь?', 'Какая погода?', 'Смени обои', 'Таймер на 5 минут', 'Тёмная тема', 'Посчитай 15% от 2400'];
  chips.forEach(c => { const x = h(`<button class="as-chip">${esc(c)}</button>`); x.onclick = () => send(c); $('.as-chips', b).append(x); });
  function send(text) { if (!text.trim()) return; say(esc(text), 'me'); setTimeout(() => answer(text), 300); }
  $('.as-form', b).onsubmit = e => { e.preventDefault(); send(inp.value); inp.value = ''; };
  say(`Привет, ${esc(Store.get('userName'))}! Я ваш Ассистент ✨<br>Могу открыть приложения, поменять оформление, поставить таймер, посчитать или рассказать о погоде.`);
  setTimeout(() => inp.focus(), 100);
  return win;
}
