#!/usr/bin/env python3
"""
Stáhne ikonky lektvarů, elixírů, barviv a granátů (lahví k hození) z bg3.wiki, z kategorií:

    Category:Potion_icons               (Potion of Healing, Potion of Speed…)
    Category:Elixir_controller_icons    (Elixir of Bloodlust…)
    Category:Dye_controller_icons       (Ruby Red Dye…)
    Category:Grenade_controller_icons   (Alchemist's Fire, Grease Bottle, Smokepowder Bomb…)

Každou kategorii projde stránku po stránce (odkaz „next page“ pod galerií), stejně jako
download-condition-icons.py, a z každé položky galerie vezme originál souboru (ne zmenšeninu). Uloží je jako PNG pod
názvem předmětu (bez „ Icon“, „ Unfaded Icon“, „ controller“…), každou kategorii do vlastní podsložky:

    bg3_potion_icons/potions/<Lektvar>.png          (Potion of Healing.png…)
    bg3_potion_icons/elixirs/<Elixír>.png
    bg3_potion_icons/dyes/<Barvivo>.png
    bg3_potion_icons/grenades/<Granát>.png          (Alchemist's Fire.png, Grease Bottle.png…)
    bg3_potion_icons/manifest.json                  (kategorie, předmět, soubor, zdroj)

Použití (potřebuje requests, beautifulsoup4 a Pillow):

    python3 scripts/download-potion-icons.py                  # vše, co ještě není staženo
    python3 scripts/download-potion-icons.py --clean          # nejdřív smaže výstup a stáhne znovu
    python3 scripts/download-potion-icons.py grenades potions # jen vybrané kategorie

Pak `scripts/potion-icons.sh` je zkopíruje do public/potions (každou kategorii do své podsložky) a zpixeluje.
"""
import json
import re
import shutil
import sys
from pathlib import Path

import requests

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module

# Stránkování kategorie, galerie, stahování a názvy souborů jsou tytéž jako u ikonek stavů.
conditions = import_module("download-condition-icons")

OUTPUT_DIR = Path(__file__).resolve().parent / "bg3_potion_icons"

# Podsložka -> kategorie na wiki.
CATEGORIES = {
    "potions": "Potion_icons",
    "elixirs": "Elixir_controller_icons",
    "dyes": "Dye_controller_icons",
    "grenades": "Grenade_controller_icons",
}

# Přípony názvu souboru na wiki, které k názvu předmětu nepatří („Alchemist's Fire Icon.webp“,
# „Elixir of Bloodlust Unfaded Icon.png“, „Grease Bottle controller Icon (1).png“).
SUFFIX = re.compile(r"(\s+(unfaded|faded|controller|icon|detail|item|\(\d+\)))+$", re.IGNORECASE)
# A předpony z názvů souborů hry („POT Potion of Healing“, „GRN Alchemist's Fire“, „ELX Elixir of Heroism“,
# „Item LOOT Alchemy…“, „Item WPN Grenade…“, „COAT Karabasan's Poison“).
PREFIX = re.compile(r"^((item|loot|wpn|pot|grn|elx|coat)\s+)+", re.IGNORECASE)


def item_name(file_name: str) -> str:
    """„GRN_Alchemist's_Fire_Unfaded_Icon.webp“ -> „Alchemist's Fire“."""
    stem = file_name.rsplit(".", 1)[0].replace("_", " ")
    return PREFIX.sub("", SUFFIX.sub("", stem).strip()).strip()


def category_icons(folder: str, category: str) -> list[dict]:
    """Všechny ikonky jedné kategorie (po odkazech „next page“), pojmenované podle předmětu."""
    conditions.CATEGORY_URL = f"{conditions.BASE_URL}/w/index.php?title=Category:{category}"
    print(f"=== {conditions.CATEGORY_URL} ===")
    icons = conditions.all_icons()
    for icon in icons:
        icon["condition"] = item_name(icon["file_name"])
        icon["category"] = folder
    return icons


def main(argv: list[str]) -> None:
    if "--clean" in argv and OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    wanted = [a for a in argv if not a.startswith("--")] or list(CATEGORIES)
    manifest: list[dict] = []
    for folder in wanted:
        category = CATEGORIES.get(folder)
        if not category:
            print(f"neznámá kategorie {folder!r} (znám: {', '.join(CATEGORIES)})")
            continue
        conditions.OUTPUT_DIR = OUTPUT_DIR / folder
        taken: set[str] = set()
        for icon in category_icons(folder, category):
            # Dva soubory téhož předmětu (.png i .webp, vybledlá i nevybledlá ikonka): stačí jeden.
            key = conditions.sanitize(icon["condition"]).lower()
            if not key or key in taken:
                continue
            taken.add(key)
            try:
                print(f"  [{conditions.download(icon)}] {icon['condition']}")
            except (requests.RequestException, OSError) as error:
                print(f"  [ERR] {icon['condition']} ({icon['url']}): {error}")
                continue
            manifest.append({"category": folder, "item": icon["condition"], "url": icon["url"],
                             "file": f"{folder}/{conditions.target_path(icon).name}"})
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"\nHotovo: {len(manifest)} ikonek. Manifest: {OUTPUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main(sys.argv[1:])
