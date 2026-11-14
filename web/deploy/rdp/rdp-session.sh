#!/bin/bash
# Monomach RDP: сеанс пользователя. xrdp запускает этот файл вместо рабочего стола Linux.
# Открывает рабочий стол Monomach в Chromium во весь экран (режим киоска) и следит,
# не нажал ли пользователь «Выйти» (тогда сеанс закрывается и Windows App отключается).

PORT=8080
[ -r /etc/monomach-rdp.conf ] && . /etc/monomach-rdp.conf
BASE="http://localhost:${PORT}"
CHROME="${CHROME_BIN:-$(command -v google-chrome-stable || command -v google-chrome || command -v chromium || command -v chromium-browser)}"
RUN="${XDG_RUNTIME_DIR:-/tmp}/monomach-$USER"
mkdir -p "$RUN" && chmod 700 "$RUN"
rm -f "$RUN/end"

# одноразовый ключ входа, который положил rdp-auth при проверке пароля
TOKEN_FILE="/run/monomach-rdp/$USER.token"
URL="$BASE/"
if [ -r "$TOKEN_FILE" ]; then URL="$BASE/rdp/enter?t=$(cat "$TOKEN_FILE")"; rm -f "$TOKEN_FILE"; fi

export LANG="${LANG:-ru_RU.UTF-8}"
xset s off -dpms 2>/dev/null
xsetroot -solid '#1f1e1d' 2>/dev/null
# окна без рамок и всегда во весь экран (в том числе при изменении размера окна Windows App)
command -v matchbox-window-manager >/dev/null && matchbox-window-manager -use_titlebar no -use_cursor yes &

PROFILE="$HOME/.config/monomach-chrome"
mkdir -p "$PROFILE"

# «Выйти» на рабочем столе → сайт отмечает сеанс → закрываем браузер и сеанс
(
  while sleep 3; do
    r=$(curl -fsS --max-time 5 "$BASE/api/rdp/state?user=$USER" 2>/dev/null) || continue
    case "$r" in *'"end":true'*) touch "$RUN/end"; pkill -TERM -u "$USER" -f -- "--user-data-dir=$PROFILE"; break ;; esac
  done
) &
WATCH=$!

while :; do
  # после аварийного выхода не показывать «Восстановить страницы?»
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PROFILE/Default/Preferences" 2>/dev/null
  "$CHROME" --user-data-dir="$PROFILE" --kiosk --start-fullscreen --no-first-run --no-default-browser-check \
    --disable-session-crashed-bubble --disable-infobars --noerrdialogs --password-store=basic \
    --disable-features=Translate,MediaRouter,DownloadBubble --disable-sync --disable-background-networking \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --autoplay-policy=no-user-gesture-required --lang=ru \
    "$URL" >/dev/null 2>&1
  [ -e "$RUN/end" ] && break
  # браузер закрыли или он упал — открываем снова (вход уже выполнен, cookie сохранена)
  URL="$BASE/"
  sleep 1
done

kill "$WATCH" 2>/dev/null
exit 0
