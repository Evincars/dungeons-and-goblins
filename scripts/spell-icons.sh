#!/usr/bin/env bash
# Pixelates the spell icons and points the game at them.
#
# Every image in public/spells-icons (.png or .webp; not the copies this makes) gets a pixelated copy beside it,
# shrunk to a tenth and blown back up with hard edges: its name without the "-150x150" size, with "_pixelart" added
# (Fireball-Baldurs-Gate-3-Spell-150x150.png -> Fireball-Baldurs-Gate-3-Spell_pixelart.png). The originals stay.
# Then each spell in src/data/spell-list.json gets as its "img" the copy whose file name starts with the spell's name
# (from src/data/spellbook.json; ALIASES for icons that spell it otherwise). A spell with no icon is reported and left.
#
# Needs ImageMagick (magick) and jq.  Usage: scripts/spell-icons.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
icons="$root/public/spells-icons"
list="$root/src/data/spell-list.json"
book="$root/src/data/spellbook.json"

# Spells whose icon's file name says something else: the icons' own spelling, the spell's other name, or a stand-in.
declare -A ALIASES=(
  [fire_bolt]="firebolt"
  [eldritch_blast]="eldtrich blast"
  [chill_touch]="bone chill"
  [toll_the_dead]="toll of the dead"
  # No Fireball icon in the set: the closest look is Flaming Sphere's ball of fire.
  [fireball]="flaming sphere"
)

# A name to compare by: lower case, no apostrophes (spellbook.json writes some as "&#039;"), words split by single spaces.
normal() {
  tr '[:upper:]' '[:lower:]' <<<"$1" | sed -E "s/&#0?39;//g; s/['’]//g; s/[-_ ]+/ /g; s/^ //; s/ $//"
}

shopt -s nullglob

made=0
for input in "$icons"/*.png "$icons"/*.webp; do
  stem="$(basename "${input%.*}")"
  [[ "$stem" == *_pixelart ]] && continue
  stem="${stem%-150x150}"
  magick "$input" -scale 10% -filter point -resize 1000% "$icons/${stem}_pixelart.png"
  made=$((made + 1))
done
echo "pixelated $made icon(s)"

# Each copy's name in comparable form, worked out once.
copies=("$icons"/*_pixelart.png)
names=()
for copy in "${copies[@]}"; do names+=("$(normal "$(basename "$copy" _pixelart.png)")"); done

tmp="$(mktemp)"
cp "$list" "$tmp"
mapped=0
for id in $(jq -r '.spells | keys[]' "$list"); do
  want="${ALIASES[$id]:-$(normal "$(jq -r --arg id "$id" '.spells[$id].name' "$book")")}"
  icon=""
  for i in "${!copies[@]}"; do
    # The spell's name, then the end of the file name or another word: "heal" is not "healing word".
    if [[ "${names[$i]} " == "$want "* ]]; then icon="$(basename "${copies[$i]}")"; break; fi
  done
  if [[ -z "$icon" ]]; then
    echo "no icon for $id" >&2
    continue
  fi
  jq --indent 2 --arg id "$id" --arg img "spells-icons/$icon" '.spells[$id].img = $img' "$tmp" > "$tmp.next"
  mv "$tmp.next" "$tmp"
  mapped=$((mapped + 1))
done
mv "$tmp" "$list"
echo "mapped $mapped of $(jq '.spells | length' "$list") spell(s) in src/data/spell-list.json"
