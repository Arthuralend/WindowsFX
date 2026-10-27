/* Monomach: service worker. Отдаёт файлы из подключённых папок компьютера (/fs/local/…, /thumb/local/…):
   спрашивает файл у открытой вкладки рабочего стола (только она имеет доступ к папке) и возвращает его
   с поддержкой диапазонов (видео, музыка, PDF). Остальные запросы не трогает. */
'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

function ask(client, path) {
  return new Promise(res => {
    const ch = new MessageChannel();
    const t = setTimeout(() => res(null), 4000);
    ch.port1.onmessage = e => { clearTimeout(t); res(e.data && e.data.blob ? e.data : null); };
    try { client.postMessage({ type: 'mm-local', path }, [ch.port2]); } catch { clearTimeout(t); res(null); }
  });
}

async function getFile(event, path) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // сначала вкладка, сделавшая запрос, затем остальные
  const first = event.clientId ? all.filter(c => c.id === event.clientId) : [];
  const rest = all.filter(c => !first.includes(c));
  for (const c of first) { const r = await ask(c, path); if (r) return r; }
  const rs = await Promise.all(rest.map(c => ask(c, path)));
  return rs.find(Boolean) || null;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json', md: 'text/markdown; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  const m = /^\/(fs|thumb)(\/local\/.*)$/.exec(url.pathname);
  if (!m) return;
  event.respondWith((async () => {
    let path;
    try { path = decodeURIComponent(m[2]); } catch { return new Response('bad path', { status: 400 }); }
    const f = await getFile(event, path);
    if (!f) return new Response('not found', { status: 404 });
    const blob = f.blob;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const type = MIME[(name.split('.').pop() || '').toLowerCase()] || blob.type || 'application/octet-stream';
    const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (url.searchParams.has('download')) h['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
    const range = /^bytes=(\d*)-(\d*)$/.exec(event.request.headers.get('range') || '');
    if (range && blob.size) {
      let start = range[1] === '' ? blob.size - +range[2] : +range[1];
      let end = range[1] === '' || range[2] === '' ? blob.size - 1 : Math.min(+range[2], blob.size - 1);
      if (start < 0) start = 0;
      if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
      return new Response(blob.slice(start, end + 1), { status: 206, headers: { ...h, 'Content-Range': `bytes ${start}-${end}/${blob.size}`, 'Content-Length': String(end - start + 1) } });
    }
    return new Response(blob, { status: 200, headers: { ...h, 'Content-Length': String(blob.size) } });
  })());
});
