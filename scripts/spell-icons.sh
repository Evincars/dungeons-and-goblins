#!/usr/bin/env bash
# Pixelates the spell icons and points the game at them.
#
# Put an icon for a spell at public/spells-icons/<spell id>.webp (the id as in src/data/spell-list.json, e.g.
# fire_bolt.webp), using art you have the right to ship. For each one this writes a pixelated copy beside it,
# <spell id>.png (shrunk to a tenth and blown back up with hard edges), keeps the .webp, and sets the spell's "img"
# in src/data/spell-list.json to the copy. A .webp named after no spell in the list is reported and skipped.
#
# Needs ImageMagick (magick) and jq.  Usage: scripts/spell-icons.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
icons="$root/public/spells-icons"
list="$root/src/data/spell-list.json"

shopt -s nullglob
made=0
for input in "$icons"/*.webp; do
  id="$(basename "$input" .webp)"
  if [[ "$(jq --arg id "$id" '.spells | has($id)' "$list")" != "true" ]]; then
    echo "skipped $id.webp: no such spell in src/data/spell-list.json" >&2
    continue
  fi
  output="$icons/$id.png"
  magick "$input" -scale 10% -filter point -resize 1000% "$output"
  tmp="$(mktemp)"
  jq --arg id "$id" --arg img "spells-icons/$id.png" '.spells[$id].img = $img' "$list" > "$tmp"
  mv "$tmp" "$list"
  made=$((made + 1))
done
echo "pixelated $made spell icon(s)"
