#!/usr/bin/env bash
# Сборка Monomach.app и Monomach.dmg на Mac (Apple Silicon). Запуск из корня репозитория: web/mac/build.sh
# Нужны: Xcode Command Line Tools (xcode-select --install), curl, unzip. Готовые офисные программы скачиваются из релиза craft-assets.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/web/mac/build"
VER="${VERSION:-1.0.$(date +%y%m%d)}"
APP="$OUT/Monomach.app"
rm -rf "$OUT"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/node" "$APP/Contents/Resources/app/web" "$APP/Contents/Resources/app/assets"

echo "== Swift"
swiftc -O -target arm64-apple-macos13.0 -o "$APP/Contents/MacOS/Monomach" "$ROOT/web/mac/main.swift" -framework Cocoa -framework WebKit

echo "== Info.plist, значок"
sed -e "s/__VERSION__/$VER/" -e "s/__BUILD__/${BUILD:-1}/" "$ROOT/web/mac/Info.plist" > "$APP/Contents/Info.plist"
IS="$OUT/AppIcon.iconset"; mkdir -p "$IS"
for s in 16 32 128 256 512; do
  sips -z $s $s "$ROOT/web/mac/AppIcon.png" --out "$IS/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$ROOT/web/mac/AppIcon.png" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$IS" -o "$APP/Contents/Resources/AppIcon.icns"

T=$(mktemp -d)
NODE_PKG=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o 'node-v22[0-9.]*-darwin-arm64.tar.gz' | head -1)
echo "== $NODE_PKG"
curl -fsSL "https://nodejs.org/dist/latest-v22.x/$NODE_PKG" | tar -xz -C "$T"
cp "$T/${NODE_PKG%.tar.gz}/bin/node" "$APP/Contents/Resources/node/node"
cp "$T/${NODE_PKG%.tar.gz}/LICENSE" "$APP/Contents/Resources/node/LICENSE"

echo "== Сайт и рабочий стол"
cp -R "$ROOT/web/server" "$ROOT/web/public" "$ROOT/web/package.json" "$APP/Contents/Resources/app/web/"
cp -R "$ROOT/app/src/main/assets/os" "$APP/Contents/Resources/app/assets/os"
C="$APP/Contents/Resources/app/assets/craft"
if [ -d "$ROOT/app/src/main/assets/craft/lexicon" ]; then cp -R "$ROOT/app/src/main/assets/craft" "$C"
else
  for e in wordcraft:lexicon gridcraft:tabs photocraft:photostore; do
    src=${e%%:*}; dst=${e##*:}
    curl -fsSL -o "$T/$src.zip" "https://github.com/Arthuralend/WindowsFX/releases/download/craft-assets/$src-web.zip"
    mkdir -p "$T/$src" "$C/$dst"; unzip -q "$T/$src.zip" -d "$T/$src"; cp -R "$T/$src"/*/. "$C/$dst/"
  done
fi
rm -rf "$T"

echo "== Подпись (ad-hoc)"
codesign --force --sign - "$APP/Contents/Resources/node/node"
codesign --force --deep --sign - "$APP"
codesign --verify --deep "$APP"

echo "== DMG"
D="$OUT/dmg"; mkdir -p "$D"; cp -R "$APP" "$D/"; ln -s /Applications "$D/Applications"
hdiutil create -volname "Monomach" -srcfolder "$D" -ov -format UDZO "$OUT/Monomach-$VER-mac-arm64.dmg" >/dev/null
du -sh "$APP" "$OUT"/*.dmg
