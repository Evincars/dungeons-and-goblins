#!/usr/bin/env python3
"""
Stáhne ikonky základních weapon actions z bg3.wiki (stránka „Weapon actions“, tabulky „Basic melee weapon actions“ a
„Basic ranged weapon actions“): Lacerate, Cleave, Topple, Hamstring Shot… Unikátní akce zbraní (Absolute Power…) bere jen
s --unique.

Ikonka akce je v prvním sloupci řádku tabulky (obrázek 40 px s alt = název akce); skript stáhne originál (ne zmenšeninu)
a uloží ho jako PNG pod názvem akce:

    bg3_weapon_action_icons/<Akce>.png          (Lacerate.png, Brace (Melee).png…)
    bg3_weapon_action_icons/manifest.json       (akce, soubor, zdroj)

Použití (potřebuje requests, beautifulsoup4 a Pillow):

    python3 scripts/download-weapon-action-icons.py            # základní akce, co ještě nejsou stažené
    python3 scripts/download-weapon-action-icons.py --clean    # nejdřív smaže výstup a stáhne znovu
    python3 scripts/download-weapon-action-icons.py --unique   # i unikátní akce zbraní

Pak `scripts/condition-icons.sh scripts/bg3_weapon_action_icons weapon-actions` je zkopíruje do public/weapon-actions
a zpixeluje.
"""
import json
import shutil
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module

# Stahování, názvy souborů a adresy originálů jsou tytéž jako u ikonek stavů.
conditions = import_module("download-condition-icons")

PAGE_URL = f"{conditions.BASE_URL}/wiki/Weapon_actions"
OUTPUT_DIR = Path(__file__).resolve().parent / "bg3_weapon_action_icons"

# Ikonka akce v tabulce je velká 40 px; menší jsou ikonky zbraní, stavů, akcí a hodů.
ACTION_ICON = "40"
# Nadpis, od kterého začínají unikátní akce zbraní.
UNIQUE_HEADING = "Unique weapon actions"


def original_url(src: str) -> str:
    """Adresa originálu místo zmenšeniny MediaWiki (…/thumb/a/a7/Cleave_Icon.webp/40px-Cleave_Icon.webp -> …/a/a7/Cleave_Icon.webp)."""
    url = src if src.startswith("http") else f"{conditions.BASE_URL}{src}"
    if "/thumb/" in url:
        prefix, rest = url.split("/thumb/", 1)
        url = f"{prefix}/{rest.rsplit('/', 1)[0]}"
    return url


def action_icons(unique: bool) -> list[dict]:
    """Ikonky akcí ze stránky, v pořadí stránky: název akce a adresa originálu."""
    resp = requests.get(PAGE_URL, headers=conditions.HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    content = soup.find(id="mw-content-text")
    icons: list[dict] = []
    seen: set[str] = set()
    for node in content.descendants:
        name = getattr(node, "name", None)
        if name in ("h2", "h3") and UNIQUE_HEADING in node.get_text(" ", strip=True) and not unique:
            break
        if name != "img" or node.get("width") != ACTION_ICON or not node.find_parent("table"):
            continue
        action = (node.get("alt") or "").strip()
        if not action or action in seen:
            continue
        seen.add(action)
        icons.append({"condition": action, "url": original_url(node.get("src", ""))})
    return icons


def main(argv: list[str]) -> None:
    if "--clean" in argv and OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    conditions.OUTPUT_DIR = OUTPUT_DIR
    print(f"=== {PAGE_URL} ===")
    manifest: list[dict] = []
    for icon in action_icons("--unique" in argv):
        try:
            print(f"  [{conditions.download(icon)}] {icon['condition']}")
        except (requests.RequestException, OSError) as error:
            print(f"  [ERR] {icon['condition']} ({icon['url']}): {error}")
            continue
        manifest.append({"action": icon["condition"], "url": icon["url"], "file": conditions.target_path(icon).name})
        time.sleep(conditions.DELAY)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"\nHotovo: {len(manifest)} ikonek. Manifest: {OUTPUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main(sys.argv[1:])
