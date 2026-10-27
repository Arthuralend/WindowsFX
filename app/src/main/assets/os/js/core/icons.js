/* Набор иконок: цветные иконки приложений/файлов и монохромные системные глифы */
'use strict';

const Icons = (() => {
  const grads = {
    blue: ['#6cc0ff', '#2f6bff'],
    yellow: ['#ffe08a', '#f7b733'],
    folderback: ['#f2b53a', '#d98e0c'],
    purple: ['#c3a1ff', '#6d4bff'],
    green: ['#6ff0ad', '#0ea56a'],
    red: ['#ff9a8a', '#e5484d'],
    orange: ['#ffc07a', '#ff6d2e'],
    teal: ['#6fe8ec', '#1592b0'],
    pink: ['#ff9ad8', '#d63d97'],
    dark: ['#505666', '#1f222b'],
    gray: ['#f3f5fa', '#b8c0d0'],
    sky: ['#9ddcff', '#3b8dff'],
    sun: ['#ffe680', '#ffab1a'],
    paper: ['#ffffff', '#e3e8f2'],
    browser: ['#36e0c6', '#2a7bff'],
    aurora: ['#5fd4ff', '#a35cff'],
    sparkle: ['#ff8ad8', '#6a7bff'],
    screen: ['#58c4ff', '#3a5bff'],
    mine: ['#6f7585', '#2b2f3a'],
    doom: ['#ffd84a', '#e0300e'],
    doombg: ['#5a1a0c', '#140605'],
  };

  function defs() {
    let s = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    for (const [k, [a, b]] of Object.entries(grads)) {
      s += `<linearGradient id="ic-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    }
    s += '<linearGradient id="ic-lex" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6aa8ff"/><stop offset="1" stop-color="#2f4bff"/></linearGradient><linearGradient id="ic-tabsg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fe0a0"/><stop offset="1" stop-color="#0c8a52"/></linearGradient><linearGradient id="ic-prismbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2350"/><stop offset="1" stop-color="#121029"/></linearGradient><linearGradient id="ic-prismg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9c7bff"/><stop offset="1" stop-color="#d946ef"/></linearGradient>';
    s += '<linearGradient id="ic-fxa" gradientUnits="userSpaceOnUse" x1="292" y1="287" x2="548" y2="766"><stop offset="0" stop-color="#5EEAD4"/><stop offset=".5" stop-color="#22D3EE"/><stop offset="1" stop-color="#2563EB"/></linearGradient>';
    s += '<linearGradient id="ic-fxb" gradientUnits="userSpaceOnUse" x1="486" y1="232" x2="734" y2="770"><stop offset="0" stop-color="#818CF8"/><stop offset=".55" stop-color="#8B5CF6"/><stop offset="1" stop-color="#D946EF"/></linearGradient>';
    s += '<linearGradient id="ic-fxg" gradientUnits="userSpaceOnUse" x1="0" y1="240" x2="0" y2="770"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>';
    s += `<radialGradient id="ic-glow" cx=".3" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    s += '<linearGradient id="wx-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#ffa41a"/></linearGradient><linearGradient id="wx-moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f1ff"/><stop offset="1" stop-color="#b9b3e8"/></linearGradient><linearGradient id="wx-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cdd7ea"/></linearGradient><linearGradient id="wx-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9b4c8"/><stop offset="1" stop-color="#6c7890"/></linearGradient>';
    s += '<linearGradient id="ic-psbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a4d"/><stop offset=".5" stop-color="#ec3f8f"/><stop offset="1" stop-color="#6d3df5"/></linearGradient><linearGradient id="ic-wa1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a99cff"/><stop offset="1" stop-color="#6a55f0"/></linearGradient><linearGradient id="ic-wa2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fe0c8"/><stop offset="1" stop-color="#0f9e8c"/></linearGradient><linearGradient id="ic-wa3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#f08a0c"/></linearGradient><linearGradient id="ic-vpbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2f45"/><stop offset="1" stop-color="#0d0f1a"/></linearGradient><linearGradient id="ic-vpplay" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset=".55" stop-color="#ff5f6d"/><stop offset="1" stop-color="#d63bff"/></linearGradient><radialGradient id="ic-glow2" cx=".3" cy=".25" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
    s += '<linearGradient id="ic-rmbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e7eaf1"/></linearGradient><linearGradient id="ic-tgbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5aa2ff"/><stop offset="1" stop-color="#2346d8"/></linearGradient><linearGradient id="ic-lnbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f2a4d"/><stop offset="1" stop-color="#0b1022"/></linearGradient><linearGradient id="ic-torbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b6cff"/><stop offset="1" stop-color="#4a1fa8"/></linearGradient><radialGradient id="ic-tmbg" cx=".5" cy=".4" r=".65"><stop offset="0" stop-color="#34405a"/><stop offset="1" stop-color="#1c2335"/></radialGradient><radialGradient id="ic-ball" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></radialGradient>';
    s += '</defs></svg>';
    return s;
  }

  const page = (inner, fill = 'url(#ic-paper)') => `<path d="M12 4h17l9 9v29a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="${fill}" stroke="rgba(0,0,0,.12)"/><path d="M29 4v7a2 2 0 0 0 2 2h7" fill="#cfd6e4"/>${inner}`;

  const folderShape = `<path d="M5 12a4 4 0 0 1 4-4h10l4 4h16a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="url(#ic-folderback)"/><path d="M5 18a4 4 0 0 1 4-4h30a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="url(#ic-yellow)"/>`;

  const app = {
    lexicon: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-lex)"/><rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-glow)" opacity=".5"/><rect x="21" y="11" width="16" height="26" rx="2.5" fill="#fff" opacity=".95"/><path d="M24.5 17h9M24.5 21.5h9M24.5 26h9M24.5 30.5h6" stroke="#3b6cff" stroke-width="1.8" stroke-linecap="round"/><path d="M10.5 14h8v3.4h-4.3v14.2h5.3V35H10.5z" fill="#fff"/>',
    tabs: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-tabsg)"/><rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-glow)" opacity=".5"/><rect x="20" y="11" width="18" height="26" rx="2.5" fill="#fff" opacity=".95"/><path d="M20 18h18M20 24h18M20 30h18M29 11v26" stroke="#13a35f" stroke-width="1.6"/><path d="M10 14h11v3.4h-3.8V35h-3.4V17.4H10z" fill="#fff"/>',
    photostore: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-psbg)"/><rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-glow2)" opacity=".55"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 33V15.2h5a5 5 0 0 1 0 10h-5"/><path d="M34.2 17.6c-.8-1.7-2.5-2.6-4.5-2.6-2.7 0-4.6 1.6-4.6 3.9 0 5.3 9.7 3.1 9.7 8.9 0 2.6-2.1 4.3-5 4.3-2.3 0-4.1-1-5-2.7"/></g><path d="M37.4 7.6l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill="#fff" opacity=".95"/>',
    prism: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-psbg)"/><rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-glow2)" opacity=".55"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 33V15.2h5a5 5 0 0 1 0 10h-5"/><path d="M34.2 17.6c-.8-1.7-2.5-2.6-4.5-2.6-2.7 0-4.6 1.6-4.6 3.9 0 5.3 9.7 3.1 9.7 8.9 0 2.6-2.1 4.3-5 4.3-2.3 0-4.1-1-5-2.7"/></g><path d="M37.4 7.6l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill="#fff" opacity=".95"/>',
    reminders: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-rmbg)" stroke="rgba(0,0,0,.08)"/><circle cx="14" cy="15.5" r="3.6" fill="#0a84ff"/><circle cx="14" cy="24" r="3.6" fill="#ff3b30"/><circle cx="14" cy="32.5" r="3.6" fill="#ff9500"/><circle cx="14" cy="15.5" r="1.5" fill="#fff"/><circle cx="14" cy="24" r="1.5" fill="#fff"/><circle cx="14" cy="32.5" r="1.5" fill="#fff"/><path d="M21 15.5h15M21 24h13M21 32.5h10" stroke="#c4c9d4" stroke-width="2.4" stroke-linecap="round"/>',
    timematrix: '<circle cx="24" cy="24" r="21" fill="url(#ic-tmbg)"/><circle cx="24" cy="24" r="21" fill="none" stroke="#fff" stroke-opacity=".1"/><g fill="none" stroke-width="2.6" stroke-linecap="round"><path d="M23 23c-3.2-10.8-8.6-10.4-9.5-7.2-.9 3.6 3.6 6.2 9.5 7.2" stroke="#e8434d"/><path d="M25 23c3.2-10.8 8.6-10.4 9.5-7.2.9 3.6-3.6 6.2-9.5 7.2" stroke="#3dae5c"/><path d="M23 25c-3.2 10.8-8.6 10.4-9.5 7.2-.9-3.6 3.6-6.2 9.5-7.2" stroke="#e09e1a"/><path d="M25 25c3.2 10.8 8.6 10.4 9.5 7.2.9-3.6-3.6-6.2-9.5-7.2" stroke="#4273cc"/></g><g stroke-width="2" fill="#232b40"><circle cx="13.3" cy="15.3" r="1.9" stroke="#e8434d"/><circle cx="34.7" cy="15.3" r="1.9" stroke="#3dae5c"/><circle cx="13.3" cy="32.7" r="1.9" stroke="#e09e1a"/><circle cx="34.7" cy="32.7" r="1.9" stroke="#4273cc"/></g><circle cx="24" cy="24" r="2.2" fill="#fff"/>',
    things: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-tgbg)"/><rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-glow2)" opacity=".4"/><rect x="13" y="14" width="19" height="19" rx="5" fill="none" stroke="#fff" stroke-width="3"/><path d="M17.5 23.2l4.2 4.2L36 12.5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>',
    lines: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-lnbg)"/><path d="M5 17.7h38M5 30.3h38M17.7 5v38M30.3 5v38" stroke="#3b4a7a" stroke-width="1.2"/><circle cx="11.3" cy="11.3" r="4.6" fill="#ff3b4a"/><circle cx="11.3" cy="11.3" r="4.6" fill="url(#ic-ball)"/><circle cx="24" cy="24" r="4.6" fill="#ff3b4a"/><circle cx="24" cy="24" r="4.6" fill="url(#ic-ball)"/><circle cx="36.7" cy="36.7" r="4.6" fill="#ff3b4a"/><circle cx="36.7" cy="36.7" r="4.6" fill="url(#ic-ball)"/><circle cx="36.7" cy="11.3" r="4.6" fill="#2fd06a"/><circle cx="36.7" cy="11.3" r="4.6" fill="url(#ic-ball)"/><circle cx="11.3" cy="36.7" r="4.6" fill="#3d8bff"/><circle cx="11.3" cy="36.7" r="4.6" fill="url(#ic-ball)"/><circle cx="24" cy="11.3" r="4.6" fill="#ffd23f"/><circle cx="24" cy="11.3" r="4.6" fill="url(#ic-ball)"/>',
    tor: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-torbg)"/><circle cx="22" cy="23" r="10.5" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M11.5 23h21M22 12.5c3.4 3.2 3.4 17.8 0 21M22 12.5c-3.4 3.2-3.4 17.8 0 21" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M33 26.5l6 2.2v4.6c0 3.4-2.6 5.7-6 6.9-3.4-1.2-6-3.5-6-6.9v-4.6z" fill="#2a0d6b" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M30.6 32.6l1.7 1.7 3.2-3.4" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    winarch: '<rect x="7" y="28.5" width="34" height="11.5" rx="3.2" fill="url(#ic-wa3)"/><rect x="7" y="18.5" width="34" height="11.5" rx="3.2" fill="url(#ic-wa2)"/><rect x="7" y="8.5" width="34" height="11.5" rx="3.2" fill="url(#ic-wa1)"/><path d="M9.5 10.3h29M9.5 20.3h29M9.5 30.3h29" stroke="#fff" stroke-opacity=".45" stroke-width="1.1" stroke-linecap="round"/><rect x="21.2" y="12.5" width="5.6" height="27.5" rx="1.2" fill="#232838" opacity=".9"/><rect x="22.1" y="15.2" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="24.1" y="17.5" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="22.1" y="19.8" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="24.1" y="22.1" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="22.1" y="24.4" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="24.1" y="26.7" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="22.1" y="29.0" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="24.1" y="31.3" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="22.1" y="33.6" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="24.1" y="35.9" width="1.8" height="1.4" rx=".4" fill="#e8ebf2"/><rect x="19.6" y="4.6" width="8.8" height="10.4" rx="2.6" fill="#f3f4f8" stroke="#5b6275" stroke-width="1.1"/><rect x="22.3" y="7.2" width="3.4" height="4.6" rx="1.4" fill="#5b6275"/>',
    fxplayer: '<rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-vpbg)"/><path d="M5 12.5h38M5 35.5h38" stroke="#fff" stroke-opacity=".12"/><g fill="#fff" fill-opacity=".28"><rect x="8" y="7.3" width="3.4" height="3" rx=".8"/><rect x="15" y="7.3" width="3.4" height="3" rx=".8"/><rect x="22" y="7.3" width="3.4" height="3" rx=".8"/><rect x="29" y="7.3" width="3.4" height="3" rx=".8"/><rect x="36" y="7.3" width="3.4" height="3" rx=".8"/><rect x="8" y="37.7" width="3.4" height="3" rx=".8"/><rect x="15" y="37.7" width="3.4" height="3" rx=".8"/><rect x="22" y="37.7" width="3.4" height="3" rx=".8"/><rect x="29" y="37.7" width="3.4" height="3" rx=".8"/><rect x="36" y="37.7" width="3.4" height="3" rx=".8"/></g><path d="M19.2 16.4c0-1.5 1.6-2.4 2.9-1.6l11 7.4c1.1.8 1.1 2.4 0 3.2l-11 7.4c-1.3.8-2.9-.1-2.9-1.6z" fill="url(#ic-vpplay)"/><rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ic-glow2)" opacity=".35"/>',
    pdf: '<path d="M12 4h17l9 9v29a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="url(#ic-paper)" stroke="rgba(0,0,0,.12)"/><path d="M29 4v7a2 2 0 0 0 2 2h7" fill="#cfd6e4"/><rect x="5" y="22" width="30" height="14" rx="3" fill="#e5484d"/><text x="20" y="32.6" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif" font-weight="700" font-size="9.5" fill="#fff">PDF</text>',
    'file-pdf': page('<rect x="11" y="24" width="24" height="12" rx="2.5" fill="#e5484d"/><text x="23" y="32.8" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif" font-weight="700" font-size="8" fill="#fff">PDF</text>'),
    'file-doc': page('<rect x="11" y="24" width="24" height="12" rx="2.5" fill="#3b6cff"/><text x="23" y="32.8" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif" font-weight="700" font-size="8" fill="#fff">DOC</text>'),
    'file-sheet': page('<rect x="11" y="24" width="24" height="12" rx="2.5" fill="#13a35f"/><text x="23" y="32.8" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif" font-weight="700" font-size="8" fill="#fff">XLS</text>'),
    'file-psd': page('<rect x="11" y="24" width="24" height="12" rx="2.5" fill="#8b5cf6"/><text x="23" y="32.8" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif" font-weight="700" font-size="8" fill="#fff">PSD</text>'),
    'file-archive': page('<rect x="11" y="16" width="24" height="6" rx="1.6" fill="#7c6cff"/><rect x="11" y="22.5" width="24" height="6" rx="1.6" fill="#19b3a0"/><rect x="11" y="29" width="24" height="6" rx="1.6" fill="#f2a21a"/><rect x="21.4" y="14" width="3.4" height="21" rx=".8" fill="#2a2f3f"/><rect x="20.6" y="11.5" width="5" height="5" rx="1.3" fill="#eef0f5" stroke="#5b6275" stroke-width=".8"/>'),
    'file-apk': page('<path d="M16 32a7 7 0 0 1 14 0z" fill="#3ddc84"/><circle cx="20.3" cy="29.2" r=".9" fill="#fff"/><circle cx="25.7" cy="29.2" r=".9" fill="#fff"/><path d="M18 24.5l1.4 2.2M28 24.5l-1.4 2.2" stroke="#3ddc84" stroke-width="1.2" stroke-linecap="round"/>'),
    'drive-phone': '<rect x="13" y="4" width="22" height="40" rx="5" fill="url(#ic-dark)"/><rect x="15.5" y="8" width="17" height="30" rx="2" fill="url(#ic-screen)"/><circle cx="24" cy="41" r="1.4" fill="#8892a8"/>',
    'drive-sd': '<path d="M14 6h16l6 6v28a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" fill="url(#ic-dark)"/><path d="M17 8v7M21 8v7M25 8v7M29 9v6" stroke="#ffcf5c" stroke-width="2"/><rect x="15" y="24" width="18" height="12" rx="2" fill="url(#ic-screen)"/>',
    explorer: folderShape + '<rect x="13" y="26" width="22" height="5" rx="2.5" fill="#2f6bff" opacity=".9"/>',
    folder: folderShape,
    'folder-docs': folderShape + '<path d="M19 22h10l4 4v9H19z" fill="#fff" opacity=".9"/><path d="M22 29h8M22 32h6" stroke="#4f8cff" stroke-width="1.5"/>',
    'folder-images': folderShape + '<rect x="17" y="22" width="15" height="12" rx="2" fill="#fff" opacity=".92"/><path d="M18 33l4-5 3 3 2-2 4 4z" fill="#35b36b"/><circle cx="28" cy="25.5" r="1.6" fill="#ffb020"/>',
    'folder-music': folderShape + '<path d="M27 21v10.5a3 3 0 1 1-2-2.8V23l-5 1.2v9.3a3 3 0 1 1-2-2.8V22.4z" fill="#fff" opacity=".92"/>',
    'folder-video': folderShape + '<rect x="17" y="23" width="15" height="11" rx="2" fill="#fff" opacity=".92"/><path d="M23 26v5l4-2.5z" fill="#e5484d"/>',
    'folder-downloads': folderShape + '<path d="M24 21v10m-4.5-4.5L24 31l4.5-4.5M18 34h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
    'folder-desktop': folderShape + '<rect x="16" y="22" width="16" height="10" rx="1.5" fill="#fff" opacity=".92"/><path d="M21 35h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
    settings: '<circle cx="24" cy="24" r="15.5" fill="none" stroke="url(#ic-gray)" stroke-width="7" stroke-dasharray="5.3 4.45"/><circle cx="24" cy="24" r="13" fill="url(#ic-gray)"/><circle cx="24" cy="24" r="13" fill="none" stroke="rgba(0,0,0,.12)"/><circle cx="24" cy="24" r="5.5" fill="#3c4252"/>',
    browser: '<circle cx="24" cy="24" r="19" fill="url(#ic-browser)"/><circle cx="24" cy="24" r="19" fill="url(#ic-glow)"/><path d="M12.5 29c1.5-9 14-14 21.5-6.5 2.3 2.3 1 6.5-3 6.2-3-.2-4.2-3.4-8.6-3.3-4.6.1-6.6 3.6-9.9 3.6z" fill="#fff" opacity=".92"/><path d="M15.5 33c5 5 15 5 19.5-2" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".65"/>',
    notepad: '<rect x="9" y="6" width="30" height="37" rx="4" fill="url(#ic-paper)" stroke="rgba(0,0,0,.12)"/><rect x="9" y="6" width="30" height="8" rx="4" fill="url(#ic-sky)"/><rect x="9" y="10" width="30" height="4" fill="url(#ic-sky)"/><path d="M15 21h18M15 26h18M15 31h18M15 36h11" stroke="#9aa6bd" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="6" r="2" fill="#38425a"/><circle cx="24" cy="6" r="2" fill="#38425a"/><circle cx="32" cy="6" r="2" fill="#38425a"/>',
    calculator: '<rect x="9" y="5" width="30" height="38" rx="6" fill="url(#ic-dark)"/><rect x="13" y="9" width="22" height="9" rx="2.5" fill="#9fe7c5"/><g fill="#8892a8"><rect x="13" y="22" width="6" height="5" rx="1.5"/><rect x="21" y="22" width="6" height="5" rx="1.5"/><rect x="13" y="29" width="6" height="5" rx="1.5"/><rect x="21" y="29" width="6" height="5" rx="1.5"/><rect x="13" y="36" width="6" height="4" rx="1.5"/><rect x="21" y="36" width="6" height="4" rx="1.5"/></g><rect x="29" y="22" width="6" height="5" rx="1.5" fill="#ff9f43"/><rect x="29" y="29" width="6" height="11" rx="1.5" fill="url(#ic-blue)"/>',
    paint: '<path d="M24 5C12.4 5 5 13.5 5 23c0 9.8 8 18 17.5 18 3.5 0 4.5-2.4 3.4-4.6-1.3-2.6.2-5.4 3.4-5.4H34c5 0 9-3.5 9-9C43 12.8 34.6 5 24 5z" fill="url(#ic-gray)" stroke="rgba(0,0,0,.12)"/><circle cx="14" cy="22" r="3.4" fill="#e5484d"/><circle cx="19" cy="13.5" r="3.4" fill="#ffb020"/><circle cx="29" cy="12.5" r="3.4" fill="#35b36b"/><circle cx="36" cy="20" r="3.4" fill="#2f6bff"/><circle cx="16" cy="31.5" r="3.4" fill="#a35cff"/>',
    terminal: '<rect x="5" y="8" width="38" height="32" rx="6" fill="url(#ic-dark)"/><rect x="5" y="8" width="38" height="7" rx="6" fill="#3a3f4d"/><rect x="5" y="12" width="38" height="3" fill="#3a3f4d"/><path d="M12 22l6 5-6 5" stroke="#5ef0a8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M22 33h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
    taskmgr: '<rect x="5" y="7" width="38" height="34" rx="6" fill="url(#ic-teal)"/><path d="M10 30l7-7 5 5 8-11 8 7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 35h28" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>',
    photos: '<rect x="5" y="8" width="38" height="32" rx="7" fill="url(#ic-sky)"/><circle cx="33" cy="17" r="4" fill="url(#ic-sun)"/><path d="M5 33l11-12 9 9 5-5 13 11v1a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6z" fill="#fff" opacity=".9"/><path d="M5 35l11-10 9 9 5-4 13 10a6 6 0 0 1-6 3H11a6 6 0 0 1-6-6z" fill="#3ab977"/>',
    music: '<circle cx="24" cy="24" r="19" fill="url(#ic-orange)"/><circle cx="24" cy="24" r="19" fill="url(#ic-glow)"/><path d="M30 12v15.5a4.5 4.5 0 1 1-3-4.2V17l-8 2v11.5a4.5 4.5 0 1 1-3-4.2V15.5z" fill="#fff"/>',
    clock: '<circle cx="24" cy="24" r="19" fill="url(#ic-dark)"/><circle cx="24" cy="24" r="15.5" fill="url(#ic-paper)"/><g stroke="#9aa6bd" stroke-width="2" stroke-linecap="round"><path d="M24 10.5v2.5M24 35v2.5M10.5 24h2.5M35 24h2.5"/></g><path d="M24 24V15.5M24 24l6 4" stroke="#1f222b" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="24" r="2.2" fill="#2f6bff"/>',
    calendar: '<rect x="6" y="8" width="36" height="34" rx="6" fill="url(#ic-paper)" stroke="rgba(0,0,0,.12)"/><path d="M6 14a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v4H6z" fill="url(#ic-blue)"/><rect x="14" y="4" width="3" height="8" rx="1.5" fill="#38425a"/><rect x="31" y="4" width="3" height="8" rx="1.5" fill="#38425a"/><g fill="#9aa6bd"><rect x="12" y="23" width="5" height="4" rx="1"/><rect x="21.5" y="23" width="5" height="4" rx="1"/><rect x="12" y="31" width="5" height="4" rx="1"/><rect x="21.5" y="31" width="5" height="4" rx="1"/><rect x="31" y="31" width="5" height="4" rx="1"/></g><rect x="31" y="23" width="5" height="4" rx="1" fill="#e5484d"/>',
    weather: '<circle cx="18" cy="18" r="10" fill="url(#ic-sun)"/><path d="M15 40h20a8 8 0 0 0 .8-16A10.5 10.5 0 0 0 15.6 25 7.5 7.5 0 0 0 15 40z" fill="#fff"/><path d="M15 40h20a8 8 0 0 0 .8-16A10.5 10.5 0 0 0 15.6 25 7.5 7.5 0 0 0 15 40z" fill="url(#ic-sky)" opacity=".28"/>',
    minesweeper: '<g stroke="url(#ic-mine)" stroke-width="4" stroke-linecap="round"><path d="M24 6v36M6 24h36M11.3 11.3l25.4 25.4M36.7 11.3L11.3 36.7"/></g><circle cx="24" cy="24" r="12.5" fill="url(#ic-mine)"/><circle cx="19.5" cy="19.5" r="3.5" fill="#fff" opacity=".7"/><rect x="5" y="34" width="12" height="9" rx="2" fill="#e5484d"/><path d="M8 34v-6" stroke="#38425a" stroke-width="2"/>',
    game2048: '<rect x="5" y="5" width="38" height="38" rx="8" fill="url(#ic-orange)"/><rect x="9" y="9" width="14" height="14" rx="3" fill="#fff" opacity=".9"/><rect x="25" y="9" width="14" height="14" rx="3" fill="#fff" opacity=".45"/><rect x="9" y="25" width="14" height="14" rx="3" fill="#fff" opacity=".45"/><rect x="25" y="25" width="14" height="14" rx="3" fill="#fff" opacity=".75"/><text x="16" y="19.5" font-size="8.5" font-weight="800" text-anchor="middle" fill="#ff6d2e" font-family="Segoe UI,Arial">2</text><text x="32" y="35.5" font-size="8.5" font-weight="800" text-anchor="middle" fill="#ff6d2e" font-family="Segoe UI,Arial">4</text>',
    assistant: '<path d="M24 3c1.6 9.3 6.7 14.4 16 16-9.3 1.6-14.4 6.7-16 16-1.6-9.3-6.7-14.4-16-16 9.3-1.6 14.4-6.7 16-16z" fill="url(#ic-sparkle)"/><path d="M37 29c.7 4 2.9 6.3 7 7-4.1.7-6.3 2.9-7 7-.7-4.1-2.9-6.3-7-7 4.1-.7 6.3-3 7-7z" fill="url(#ic-aurora)"/>',
    doom: '<rect x="4" y="4" width="40" height="40" rx="9" fill="url(#ic-doombg)"/><path d="M4 33c9-4 16 2 22-2s10-2 18 1v3a9 9 0 0 1-9 9H13a9 9 0 0 1-9-9z" fill="#e0300e" opacity=".35"/><text x="24" y="29.5" font-size="14.5" font-weight="900" text-anchor="middle" fill="url(#ic-doom)" stroke="#3a0a04" stroke-width=".8" font-family="Impact,Arial Black,Segoe UI,sans-serif" transform="skewX(-6) translate(3 0)" letter-spacing="-.3">DOOM</text>',
    camera: '<rect x="4" y="12" width="40" height="28" rx="7" fill="url(#ic-dark)"/><path d="M16 12l3-5h10l3 5z" fill="#3a3f4d"/><circle cx="24" cy="26" r="10" fill="#141720" stroke="#5c6476" stroke-width="2"/><circle cx="24" cy="26" r="6" fill="url(#ic-screen)"/><circle cx="21.5" cy="23.5" r="2" fill="#fff" opacity=".7"/><circle cx="37" cy="18" r="2" fill="#5ef0a8"/>',
    recycle: '<path d="M10 14h28l-2.6 27a3 3 0 0 1-3 2.7H15.6a3 3 0 0 1-3-2.7z" fill="url(#ic-gray)" opacity=".85" stroke="rgba(0,0,0,.15)"/><rect x="8" y="10" width="32" height="5" rx="2.5" fill="url(#ic-gray)" stroke="rgba(0,0,0,.15)"/><path d="M19 20l1 18M29 20l-1 18M24 20v18" stroke="#9aa6bd" stroke-width="1.6" stroke-linecap="round"/>',
    'recycle-full': '<path d="M14 12l8-6 6 5 7-3 3 7z" fill="#6cc0ff"/><path d="M16 9h10l-2 5h-9z" fill="#ffe08a"/><path d="M10 14h28l-2.6 27a3 3 0 0 1-3 2.7H15.6a3 3 0 0 1-3-2.7z" fill="url(#ic-gray)" opacity=".85" stroke="rgba(0,0,0,.15)"/><rect x="8" y="12" width="32" height="5" rx="2.5" fill="url(#ic-gray)" stroke="rgba(0,0,0,.15)"/><path d="M19 22l1 16M29 22l-1 16M24 22v16" stroke="#9aa6bd" stroke-width="1.6" stroke-linecap="round"/>',
    thispc: '<rect x="4" y="7" width="40" height="27" rx="4" fill="url(#ic-dark)"/><rect x="7" y="10" width="34" height="21" rx="2" fill="url(#ic-screen)"/><path d="M7 26c8-7 18-11 34-9v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#fff" opacity=".18"/><path d="M19 34l-2 6h14l-2-6z" fill="#8a93a6"/><rect x="13" y="40" width="22" height="3" rx="1.5" fill="#b8c0d0"/>',
    'drive-cloud': '<path d="M14 37h21a8.5 8.5 0 0 0 1.2-16.9A12 12 0 0 0 13 17.6 9.8 9.8 0 0 0 14 37z" fill="url(#ic-blue)"/><path d="M14 37h21a8.5 8.5 0 0 0 7.6-4.7H6.6A9.7 9.7 0 0 0 14 37z" fill="rgba(0,0,0,.12)"/>',
    'drive-cloud-y': '<path d="M14 37h21a8.5 8.5 0 0 0 1.2-16.9A12 12 0 0 0 13 17.6 9.8 9.8 0 0 0 14 37z" fill="url(#ic-red)"/><path d="M14 37h21a8.5 8.5 0 0 0 7.6-4.7H6.6A9.7 9.7 0 0 0 14 37z" fill="rgba(0,0,0,.12)"/><circle cx="36" cy="34" r="7" fill="#fff"/><path d="M33 31l3 3 3-3M36 34v4" stroke="#e5484d" stroke-width="2" fill="none" stroke-linecap="round"/>',
    'drive-cloud-m': '<path d="M14 37h21a8.5 8.5 0 0 0 1.2-16.9A12 12 0 0 0 13 17.6 9.8 9.8 0 0 0 14 37z" fill="url(#ic-blue)"/><path d="M14 37h21a8.5 8.5 0 0 0 7.6-4.7H6.6A9.7 9.7 0 0 0 14 37z" fill="rgba(0,0,0,.12)"/><circle cx="36" cy="34" r="7" fill="#fff"/><path d="M33 36.5v-5l3 3 3-3v5" stroke="#2f6bff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    'drive-cloud-g': '<path d="M14 37h21a8.5 8.5 0 0 0 1.2-16.9A12 12 0 0 0 13 17.6 9.8 9.8 0 0 0 14 37z" fill="url(#ic-green)"/><path d="M14 37h21a8.5 8.5 0 0 0 7.6-4.7H6.6A9.7 9.7 0 0 0 14 37z" fill="rgba(0,0,0,.12)"/><circle cx="36" cy="34" r="7" fill="#fff"/><path d="M33 36l3-5.5 3 5.5z" fill="#0ea56a"/>',
    'drive-net': '<rect x="4" y="15" width="40" height="18" rx="4" fill="url(#ic-gray)" stroke="rgba(0,0,0,.18)"/><rect x="4" y="26" width="40" height="7" rx="3" fill="#a8b0c2"/><circle cx="37" cy="29.5" r="1.8" fill="#35d07f"/><circle cx="14" cy="20.5" r="4" fill="none" stroke="#2f6bff" stroke-width="1.6"/><path d="M10 20.5h8M14 16.5c-2 2.4-2 5.6 0 8M14 16.5c2 2.4 2 5.6 0 8" stroke="#2f6bff" stroke-width="1.2" fill="none"/><path d="M24 38v5M16 43h16" stroke="#7d869b" stroke-width="2" stroke-linecap="round"/>',
    'drive-local': '<rect x="5" y="8" width="38" height="25" rx="3" fill="url(#ic-dark)"/><rect x="8" y="11" width="32" height="19" rx="1.5" fill="url(#ic-screen)"/><path d="M19 33l-2 6h14l-2-6" fill="#8892a8"/><rect x="14" y="39" width="20" height="3" rx="1.5" fill="#a8b0c2"/><path d="M15 16h7l2 2h9v8H15z" fill="url(#ic-yellow)"/>',
    'drive-home': '<rect x="4" y="15" width="40" height="18" rx="4" fill="url(#ic-gray)" stroke="rgba(0,0,0,.18)"/><rect x="4" y="26" width="40" height="7" rx="3" fill="#a8b0c2"/><circle cx="37" cy="29.5" r="1.8" fill="#35d07f"/><path d="M10 23.5l5-4.5 5 4.5M11.5 22.5v4h7v-4" stroke="#1592b0" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
    drive: '<rect x="4" y="15" width="40" height="18" rx="4" fill="url(#ic-gray)" stroke="rgba(0,0,0,.18)"/><rect x="4" y="26" width="40" height="7" rx="3" fill="#a8b0c2"/><circle cx="37" cy="29.5" r="1.8" fill="#35d07f"/><path d="M8 29.5h18" stroke="#7d869b" stroke-width="1.5"/>',
    'drive-win': '<rect x="4" y="15" width="40" height="18" rx="4" fill="url(#ic-gray)" stroke="rgba(0,0,0,.18)"/><rect x="4" y="26" width="40" height="7" rx="3" fill="#a8b0c2"/><circle cx="37" cy="29.5" r="1.8" fill="#35d07f"/><g fill="url(#ic-blue)"><rect x="9" y="17" width="3.6" height="3.6" rx=".8"/><rect x="13.4" y="17" width="3.6" height="3.6" rx=".8"/><rect x="9" y="21.4" width="3.6" height="3.6" rx=".8"/><rect x="13.4" y="21.4" width="3.6" height="3.6" rx=".8"/></g>',
    home: '<path d="M7 22L24 7l17 15v17a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4z" fill="url(#ic-orange)"/><rect x="19" y="28" width="10" height="15" rx="2" fill="#fff" opacity=".9"/>',
    start: '<g transform="translate(-14.9 -6.9) scale(.066)"><path d="M292 312L456 287 548 766 292 729Z" fill="url(#ic-fxa)"/><path d="M486 270L734 232 734 770 574 746Z" fill="url(#ic-fxb)"/><path d="M292 312L456 287 548 766 292 729ZM486 270L734 232 734 770 574 746Z" fill="url(#ic-fxg)"/><path d="M471 250L566 800" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".9"/><path d="M808 136C816 196 826 206 886 214 826 222 816 232 808 292 800 232 790 222 730 214 790 206 800 196 808 136Z" fill="#fff"/></g>',
    // Файлы
    'file-text': page('<path d="M15 20h17M15 25h17M15 30h17M15 35h10" stroke="#9aa6bd" stroke-width="2" stroke-linecap="round"/>'),
    'file-image': page('<rect x="14" y="19" width="19" height="17" rx="2" fill="url(#ic-sky)"/><path d="M14 32l6-6 5 5 3-3 5 5v1a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2z" fill="#3ab977"/><circle cx="28" cy="23.5" r="2" fill="#ffe680"/>'),
    'file-audio': page('<path d="M28 18v13a3.5 3.5 0 1 1-2.5-3.3v-6.5l-6 1.5v9.8a3.5 3.5 0 1 1-2.5-3.3V20z" fill="url(#ic-orange)"/>'),
    'file-video': page('<rect x="14" y="21" width="19" height="14" rx="2.5" fill="url(#ic-purple)"/><path d="M22 25v6l5-3z" fill="#fff"/>'),
    'file-code': page('<path d="M19 22l-5 6 5 6M28 22l5 6-5 6" stroke="url(#ic-purple)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'),
    'file-html': page('<circle cx="23.5" cy="28" r="8.5" fill="url(#ic-browser)"/><path d="M15 28h17M23.5 19.5c-4 5-4 12 0 17M23.5 19.5c4 5 4 12 0 17" stroke="#fff" stroke-width="1.3" fill="none" opacity=".8"/>'),
    'file-generic': page(''),
    user: '<circle cx="24" cy="24" r="20" fill="url(#ic-purple)"/><circle cx="24" cy="19" r="7" fill="#fff" opacity=".92"/><path d="M11.5 37c2.8-5.5 7.4-8 12.5-8s9.7 2.5 12.5 8A19.5 19.5 0 0 1 24 44a19.5 19.5 0 0 1-12.5-7z" fill="#fff" opacity=".92"/>',
  };

  const shortcutBadge = '<g transform="translate(2 30)"><rect width="15" height="15" rx="3" fill="#fff" stroke="rgba(0,0,0,.25)"/><path d="M4.5 11V8.5A3.5 3.5 0 0 1 8 5h3M8.5 2.5L11 5 8.5 7.5" stroke="#2f6bff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>';

  /** Цветная иконка приложения/файла */
  function get(name, size = 24, opts = {}) {
    if (typeof name === 'string' && name.startsWith('img:')) {
      return `<img class="icon" src="${String(name.slice(4)).replace(/"/g, '&quot;')}" width="${size}" height="${size}" alt="" draggable="false" loading="lazy">`;
    }
    const body = app[name] || app['file-generic'];
    return `<svg class="icon" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${body}${opts.shortcut ? shortcutBadge : ''}</svg>`;
  }

  // Монохромные глифы (viewBox 24, обводка currentColor)
  const G = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
    taskview: '<rect x="3" y="5" width="12" height="10" rx="2"/><path d="M8 19h11a2 2 0 0 0 2-2V9"/>',
    widgets: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor"/>',
    'wifi-off': '<path d="M3 3l18 18M8.6 16a5 5 0 0 1 6.8 0M5.5 12.5a9.5 9.5 0 0 1 4-2.2M2.5 9a14 14 0 0 1 4.2-2.7M14.5 10.3a9.5 9.5 0 0 1 4 2.2M11 5a14 14 0 0 1 10.5 4"/><circle cx="12" cy="19.2" r="1" fill="currentColor"/>',
    volume: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    'volume-low': '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/>',
    'volume-mute': '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    battery: '<rect x="2.5" y="7" width="17" height="10" rx="2.5"/><path d="M21.5 10.5v3"/>',
    bluetooth: '<path d="M7 7l10 10-5 4.5V2.5L17 7 7 17"/>',
    airplane: '<path d="M10.5 3.5c0-1 .7-1.5 1.5-1.5s1.5.5 1.5 1.5V9l7.5 4.5v2L13.5 13v5l2.5 2v1.5L12 20.5l-4 1V20l2.5-2v-5L3 15.5v-2L10.5 9z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    'bell-off': '<path d="M3 3l18 18M8.5 6.2A6 6 0 0 1 18 11v4M6 11v5l-1.5 2H17"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    power: '<path d="M12 3v8"/><path d="M6.5 6.8a7.5 7.5 0 1 0 11 0"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1A7.6 7.6 0 0 0 9.6 19l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
    'chevron-right': '<path d="M9 5l7 7-7 7"/>',
    'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
    'chevron-up': '<path d="M5 15l7-7 7 7"/>',
    'chevron-down': '<path d="M5 9l7 7 7-7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    minimize: '<path d="M5 12h14"/>',
    maximize: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    restore: '<rect x="4.5" y="8" width="11.5" height="11.5" rx="2"/><path d="M8 8V6.5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2H16"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    home: '<path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    star: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.1 6-.8z"/>',
    'star-filled': '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.1 6-.8z" fill="currentColor"/>',
    more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-13.5M10 10.5v7M14 10.5v7"/>',
    cut: '<circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><path d="M8.5 15.3L18 3.5M15.5 15.3L6 3.5"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
    paste: '<rect x="5" y="4.5" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/>',
    rename: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    'new-folder': '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
    'new-file': '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M12 11v6M9 14h6"/>',
    file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>',
    sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    details: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M3.5 14.5h17M9 9v11"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
    folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    'folder-open': '<path d="M3.5 17.5V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1.5"/><path d="M3.5 17.5l2.6-6.2a2 2 0 0 1 1.8-1.3H21l-3 8.2a2 2 0 0 1-1.9 1.3H5.5a2 2 0 0 1-2-2z"/>',
    pc: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20.5h6M12 16.5v4"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
    sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9 4.5v15"/>',
    share: '<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="M8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
    next: '<path d="M5 5v14l10-7z" fill="currentColor"/><path d="M18.5 5v14"/>',
    prev: '<path d="M19 5v14L9 12z" fill="currentColor"/><path d="M5.5 5v14"/>',
    shuffle: '<path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c1.8 0 3-1.3 4-3M13.5 10c1-1.7 2.2-3 4-3H21M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    repeat: '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M17 3l3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4M7 21l-3-3 3-3"/>',
    leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15"/><path d="M5 19l7-7"/>',
    brightness: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    accessibility: '<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8l7 1.5L19 8M12 9.5V14l-3 7M12 14l3 7"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
    save: '<path d="M5 3.5h11l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v5h8v-5M7 20.5v-6.5h10v6.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    'zoom-in': '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4M11 8.5v5M8.5 11h5"/>',
    'zoom-out': '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4M8.5 11h5"/>',
    rotate: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/>',
    flag: '<path d="M5 21V4M5 4.5h11l-2 4 2 4H5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    pin: '<path d="M14.5 3.5l6 6-3 1.5-3.5 3.5.5 4-2 2-4-4-4.5 4.5M8.5 13l-4-4 2-2 4 .5L14 4z"/>',
    unpin: '<path d="M3 3l18 18M14.5 3.5l6 6-3 1.5-1.5 1.5M10.5 7.5L14 4M8.5 13l-4-4 2-2M12.5 16.5l.5 2.5-2 2-4-4-4.5 4.5"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/>',
    sparkle: '<path d="M12 3c.9 5 4 8.1 9 9-5 .9-8.1 4-9 9-.9-5-4-8.1-9-9 5-.9 8.1-4 9-9z"/>',
    send: '<path d="M4 12l16-8-6 16-3-7z"/><path d="M11 13l9-9"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
    stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V10M9.5 2.5h5M18.5 6.5l1.5-1.5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-3 3.5-3 13.5 0 17M12 3.5c3 3.5 3 13.5 0 17"/>',
    shield: '<path d="M12 3l7.5 3v6c0 4.5-3.2 8-7.5 9-4.3-1-7.5-4.5-7.5-9V6z"/>',
    apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><path d="M16.75 13.5v6.5M13.5 16.75H20"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.5 0 2-1 1.5-2-.6-1.2 0-2.5 1.5-2.5h2a3.5 3.5 0 0 0 3.5-3.5c0-5-4-9-8.5-9z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>',
    display: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20.5h6M12 16.5v4"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14.5h8"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/>',
    signout: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5l-4.5-4.5L10 7.5M5.5 12H15"/>',
    restart: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/>',
    sleep: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.7"/><path d="M3.5 17l5-5 4 4 2.5-2.5 5.5 5"/>',
    brush: '<path d="M18.5 3.5l2 2-9 9-2-2z"/><path d="M9.5 12.5c-2.5 0-4 1.5-4 4 0 1.5-1 2.5-2 3 4 1 8 0 8-5z"/>',
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>',
    eraser: '<path d="M8.5 20.5L3.5 15.5l10-10 7 7-8 8z"/><path d="M8 11l5 5M8.5 20.5H20"/>',
    line: '<path d="M5 19L19 5"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
    bucket: '<path d="M5 11l6.5-6.5 7 7L12 18a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8z"/><path d="M5 11.5h13.5M20 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>',
    picker: '<path d="M14 4.5l5.5 5.5-2 2-5.5-5.5zM12.5 8.5l-8 8V20h3.5l8-8"/>',
    text: '<path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 10l3 2.5L7 15M12.5 15.5h4.5"/>',
    camera: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    note: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    memory: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 10v4M11 10v4M15 10v4M6 17v3M18 17v3"/>',
    hdd: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13l2.5-7.5h9L19 13M16.5 16.5h.01"/>',
    location: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
    drop: '<path d="M12 3.5s6.5 7 6.5 11a6.5 6.5 0 0 1-13 0c0-4 6.5-11 6.5-11z"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
    sunrise: '<path d="M4 18h16M7 14.5a5 5 0 0 1 10 0M12 4v4M9 6l3-3 3 3M4.5 10.5l1.5 1M19.5 10.5l-1.5 1"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5M12 8v4.5l3 1.5"/>',
    bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/>',
    tab: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9.5h8V5"/>',
    desktop: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 20.5h8"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/>',
    update: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
    lang: '<path d="M4 6h9M8.5 4v2M6 6c.5 3 2.5 5.5 5.5 7M11 6c-.5 3.5-3 6.5-6.5 8M13 20l4-9 4 9M14.5 17h5"/>',
    snap: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/>',
    battery_full: '<rect x="2.5" y="7" width="17" height="10" rx="2.5"/><rect x="4.5" y="9" width="13" height="6" rx="1" fill="currentColor" stroke="none"/><path d="M21.5 10.5v3"/>',
  };

  function ui(name, size = 16, extra = '') {
    return `<svg class="glyph ${extra}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[name] || G.info}</svg>`;
  }

  /** Батарея с заливкой по уровню */
  function battery(level = 1, charging = false, size = 16) {
    const w = Math.max(1, Math.round(13 * level));
    const color = level <= 0.15 && !charging ? '#ff5b5b' : 'currentColor';
    return `<svg class="glyph" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="7" width="17" height="10" rx="2.5"/><rect x="4.5" y="9" width="${w}" height="6" rx="1" fill="${color}" stroke="none"/><path d="M21.5 10.5v3"/>${charging ? '<path d="M11.5 6.5l-2.5 6h4l-2 5" stroke="var(--fg)" stroke-width="1.4"/>' : ''}</svg>`;
  }

  return { defs, get, ui, battery, has: n => !!app[n] };
})();
