#!/usr/bin/env bash
# Monomach.ru — установка на чистый сервер Ubuntu 22.04 / 24.04 (или Debian 12).
# Запуск от root:   curl -fsSL https://raw.githubusercontent.com/Arthuralend/WindowsFX/main/web/deploy/install.sh | bash -s -- monomach.ru
# Без домена (проверка по IP, без HTTPS):  ... | bash -s -- ip
# Повторный запуск обновляет сайт (данные пользователей не трогаются); с доменом — включает HTTPS.
set -euo pipefail

DOMAIN="${1:-monomach.ru}"
IPMODE=0
if [ "$DOMAIN" = ip ] || [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  IPMODE=1
  DOMAIN=$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
fi
SCHEME=https; [ $IPMODE = 1 ] && SCHEME=http
REPO="https://github.com/Arthuralend/WindowsFX"
APP=/opt/monomach
DATA=/var/lib/monomach
ENVF=/etc/monomach.env

[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo -i)"; exit 1; }
echo "== Monomach: сайт $SCHEME://$DOMAIN"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git unzip debian-keyring debian-archive-keyring apt-transport-https >/dev/null

# Node.js 22
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "   Node.js $(node -v)"

# Caddy (HTTPS-сертификат Let's Encrypt получается автоматически)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

# Код сайта
if [ -d "$APP/.git" ]; then git -C "$APP" pull -q --ff-only; else git clone -q --depth 1 "$REPO" "$APP"; fi

# Офисные программы (Lexicon, Tabs, Photostore) — готовые сборки из релиза craft-assets
C="$APP/app/src/main/assets/craft"
T=$(mktemp -d)
for e in wordcraft:lexicon gridcraft:tabs photocraft:photostore; do
  src=${e%%:*}; dst=${e##*:}
  curl -fsSL -o "$T/$src.zip" "$REPO/releases/download/craft-assets/$src-web.zip"
  unzip -q "$T/$src.zip" -d "$T/$src"
  rm -rf "$C/$dst"; mkdir -p "$C/$dst"; cp -R "$T/$src"/*/. "$C/$dst/"
done
rm -rf "$T"

# Пользователь и данные
id monomach >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin monomach
mkdir -p "$DATA"; chown -R monomach:monomach "$DATA"; chmod 700 "$DATA"

# Настройки (создаются один раз; дальше правьте /etc/monomach.env)
if [ ! -f "$ENVF" ]; then
  PW=$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | cut -c1-16)
  cat > "$ENVF" <<EOF
# Monomach — настройки сайта. После изменений: systemctl restart monomach
PORT=8080
HOST=127.0.0.1
DATA_DIR=$DATA
SITE_NAME=Monomach
PUBLIC_URL=$SCHEME://$DOMAIN
SECURE_COOKIES=$([ $IPMODE = 1 ] && echo 0 || echo 1)
# Лимит личного диска нового пользователя, МБ (можно менять в панели администратора)
DEFAULT_QUOTA_MB=1024
# Панель администратора: $SCHEME://$DOMAIN/admin
ADMIN_LOGIN=admin
ADMIN_PASSWORD=$PW
# Вход через Google для подключения Google Диска (см. web/README.md). Пусто — кнопка Google выключена.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
  chmod 600 "$ENVF"
  NEWPW=$PW
fi
# адрес сайта и защищённые cookie — по текущему режиму (IP или домен)
sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=$SCHEME://$DOMAIN#; s#^SECURE_COOKIES=.*#SECURE_COOKIES=$([ $IPMODE = 1 ] && echo 0 || echo 1)#" "$ENVF"

cat > /etc/systemd/system/monomach.service <<EOF
[Unit]
Description=Monomach.ru — режим эффективной работы
After=network.target

[Service]
User=monomach
EnvironmentFile=$ENVF
WorkingDirectory=$APP/web
ExecStart=/usr/bin/node --no-warnings=ExperimentalWarning server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

if [ $IPMODE = 1 ]; then
cat > /etc/caddy/Caddyfile <<EOF
:80 {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080 {
		flush_interval -1
	}
}
EOF
else
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN, www.$DOMAIN {
	@www host www.$DOMAIN
	redir @www https://$DOMAIN{uri} permanent
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080 {
		flush_interval -1
	}
}
EOF
fi

systemctl daemon-reload
systemctl enable -q --now monomach
systemctl restart monomach
systemctl reload caddy || systemctl restart caddy

# Брандмауэр (если включён)
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi

sleep 2
curl -fsS http://127.0.0.1:8080/healthz >/dev/null && echo "== Сайт запущен: $SCHEME://$DOMAIN" || { echo "!! Сайт не отвечает: journalctl -u monomach -n 50"; exit 1; }
echo "   Панель администратора: $SCHEME://$DOMAIN/admin"
if [ $IPMODE = 1 ]; then echo "   Режим проверки без HTTPS. Когда домен заработает, запустите скрипт ещё раз с доменом."; fi
[ -n "${NEWPW:-}" ] && echo "   Логин: admin   Пароль: $NEWPW   (сохраните; сменить можно в панели)"
echo "   Настройки: $ENVF   Данные пользователей: $DATA"

exit 0
