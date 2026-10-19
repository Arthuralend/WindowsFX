/* Камера */
'use strict';

Apps.register({
  id: 'camera', name: 'Камера', icon: 'camera', desc: 'Фото с веб-камеры', single: true,
  keywords: 'камера фото вебкамера снимок',
  launch: args => openCamera(args),
});

function openCamera(args = {}) {
  const win = WM.open({ app: 'camera', title: 'Камера', width: 760, height: 560, minWidth: 400, minHeight: 320 });
  const b = win.body;
  b.classList.add('cam');
  let stream = null, avatarMode = !!args.avatar;
  b.innerHTML = `<div class="cam-stage"><video autoplay playsinline muted></video><div class="cam-msg"><div class="ring-loader"></div>Подключение к камере…</div><div class="cam-flash"></div></div>
    <div class="cam-bar"><div class="cam-last"></div><button class="cam-shot" title="Сделать снимок"></button><span class="muted small cam-hint">${avatarMode ? 'Снимок станет фото профиля' : 'Снимки сохраняются в «Изображения»'}</span></div>`;
  const video = $('video', b);
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      video.srcObject = stream;
      $('.cam-msg', b).remove();
    } catch (e) {
      $('.cam-msg', b).innerHTML = `${Icons.ui('camera', 48)}<b>Камера недоступна</b><span class="muted">${e.name === 'NotAllowedError' ? 'Доступ к камере запрещён в браузере.' : 'Камера не найдена или занята другим приложением.'}</span>`;
    }
  })();
  $('.cam-shot', b).onclick = async () => {
    if (!stream) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1);
    g.drawImage(video, 0, 0);
    Sound.play('shutter', true);
    $('.cam-flash', b).classList.remove('go'); void b.offsetWidth; $('.cam-flash', b).classList.add('go');
    const url = c.toDataURL('image/jpeg', 0.85);
    if (avatarMode) {
      Store.set('avatar', await downscaleImage(url, 256));
      UI.notify({ title: 'Фото профиля обновлено', icon: 'user', silent: true });
      avatarMode = false;
      $('.cam-hint', b).textContent = 'Снимки сохраняются в «Изображения»';
      return;
    }
    const d = new Date();
    const name = `Снимок ${dateKey(d)} ${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}.jpg`;
    const p = FS.write(FS.P.pictures + '/' + FS.unique(FS.P.pictures, name), await downscaleImage(url, 1280));
    const last = $('.cam-last', b);
    last.style.backgroundImage = `url('${url}')`;
    last.onclick = () => FileOps.open(p);
  };
  win.onArgs = a => { if (a.avatar) { avatarMode = true; $('.cam-hint', b).textContent = 'Снимок станет фото профиля'; } };
  win.onClose = () => stream?.getTracks().forEach(t => t.stop());
  return win;
}
