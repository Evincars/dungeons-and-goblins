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


# Features bg3.wiki has no icon of their own for (the Battle Master's maneuvers, Spellcasting, Arcane Tradition…): each shows
# an icon of another feature with a name like it, from any class's page, that no other feature shows (checked below).
BORROWED = {
    "fighter": {
        "fighting_style": "barbarian-reckless-attack",
        "additional_fighting_style": "barbarian-berserker-enraged-throw",
        "martial_archetype": "barbarian-berserker-frenzy",
        "champion": "fighter-champion-remarkable-athlete-proficiency",
        "battle_master": "barbarian-giant-mighty-impel",
        "eldritch_knight": "fighter-arcane-archer-magic-arrow",
        "spellcasting_knight": "sorcerer-create-spell-slot",
        "arcane_charge": "fighter-arcane-archer-curving-shot",
        "student_of_war": "barbarian-feral-instinct",
        "know_your_enemy": "cleric-knowledge-domain-read-thoughts",
        "commanders_strike": "barbarian-berserker-frenzied-strike",
        "disarming_attack": "rogue-swashbuckler-dirty-trick-flick-o-the-wrist",
        "distracting_strike": "rogue-swashbuckler-dirty-trick-sand-toss",
        "evasive_footwork": "rogue-swashbuckler-fancy-footwork",
        "feinting_attack": "rogue-swashbuckler-panache",
        "goading_attack": "rogue-swashbuckler-dirty-trick-vicious-mockery",
        "lunging_attack": "rogue-swashbuckler-rakish-sneak-attack-melee",
        "maneuvering_attack": "rogue-cunning-action-disengage",
        "menacing_attack": "barbarian-berserker-intimidating-presence",
        "parry": "barbarian-unarmoured-defence-barbarian",
        "precision_attack": "rogue-swashbuckler-rakish-sneak-attack-ranged",
        "pushing_attack": "barbarian-giant-boot-of-the-giants",
        "rally": "cleric-divine-intervention-arm-thy-servant",
        "riposte": "rogue-swashbuckler-rakish-audacity",
        "sweeping_attack": "barbarian-giant-elemental-cleaver",
        "trip_attack": "rogue-thief-second-story-work-falling",
        "relentless": "barbarian-relentless-rage",
        "survivor": "cleric-divine-intervention-opulent-revival",
    },
    "rogue": {
        "expertise": "rogue-assassin-infiltration-expertise",
        "thieves_cant": "rogue-thief-fast-hands",
        "blindsense": "sorcerer-shadow-magic-eyes-of-the-dark",
        "slippery_mind": "rogue-arcane-trickster-mage-hand-legerdemain",
        "elusive": "rogue-thief-supreme-sneak",
        "stroke_of_luck": "sorcerer-wild-magic-bend-luck",
    },
    "cleric": {
        "spellcasting": "cleric-knowledge-domain-potent-spellcasting",
        "supreme_healing": "cleric-divine-intervention-golden-generosity",
    },
    "wizard": {
        "spellcasting": "cleric-light-domain-potent-spellcasting",
        "arcane_tradition": "barbarian-wild-magic-magic-awareness",
        "arcane_recovery_charge_3": "sorcerer-create-sorcery-points",
        "arcane_recovery_charge_5": "sorcerer-metamagic-quickened-spell",
        "arcane_recovery_charge_7": "sorcerer-metamagic-extended-spell",
        "arcane_recovery_charge_9": "sorcerer-metamagic-distant-spell",
        "arcane_recovery_charge_11": "sorcerer-metamagic-twinned-spell",
        "additional_cantrip_4": "sorcerer-metamagic-careful-spell",
        "additional_cantrip_10": "sorcerer-metamagic-subtle-spell",
        "spell_mastery": "sorcerer-metamagic-heightened-spell",
        "signature_spells": "sorcerer-wild-magic-controlled-chaos",
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
        for fid, stem in BORROWED.get(cls, {}).items():
            file = f"{stem}_pixelart.png"
            if fid in icons:
                raise SystemExit(f"{cls}.{fid} has an icon of its own: drop it from BORROWED")
            if not (ICONS / file).exists():
                raise SystemExit(f"{cls}.{fid}: {file} is not in {ICONS.relative_to(ROOT)}")
            icons[fid] = f"class-features-icons/{file}"
        out[cls] = icons
        print(f"{cls}: {len(icons)} of {len(features.get(cls, []))} features have an icon")
    borrowed = [f"{stem}_pixelart.png" for table in BORROWED.values() for stem in table.values()]
    shown = [path.split("/")[-1] for icons in out.values() for path in icons.values()]
    twice = sorted({f for f in borrowed if shown.count(f) > 1})
    if twice:
        raise SystemExit(f"borrowed icons shown by more than one feature: {', '.join(twice)}")
    OUT.write_text(json.dumps({"$comment": "Made by scripts/feature-icons.py: each class feature's icon under public/, by class and feature id (src/data/features.json).", **out}, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
