#!/usr/bin/env bash
# Monomach: вход через Windows App (RDP). Запускается из install.sh с ключом --rdp (от root).
#   xrdp (порт 3389) → пароль проверяет сайт (PAM → rdp-auth.js) → в сеансе Chromium во весь экран
#   с рабочим столом пользователя. Учётные записи Linux создаёт rdp-sync.js по списку с сайта.
# Переменные: DOMAIN, IPMODE (0/1), APP (/opt/monomach), DATA, ENVF — их передаёт install.sh.
set -euo pipefail

APP="${APP:-/opt/monomach}"
DATA="${DATA:-/var/lib/monomach}"
ENVF="${ENVF:-/etc/monomach.env}"
R="$APP/web/deploy/rdp"
RDP_PORT="${RDP_PORT:-3389}"

[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
ARCH=$(dpkg --print-architecture)
echo "== Вход через Windows App (RDP)"

export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq xrdp xorgxrdp matchbox-window-manager x11-xserver-utils dbus-x11 \
  fonts-noto-core fonts-noto-color-emoji fonts-dejavu-core locales fail2ban python3 >/dev/null

# Браузер для сеансов: Google Chrome (deb). На Ubuntu Chromium поставляется только как snap — в сеансах xrdp он работает плохо.
if ! command -v google-chrome-stable >/dev/null; then
  if [ "$ARCH" = amd64 ]; then
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor --yes -o /usr/share/keyrings/google-chrome.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
    apt-get update -qq && apt-get install -y -qq google-chrome-stable >/dev/null
  elif ! command -v chromium >/dev/null; then
    echo "!! Для $ARCH нет Google Chrome. Установите Chromium из deb-пакета (не snap) и запустите скрипт снова."; exit 1
  fi
fi
locale -a 2>/dev/null | grep -qi '^ru_RU.utf8$' || { sed -i 's/^# *ru_RU.UTF-8/ru_RU.UTF-8/' /etc/locale.gen; locale-gen >/dev/null; }

# Настройки сайта для RDP
PORT=$(sed -n 's/^PORT=//p' "$ENVF" | head -1); PORT=${PORT:-8080}
grep -q '^RDP_ENABLED=' "$ENVF" || cat >> "$ENVF" <<EOF
# Вход через Windows App (RDP)
RDP_ENABLED=1
RDP_HOST=$DOMAIN
RDP_PORT=$RDP_PORT
# одновременных сеансов (можно менять в панели администратора); память и процессор на один сеанс
RDP_MAX_SESSIONS=10
RDP_MEMORY_MAX=1536M
RDP_CPU_QUOTA=150%
EOF
sed -i "s#^RDP_ENABLED=.*#RDP_ENABLED=1#; s#^RDP_HOST=.*#RDP_HOST=$DOMAIN#" "$ENVF"
MAXS=$(sed -n 's/^RDP_MAX_SESSIONS=//p' "$ENVF" | head -1); MAXS=${MAXS:-10}
echo "PORT=$PORT" > /etc/monomach-rdp.conf

chmod 755 "$R/rdp-auth.js" "$R/rdp-sync.js" "$R/rdp-session.sh"
# PAM запускает программы без PATH — путь к node указываем полностью
NODE=$(command -v node)
getent group monomach-rdp >/dev/null || groupadd --system monomach-rdp
mkdir -p /home/monomach-rdp && chmod 711 /home/monomach-rdp

# PAM: вход в xrdp — только пользователи Monomach, пароль проверяет сайт
[ -f /etc/pam.d/xrdp-sesman.orig ] || cp /etc/pam.d/xrdp-sesman /etc/pam.d/xrdp-sesman.orig 2>/dev/null || true
cat > /etc/pam.d/xrdp-sesman <<EOF
#%PAM-1.0
# Monomach: вход через Windows App. Имя и пароль проверяет сайт (rdp-auth.js); пароли в Linux не хранятся.
auth     requisite  pam_succeed_if.so user ingroup monomach-rdp quiet
auth     required   pam_exec.so expose_authtok quiet type=auth $NODE $R/rdp-auth.js
# pam_setcred: модулям выше нечего делать, но стеку нужен хотя бы один успешный ответ
auth     optional   pam_permit.so
account  requisite  pam_succeed_if.so user ingroup monomach-rdp quiet
account  required   pam_permit.so
session  required   pam_mkhomedir.so skel=/etc/skel umask=0077
session  optional   pam_systemd.so
session  required   pam_limits.so
session  required   pam_env.so readenv=1 envfile=/etc/default/locale
password required   pam_deny.so
EOF

# xrdp: только сеанс Xorg, шифрование TLS, буфер обмена; без доступа к дискам и принтерам клиента
python3 - "$RDP_PORT" "$MAXS" "$R/rdp-session.sh" <<'PY'
import re, sys
port, maxs, session = sys.argv[1], int(sys.argv[2]), sys.argv[3]

def setkeys(text, section, kv):
    lines = text.split('\n'); out = []; cur = None; seen = set()
    def flush():
        for k, v in kv.items():
            if (cur == section) and k not in seen: out.append(f'{k}={v}'); seen.add(k)
    for l in lines:
        m = re.match(r'^\[(.+)\]\s*$', l)
        if m:
            flush(); cur = m.group(1)
        else:
            km = re.match(r'^\s*;?\s*([A-Za-z_]+)\s*=', l)
            if cur == section and km and km.group(1) in kv and not l.lstrip().startswith(';'):
                k = km.group(1); out.append(f'{k}={kv[k]}'); seen.add(k); continue
        out.append(l)
    flush()
    return '\n'.join(out)

p = '/etc/xrdp/xrdp.ini'
t = open(p).read()
t = setkeys(t, 'Globals', {'port': port, 'security_layer': 'tls', 'crypt_level': 'high', 'ssl_protocols': 'TLSv1.2, TLSv1.3',
    'certificate': '/etc/xrdp/monomach.crt' , 'key_file': '/etc/xrdp/monomach.key', 'autorun': 'Xorg', 'allow_multimon': 'false',
    'ls_title': 'Monomach', 'ls_top_window_bg_color': '1f1e1d', 'ls_bg_color': 'faf9f5', 'blue': 'd97757', 'grey': 'f0eee6', 'dark_grey': '73726c',
    'tcp_keepalive': 'true'})
t = setkeys(t, 'Channels', {'rdpdr': 'false', 'rdpsnd': 'false', 'drdynvc': 'true', 'cliprdr': 'true', 'rail': 'false', 'xrdpvr': 'false', 'tcutils': 'false'})
# оставить только сеанс Xorg (Xvnc и прочие убрать из списка на экране входа)
blocks = re.split(r'(?m)^(?=\[)', t)
keep = [b for b in blocks if not re.match(r'^\[(Xvnc|vnc-any|sesman-any|rdp-any|neutrinordp-any|Local-Xvnc|Xvnc-.*)\]', b)]
open(p, 'w').write(''.join(keep))

p = '/etc/xrdp/sesman.ini'
t = open(p).read()
t = setkeys(t, 'Globals', {'EnableUserWindowManager': 'false', 'DefaultWindowManager': session})
t = setkeys(t, 'Security', {'AllowRootLogin': 'false', 'MaxLoginRetry': '3', 'TerminalServerUsers': 'monomach-rdp', 'AlwaysGroupCheck': 'true', 'RestrictOutboundClipboard': 'none'})
t = setkeys(t, 'Sessions', {'MaxSessions': str(max(2, maxs * 2)), 'KillDisconnected': 'false', 'DisconnectedTimeLimit': '900', 'IdleTimeLimit': '0', 'Policy': 'Default'})
t = setkeys(t, 'Chansrv', {'FuseMountName': '.thinclient_drives'})
open(p, 'w').write(t)
PY
adduser xrdp ssl-cert >/dev/null 2>&1 || true

# Сертификат: на домене — тот же, что выпустил Caddy (Let's Encrypt), иначе — самоподписанный xrdp
cat > /usr/local/sbin/monomach-rdp-cert <<'EOF'
#!/bin/bash
# Копирует сертификат сайта (Caddy) для xrdp; без него — самоподписанный сертификат пакета xrdp
D=$(sed -n 's/^RDP_HOST=//p' /etc/monomach.env | head -1)
C=$(find /var/lib/caddy/.local/share/caddy/certificates -path "*/$D/$D.crt" 2>/dev/null | head -1)
if [ -n "$C" ] && [ -f "${C%.crt}.key" ]; then SRC_C="$C"; SRC_K="${C%.crt}.key"; else SRC_C=/etc/xrdp/cert.pem; SRC_K=/etc/xrdp/key.pem; fi
if ! cmp -s "$SRC_C" /etc/xrdp/monomach.crt || ! cmp -s "$SRC_K" /etc/xrdp/monomach.key; then
  install -m 644 -o root -g xrdp "$SRC_C" /etc/xrdp/monomach.crt
  install -m 640 -o root -g xrdp "$SRC_K" /etc/xrdp/monomach.key
  systemctl is-active -q xrdp && systemctl restart xrdp
fi
exit 0
EOF
chmod 755 /usr/local/sbin/monomach-rdp-cert
# Caddy получает сертификат при первом обращении к сайту — даём ему пару секунд
[ "${IPMODE:-0}" = 1 ] || curl -fsS -o /dev/null --max-time 20 "https://$DOMAIN/healthz" || true
/usr/local/sbin/monomach-rdp-cert

# Политика браузера в сеансах: без инструментов разработчика, файлов сервера, загрузок и расширений
for d in /etc/opt/chrome/policies/managed /etc/chromium/policies/managed /etc/opt/chrome_for_testing/policies/managed; do
  mkdir -p "$d"
  cat > "$d/monomach.json" <<EOF
{
  "DeveloperToolsAvailability": 2,
  "URLBlocklist": ["file://*", "chrome://*", "chrome-extension://*", "chrome-untrusted://*", "devtools://*", "view-source:*"],
  "DownloadRestrictions": 3,
  "AllowFileSelectionDialogs": false,
  "PrintingEnabled": false,
  "ExtensionInstallBlocklist": ["*"],
  "BrowserSignin": 0,
  "SyncDisabled": true,
  "PasswordManagerEnabled": false,
  "AutofillAddressEnabled": false,
  "AutofillCreditCardEnabled": false,
  "TranslateEnabled": false,
  "BrowserAddPersonEnabled": false,
  "BrowserGuestModeEnabled": false,
  "IncognitoModeAvailability": 1,
  "DefaultBrowserSettingEnabled": false,
  "MetricsReportingEnabled": false,
  "TaskManagerEndProcessEnabled": false,
  "AllowDinosaurEasterEgg": false,
  "ClipboardAllowedForUrls": ["http://localhost:$PORT"],
  "NotificationsAllowedForUrls": ["http://localhost:$PORT"],
  "AutoplayAllowed": true,
  "PromotionalTabsEnabled": false,
  "ShowFullUrlsInAddressBar": false
}
EOF
done

# Учётные записи Linux: при каждом изменении списка на сайте и раз в 10 минут
cat > /etc/systemd/system/monomach-rdp-sync.service <<EOF
[Unit]
Description=Monomach RDP: учётные записи для входа через Windows App
[Service]
Type=oneshot
ExecStart=$NODE $R/rdp-sync.js
EOF
cat > /etc/systemd/system/monomach-rdp-sync.path <<EOF
[Unit]
Description=Monomach RDP: список пользователей изменился
[Path]
PathChanged=$DATA/rdp/users.json
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/monomach-rdp-sync.timer <<EOF
[Unit]
Description=Monomach RDP: проверка учётных записей
[Timer]
OnBootSec=1min
OnUnitActiveSec=10min
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/monomach-rdp-cert.service <<EOF
[Unit]
Description=Monomach RDP: обновление сертификата
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/monomach-rdp-cert
EOF
cat > /etc/systemd/system/monomach-rdp-cert.timer <<EOF
[Unit]
Description=Monomach RDP: обновление сертификата раз в сутки
[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true
[Install]
WantedBy=timers.target
EOF

# Защита от подбора пароля по RDP (дополнительно к ограничению попыток на сайте)
cat > /etc/fail2ban/filter.d/monomach-xrdp.conf <<'EOF'
[Definition]
failregex = ^.*AUTHFAIL: user=.* ip=(?:::ffff:)?<HOST> .*$
            ^.*login failed for user .* from (?:::ffff:)?<HOST>.*$
ignoreregex =
EOF
cat > /etc/fail2ban/jail.d/monomach-xrdp.conf <<EOF
[monomach-xrdp]
enabled  = true
port     = $RDP_PORT
filter   = monomach-xrdp
logpath  = /var/log/xrdp-sesman.log
           /var/log/xrdp.log
maxretry = 6
findtime = 15m
bantime  = 1h
EOF

systemctl daemon-reload
systemctl restart monomach
sleep 2
systemctl enable -q --now monomach-rdp-sync.path monomach-rdp-sync.timer monomach-rdp-cert.timer
systemctl start monomach-rdp-sync.service || true
systemctl enable -q xrdp
systemctl restart xrdp xrdp-sesman 2>/dev/null || systemctl restart xrdp
systemctl restart fail2ban || true
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow "$RDP_PORT/tcp" >/dev/null; fi

systemctl is-active -q xrdp && echo "== RDP запущен: $DOMAIN:$RDP_PORT (Windows App → добавить компьютер)" || { echo "!! xrdp не запустился: journalctl -u xrdp -n 50"; exit 1; }
echo "   Пользователи найдут адрес, имя и файл подключения в Параметрах → «Учётная запись и диски»."
