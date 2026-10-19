/* WindowsFX: язык интерфейса. Переведённые копии скриптов (js-en/, js-hy/) собираются
   из js/ при сборке (tools/i18n/build.js); index.html подключает нужную копию.
   Этот файл не переводится. */
'use strict';

const I18N = (() => {
  const LANGS = [{ id: 'ru', name: 'Русский' }, { id: 'en', name: 'English' }, { id: 'hy', name: 'Հայերեն' }];
  const lang = () => window.FX_LANG || 'ru';
  function setLang(l) {
    if (!LANGS.some(x => x.id === l) || l === lang()) return;
    Store.set('uiLang', l);
    Store.flush();
    FX.tryCall('setUiLang', l);
    setTimeout(() => location.reload(), 250);
  }
  // Названия системных папок виртуального диска C: (сами папки не переименовываются)
  const FOLDERS = {
    en: { 'Рабочий стол': 'Desktop', 'Документы': 'Documents', 'Загрузки': 'Downloads', 'Изображения': 'Pictures', 'Музыка': 'Music', 'Видео': 'Videos', 'Пользователи': 'Users', 'Игры': 'Games', 'Программы': 'Program Files' },
    hy: { 'Рабочий стол': 'Աշխատասեղան', 'Документы': 'Փաստաթղթեր', 'Загрузки': 'Ներբեռնումներ', 'Изображения': 'Պատկերներ', 'Музыка': 'Երաժշտություն', 'Видео': 'Տեսանյութեր', 'Пользователи': 'Օգտատերեր', 'Игры': 'Խաղեր', 'Программы': 'Ծրագրեր' },
  };
  const name = n => (FOLDERS[lang()] || {})[n] || n;
  const locale = () => ({ ru: 'ru-RU', en: 'en-US', hy: 'hy-AM' })[lang()];
  return { LANGS, lang, setLang, name, locale };
})();
