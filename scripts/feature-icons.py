#!/usr/bin/env python3
"""
Writes src/data/feature-icons.json: the icon of each class feature of src/data/features.json, by class and feature id,
from the icons in public/class-features-icons (scripts/class-feature-icons.sh lays them there; their manifest,
scripts/bg3_class_features/manifest.json, says which feature of bg3.wiki each one is).

A feature takes the icon whose bg3.wiki feature has the same name (in any of its class's subclasses); the few named
otherwise in Baldur's Gate 3, or shown by the icon of a feature they grow from, are in ALIASES. A feature with neither
has no icon (the Skills tab and the quick bar show its initials). The pixelated copy is used, as for the spells.

    python3 scripts/feature-icons.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ROOT / "src" / "data" / "features.json"
MANIFEST = ROOT / "scripts" / "bg3_class_features" / "manifest.json"
ICONS = ROOT / "public" / "class-features-icons"
OUT = ROOT / "src" / "data" / "feature-icons.json"

# The classes of features.json and their pages on bg3.wiki.
CLASSES = {"fighter": "Fighter", "rogue": "Rogue", "cleric": "Cleric", "wizard": "Wizard"}

# features.json id -> the bg3.wiki feature (its name, as in the manifest) whose icon it shows.
ALIASES = {
    "fighter": {
        "defense": "Defence",
        "dueling": "Duelling",
        "improved_critical": "Improved Critical Hit",
        "superior_critical": "Improved Critical Hit",
        "remarkable_athlete": "Remarkable Athlete: Jump",
        "extra_attack_3": "Improved Extra Attack",
        "improved_war_magic": "War Magic",
        "combat_superiority": "Improved Combat Superiority",
    },
    "rogue": {
        "sneak_attack": "Sneak Attack (Melee)",
        "cunning_action": "Cunning Action: Dash",
    },
    "cleric": {
        "channel_divinity": "Preserve Life",
        "divine_strike": "Divine Strike: Radiant",
    },
    "wizard": {
        "third_eye_darkvision": "Third Eye: Darkvision",
        "third_eye_see_invisibility": "Third Eye: See Invisibility",
        "see_invisibility": "See Invisibility (class action)",
        "animate_dead_zombie": "Undead Thralls: Animate Dead",
        "animate_dead_skeleton": "Undead Thralls: Animate Dead",
        "undead_thralls": "Undead Thralls: Additional Undead",
        "transmuters_stone_speed": "Transmuter's Stone",
        "transmuters_stone_constitution": "Transmuter's Stone",
        "bladesong_climax": "Bladesong",
    },
}


def slug(text: str) -> str:
    """As scripts/class-feature-icons.sh names the files: lower case, apostrophes dropped, the rest dashes."""
    text = re.sub(r"[’']", "", text.lower())
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def icon_file(entry: dict) -> str:
    """The pixelated icon public/class-features-icons holds for a manifest entry."""
    parts = [entry["class"]] + ([entry["subclass"]] if entry["subclass"] else []) + [entry["feature"]]
    return f"{slug(' '.join(parts))}_pixelart.png"


def main() -> None:
    features = json.loads(FEATURES.read_text())["classes"]
    manifest = json.loads(MANIFEST.read_text())
    out: dict[str, dict[str, str]] = {}
    for cls, page in CLASSES.items():
        # The class's bg3.wiki features by name (the first, the lowest level, where a name comes twice).
        by_name: dict[str, str] = {}
        for entry in manifest:
            if entry["class"] == page:
                by_name.setdefault(slug(entry["feature"]), icon_file(entry))
        icons: dict[str, str] = {}
        for feature in features.get(cls, []):
            wanted = ALIASES.get(cls, {}).get(feature["id"], feature["name"])
            file = by_name.get(slug(wanted))
            if not file:
                continue
            if not (ICONS / file).exists():
                raise SystemExit(f"{cls}.{feature['id']}: {file} is not in {ICONS.relative_to(ROOT)} (run scripts/class-feature-icons.sh)")
            icons[feature["id"]] = f"class-features-icons/{file}"
        out[cls] = icons
        print(f"{cls}: {len(icons)} of {len(features.get(cls, []))} features have an icon")
    OUT.write_text(json.dumps({"$comment": "Made by scripts/feature-icons.py: each class feature's icon under public/, by class and feature id (src/data/features.json).", **out}, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
