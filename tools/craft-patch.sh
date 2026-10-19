#!/usr/bin/env bash
# WindowsFX changes to a Craft engine checkout (MIT OR Apache-2.0 sources):
#   - tools/craft/<app>.patch: no community/Discord links, a Russian About text, Russian UI on the
#     web, the Photostore mark (PhotoCraft) and, for WordCraft, a bundled Russian dictionary
#     (LibreOffice ru_RU, (c) Alexander I. Lebedev, BSD) with Cyrillic text checked as Russian;
#   - the product names in the interface: WordCraft → Lexicon, GridCraft → Tabs,
#     PhotoCraft → Photostore.
# Usage: craft-patch.sh <wordcraft|gridcraft|photocraft> <source dir>
set -euo pipefail
APP="$1"
SRC="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$SRC"
git apply --binary --whitespace=nowarn "$HERE/craft/$APP.patch"
case "$APP" in
  wordcraft) FROM=WordCraft; TO=Lexicon ;;
  gridcraft) FROM=GridCraft; TO=Tabs ;;
  photocraft) FROM=PhotoCraft; TO=Photostore ;;
  *) echo "unknown app $APP" >&2; exit 1 ;;
esac
mapfile -t FILES < <(grep -rlI -e "$FROM" -e "ArtCraft" -e "getartcraft" --include='*.rs' --include='*.tsv' --include='*.html' crates apps/"$APP"-web* || true)
if [ "${#FILES[@]}" -gt 0 ]; then
  sed -i \
    -e "s/Loading $FROM&hellip;/Загрузка $TO\&hellip;/g" \
    -e "s/$FROM/$TO/g" \
    -e "s#https://getartcraft\.com/apps/[a-z]*#https://github.com/Arthuralend/WindowsFX#g" \
    -e "s#https://getartcraft\.com/*#https://github.com/Arthuralend/WindowsFX#g" \
    -e "s/ArtCraft/WindowsFX/g" \
    "${FILES[@]}"
fi
echo "patched $APP: ${#FILES[@]} files renamed"
grep -rn "Discord" --include='*.rs' crates/ui-egui/src | grep -v "//" | grep -c . || true
