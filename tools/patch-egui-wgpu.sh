#!/usr/bin/env bash
# WindowsFX: make egui-wgpu ask the GPU only for what it supports.
# egui-wgpu requests 8192 px textures unconditionally; many Android GPUs (Mali, Adreno in WebView)
# allow 4096, and the Craft apps then refuse to start. We use min(adapter limit, 8192) and clamp
# the other limits to the adapter, the way PhotoCraft already does for itself.
# Usage: tools/patch-egui-wgpu.sh <cargo workspace dir>
set -euo pipefail
WS="$1"
VER=$(awk '/^name = "egui-wgpu"$/ { getline; gsub(/version = |"/, ""); print; exit }' "$WS/Cargo.lock")
[ -n "$VER" ] || { echo "egui-wgpu not in $WS/Cargo.lock"; exit 1; }
# outside the workspace folder, so Cargo does not make it a workspace member
DEST="$(cd "$WS/.." && pwd)/fx-patches"
mkdir -p "$DEST"
curl -sSL "https://static.crates.io/crates/egui-wgpu/egui-wgpu-$VER.crate" | tar -xz -C "$DEST"
SRC="$DEST/egui-wgpu-$VER/src/setup.rs"
sed -i 's/max_texture_dimension_2d: 8192,/max_texture_dimension_2d: adapter.limits().max_texture_dimension_2d.min(8192),/' "$SRC"
sed -i 's/\.\.base_limits$/..base_limits.or_worse_values_from(\&adapter.limits())/' "$SRC"
grep -q 'adapter.limits().max_texture_dimension_2d.min(8192)' "$SRC" || { echo "texture patch failed"; exit 1; }
grep -q 'or_worse_values_from(&adapter.limits())' "$SRC" || { echo "limits patch failed"; exit 1; }
LINE="egui-wgpu = { path = \"$DEST/egui-wgpu-$VER\" }"
if grep -q '^\[patch.crates-io\]' "$WS/Cargo.toml"; then
  sed -i "/^\[patch.crates-io\]/a $LINE" "$WS/Cargo.toml"
else
  printf '\n[patch.crates-io]\n%s\n' "$LINE" >> "$WS/Cargo.toml"
fi
echo "patched egui-wgpu $VER in $WS"
sed -n '/device_descriptor: Arc::new/,/^            }),/p' "$SRC"
