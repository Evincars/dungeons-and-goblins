#!/usr/bin/env bash
# Copies the class feature icons into the game and pixelates them, as scripts/spell-icons.sh does the spells'.
#
# scripts/download-class-features-icons.py downloads them from bg3.wiki into scripts/bg3_class_features, by class,
# level and subclass (Fighter/Level 07/Champion/Remarkable Athlete - Jump.png). This lays them flat in
# public/class-features-icons, each named by its class, subclass (if any) and feature in lower case with dashes
# (fighter-champion-remarkable-athlete-jump.png), and beside each a pixelated copy, shrunk to a quarter and blown back
# up with hard edges to twice its size (lightly pixelated, large enough for a tooltip), with "_pixelart" added
# (fighter-champion-remarkable-athlete-jump_pixelart.png). The level is not in the name: a feature's icon is the same
# at whatever level it comes.
#
# Needs ImageMagick (magick).  Usage: python3 scripts/download-class-features-icons.py && scripts/class-feature-icons.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$root/scripts/bg3_class_features"
icons="$root/public/class-features-icons"

# Shrunk to this share, then blown back up this much: a quarter, eight times over, is twice the original's size.
SHRINK=25%
GROW=800%

# Lower case, apostrophes dropped, every run of anything but letters and digits a dash.
slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -e "s/[’']//g" -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//'
}

[[ -d "$source_dir" ]] || { echo "no icons in $source_dir: run scripts/download-class-features-icons.py first" >&2; exit 1; }
mkdir -p "$icons"

declare -A taken=()
made=0
while IFS= read -r -d '' input; do
  # <Class>/Level NN/[<Subclass>/]<Feature>.png
  rel="${input#"$source_dir"/}"
  IFS='/' read -r -a parts <<< "$rel"
  class="${parts[0]}"
  feature="$(basename "$input" .png)"
  subclass=""
  (( ${#parts[@]} == 4 )) && subclass="${parts[2]}"
  name="$(slug "$class${subclass:+ $subclass} $feature")"
  if [[ -n "${taken[$name]:-}" ]]; then
    # The same feature listed at two levels: one icon is enough.
    continue
  fi
  taken[$name]=1
  cp "$input" "$icons/$name.png"
  magick "$input" -scale "$SHRINK" -filter point -resize "$GROW" "$icons/${name}_pixelart.png"
  made=$((made + 1))
done < <(find "$source_dir" -mindepth 3 -name '*.png' -print0 | sort -z)
echo "copied and pixelated $made icon(s) into ${icons#"$root"/}"
