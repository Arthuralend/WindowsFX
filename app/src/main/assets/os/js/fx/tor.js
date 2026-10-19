/* WindowsFX: режим Tor для браузера (демон Tor внутри приложения, весь трафик WebView через него) */
'use strict';

const TorMode = (() => {
  const em = new Emitter();
  let st = { status: 'OFF', progress: 0 };
  const available = () => !!(window.FXNative && window.FXNative.torStart);
  FX.on('tor', d => {
    const was = st.status;
    st = { ...st, ...d };
    em.emit('change', st);
    if (d.error) UI.notify({ title: 'Tor', body: d.error, icon: 'tor', app: 'torbrowser' });
    if (was !== 'ON' && st.status === 'ON') UI.notify({ title: 'Подключено к сети Tor', body: 'Сайты видят адрес узла Tor, адреса .onion открываются', icon: 'tor', app: 'torbrowser', transient: true, silent: true });
    if (d.newnym) UI.notify({ title: 'Новая личность Tor', body: 'Цепочка узлов сменена, файлы cookie удалены', icon: 'tor', app: 'torbrowser', transient: true, silent: true });
  });
  return {
    available,
    state: () => st,
    on: (e, f) => em.on(e, f),
    start() { if (!available()) { UI.alert('Tor', 'Режим Tor работает в приложении WindowsFX на Android.', 'info'); return false; } FX.call('torStart'); st = { ...st, status: st.status === 'ON' ? 'ON' : 'STARTING' }; em.emit('change', st); return true; },
    stop() { if (available()) FX.call('torStop'); st = { status: 'OFF', progress: 0 }; em.emit('change', st); },
    newIdentity() { if (available()) FX.call('torNewnym'); },
    isOn: () => st.status === 'ON',
    active: () => st.status === 'ON' || st.status === 'STARTING',
  };
})();

Apps.register({
  id: 'torbrowser', name: 'Браузер Tor', icon: 'tor', desc: 'Анонимный просмотр через сеть Tor, сайты .onion', network: true,
  keywords: 'tor тор анонимный onion луковица приватный браузер vpn',
  launch: args => { TorMode.start(); return Apps.launch('browser', { ...args, tor: true }); },
});
