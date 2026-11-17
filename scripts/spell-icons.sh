#!/usr/bin/env bash
# Pixelates the spell icons.
#
# Every image in public/spells-icons (.png or .webp; not the copies this makes) gets a pixelated copy beside it,
# shrunk to a quarter and blown back up with hard edges to twice its size (lightly pixelated, and large enough for
# a tooltip): its name without the "-150x150" size, with "_pixelart" added
# (Fireball-Baldurs-Gate-3-Spell-150x150.png -> Fireball-Baldurs-Gate-3-Spell_pixelart.png). The originals stay.
# scripts/bg3-spells.mjs then points each spell of src/data/spell-list.json at its copy (its "img").
#
# Needs ImageMagick (magick).  Usage: scripts/spell-icons.sh && node scripts/bg3-spells.mjs
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
icons="$root/public/spells-icons"

# Shrunk to this share, then blown back up this much: a quarter, eight times over, is twice the original's size.
SHRINK=25%
GROW=800%

shopt -s nullglob

made=0
for input in "$icons"/*.png "$icons"/*.webp; do
  stem="$(basename "${input%.*}")"
  [[ "$stem" == *_pixelart ]] && continue
  stem="${stem%-150x150}"
  magick "$input" -scale "$SHRINK" -filter point -resize "$GROW" "$icons/${stem}_pixelart.png"
  made=$((made + 1))
done
echo "pixelated $made icon(s)"
