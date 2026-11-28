#!/usr/bin/env bash
# Copies the condition icons into the game and pixelates them, as scripts/class-feature-icons.sh does the features'.
#
# scripts/download-condition-icons.py downloads them from bg3.wiki's Condition Icons category into
# scripts/bg3_condition_icons (Blinded.png, Hex.png…). This lays them in public/conditions, each named by its condition
# in lower case with dashes (blinded.png, tashas-hideous-laughter.png), and beside each a pixelated copy, shrunk to half
# and blown back up with hard edges to twice its size (very lightly pixelated: the 64 px icons keep their detail at 32 px;
# large enough for a tooltip), with "_pixelart" added (blinded_pixelart.png).
#
# The weapon actions' icons (scripts/download-weapon-action-icons.py) go the same way, given their folder and where under
# public/ they go: scripts/condition-icons.sh scripts/bg3_weapon_action_icons weapon-actions (lacerate.png, brace-melee.png).
#
# Needs ImageMagick (magick).  Usage: python3 scripts/download-condition-icons.py && scripts/condition-icons.sh
#                                     scripts/condition-icons.sh [<downloaded folder> <folder under public/>]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$root/${1:-scripts/bg3_condition_icons}"
icons="$root/public/${2:-conditions}"

# Shrunk to this share, then blown back up this much: half, four times over, is twice the original's size.
SHRINK=50%
GROW=400%

# Lower case, apostrophes dropped, every run of anything but letters and digits a dash.
slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -e "s/[’']//g" -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//'
}

[[ -d "$source_dir" ]] || { echo "no icons in $source_dir: download them first (scripts/download-*-icons.py)" >&2; exit 1; }
mkdir -p "$icons"

declare -A taken=()
made=0
while IFS= read -r -d '' input; do
  name="$(slug "$(basename "$input" .png)")"
  [[ -n "$name" ]] || continue
  # Two conditions whose names differ only in punctuation: one icon is enough.
  [[ -z "${taken[$name]:-}" ]] || continue
  taken[$name]=1
  cp "$input" "$icons/$name.png"
  magick "$input" -scale "$SHRINK" -filter point -resize "$GROW" "$icons/${name}_pixelart.png"
  made=$((made + 1))
done < <(find "$source_dir" -maxdepth 1 -name '*.png' -print0 | sort -z)
echo "copied and pixelated $made icon(s) into ${icons#"$root"/}"
