#!/usr/bin/env bash
# Copies the potion, elixir, dye and grenade icons into the game and pixelates them, as scripts/condition-icons.sh does the
# conditions'.
#
# scripts/download-potion-icons.py downloads them from bg3.wiki's Potion icons, Elixir controller icons, Dye controller
# icons and Grenade controller icons categories into scripts/bg3_potion_icons/<potions|elixirs|dyes|grenades>. This lays
# each folder in public/potions/<the same folder>, each icon named by its item in lower case with dashes
# (potion-of-healing.png, alchemists-fire.png), and beside each a lightly pixelated copy with "_pixelart" added.
#
# Needs ImageMagick (magick).  Usage: python3 scripts/download-potion-icons.py && scripts/potion-icons.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
source_root="$here/bg3_potion_icons"

[[ -d "$source_root" ]] || { echo "no icons in $source_root: run scripts/download-potion-icons.py first" >&2; exit 1; }
for folder in potions elixirs dyes grenades; do
  [[ -d "$source_root/$folder" ]] || continue
  "$here/condition-icons.sh" "scripts/bg3_potion_icons/$folder" "potions/$folder"
done
