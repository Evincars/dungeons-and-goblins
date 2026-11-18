#!/usr/bin/env python3
"""
Stáhne ikonky class featur z bg3.wiki, level po levelu, pro každou třídu v PAGES.

Bere jen to, co stránka třídy uvádí v sekci „Level progression“ (div.level-progression) jako featuru:
obrázek, který je odkazem na featuru a je velký 30–99 px. Tak projdou:
  - featury třídy (Second Wind, Action Surge, Extra Attack, Indomitable…),
  - volby k featuře (styly boje: Archery, Defence, Duelling…; Metamagic; Divine Intervention…),
  - featury podtříd z tabulek „Subclass features“ (Curving Shot, War Magic, Remarkable Athlete…).
A neprojdou drobné ikonky v textu (akce, bonusová akce, sloty kouzel, kostky přesily, Arcane Arrows,
kouzla zmíněná v popisu; ty mají do 28 px), ani velké odznaky podtříd (100–150 px).

Wiki ukládá ikonky jako .webp; skript stáhne originál (ne zmenšeninu) a uloží ho jako PNG:

    bg3_class_features/<Třída>/Level 01/<Featura>.png
    bg3_class_features/<Třída>/Level 07/<Podtřída>/<Featura>.png
    bg3_class_features/manifest.json   (třída, level, podtřída, featura, soubor, zdroj)

Použití (potřebuje requests, beautifulsoup4 a Pillow):

    python3 scripts/download-class-features-icons.py            # vše, co ještě není staženo
    python3 scripts/download-class-features-icons.py --clean    # nejdřív smaže výstup tříd a stáhne znovu
    python3 scripts/download-class-features-icons.py Fighter    # jen vybrané třídy
"""
import io
import json
import re
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image

BASE_URL = "https://bg3.wiki"
CLASSES = ["Fighter", "Wizard", "Rogue", "Cleric", "Sorcerer", "Barbarian"]
PAGES = {name: f"{BASE_URL}/wiki/{name}" for name in CLASSES}

OUTPUT_DIR = Path(__file__).resolve().parent / "bg3_class_features"

# bg3.wiki blokuje výchozí User-Agent knihovny requests (vrací 403).
HEADERS = {"User-Agent": "BG3IconDownloader/1.0 (personal project; Python requests)"}

# Ikonka featury je v tabulce i v textu velká 30 nebo 40 px; menší jsou ikonky v textu, větší odznaky podtříd.
MIN_ICON = 30
MAX_ICON = 99

# Šetrná prodleva mezi požadavky na wiki (s).
DELAY = 0.2


def sanitize(name: str) -> str:
    """Název featury jako název souboru (dvojtečka zakázaná ve Windows se mění na „ -“)."""
    name = name.replace(":", " -")
    name = re.sub(r'[<>"/\\|?*]', "", name)
    return re.sub(r"\s+", " ", name).strip()


def original_url(src: str) -> str:
    """
    Adresa originálu místo zmenšeniny MediaWiki:
      /w/images/thumb/9/95/Second_Wind_Icon.webp/40px-Second_Wind_Icon.webp -> https://bg3.wiki/w/images/9/95/Second_Wind_Icon.webp
    """
    url = urljoin(BASE_URL, src)
    if "/thumb/" in url:
        prefix, rest = url.split("/thumb/", 1)
        url = f"{prefix}/{rest.rsplit('/', 1)[0]}"
    return url


def level_of(heading) -> int | None:
    """Číslo levelu z nadpisu „Level 7 [edit section …]“."""
    match = re.match(r"\s*Level\s+(\d+)", heading.get_text(" ", strip=True))
    return int(match.group(1)) if match else None


def is_header_row(row) -> bool:
    """Řádek samých záhlaví (názvy podtříd nad jejich sloupci)."""
    cells = row.find_all(["th", "td"], recursive=False)
    return bool(cells) and all(c.name == "th" for c in cells)


def table_place(img) -> tuple[str | None, str | None]:
    """
    Kde v tabulce featur podtříd ikonka leží: (podtřída, záhlaví jejího sloupce). Podtřídy jsou buď sloupci (název
    v záhlaví sloupce nad ní; tabulka může mít víc bloků, každý se svým řádkem záhlaví: 8 domén Klerika po čtyřech),
    nebo řádky (název v záhlaví řádku, sloupce jsou „Features“, „Domain spells“…: domény Klerika na levelu 1). Mimo
    tabulku (featura celé třídy) (None, None).
    """
    cell = img.find_parent("td")
    table = img.find_parent("table")
    if not cell or not table:
        return None, None
    row = cell.find_parent("tr")
    header = row if is_header_row(row) else next((r for r in row.find_previous_siblings("tr") if is_header_row(r)), None)
    heads = header.find_all(["th", "td"], recursive=False) if header else []
    column = len(cell.find_previous_siblings(["td", "th"]))
    column_head = heads[column].get_text(" ", strip=True) if column < len(heads) else None
    row_head = cell.find_parent("tr").find(["th", "td"], recursive=False)
    if row_head is not None and row_head.name == "th":
        return row_head.get_text(" ", strip=True) or None, column_head
    return column_head, None


def subclass_of(img) -> str | None:
    """Podtřída featury, je-li v tabulce featur podtříd (jinak None: featura celé třídy)."""
    return table_place(img)[0]


def in_spell_column(img) -> bool:
    """Ikonka ve sloupci kouzel podtřídy (domain spells): kouzlo, ne featura."""
    column = table_place(img)[1]
    return bool(column) and "spell" in column.lower()


def feature_icon(img) -> tuple[str, str] | None:
    """Název featury a adresa originálu její ikonky, je-li obrázek ikonkou featury; jinak None."""
    width = img.get("width", "")
    if not width.isdigit() or not MIN_ICON <= int(width) <= MAX_ICON:
        return None
    link = img.find_parent("a")
    title = link.get("title", "").strip() if link else ""
    src = img.get("src", "")
    if not title or title.lower().startswith("file:") or "/w/images/" not in src:
        return None
    return title, original_url(src)


def class_features(class_name: str) -> list[dict]:
    """Featury třídy ze stránky wiki, v pořadí stránky: level, podtřída, název a adresa ikonky."""
    resp = requests.get(PAGES[class_name], headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    progression = soup.find("div", class_="level-progression")
    if not progression:
        raise RuntimeError(f"Na stránce {class_name} není sekce Level progression")

    features: list[dict] = []
    seen: set[tuple] = set()
    level = None
    for node in progression.descendants:
        name = getattr(node, "name", None)
        if name == "h3":
            level = level_of(node) or level
            continue
        if name != "img" or level is None:
            continue
        icon = feature_icon(node)
        if not icon or in_spell_column(node):
            continue
        title, url = icon
        subclass = subclass_of(node)
        key = (level, subclass, title)
        if key in seen:
            continue
        seen.add(key)
        features.append({"class": class_name, "level": level, "subclass": subclass, "feature": title, "url": url})
    return features


def target_path(feature: dict) -> Path:
    path = OUTPUT_DIR / feature["class"] / f"Level {feature['level']:02d}"
    if feature["subclass"]:
        path /= sanitize(feature["subclass"])
    return path / f"{sanitize(feature['feature'])}.png"


def download(feature: dict) -> str:
    """Stáhne ikonku featury jako PNG (není-li už stažená); vrátí, co se stalo."""
    path = target_path(feature)
    if path.exists():
        return "SKIP"
    resp = requests.get(feature["url"], headers=HEADERS, timeout=30)
    resp.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    unquoted = unquote(feature["url"]).lower()
    if unquoted.endswith(".png"):
        path.write_bytes(resp.content)
    else:
        Image.open(io.BytesIO(resp.content)).save(path, "PNG")
    time.sleep(DELAY)
    return "OK"


def main(argv: list[str]) -> None:
    clean = "--clean" in argv
    wanted = [a for a in argv if not a.startswith("--")] or CLASSES
    unknown = [c for c in wanted if c not in PAGES]
    if unknown:
        sys.exit(f"Neznámá třída: {', '.join(unknown)} (známé: {', '.join(CLASSES)})")

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    manifest = [m for m in manifest if m["class"] not in wanted]

    for class_name in wanted:
        print(f"\n=== {class_name} ({PAGES[class_name]}) ===")
        if clean and (OUTPUT_DIR / class_name).exists():
            shutil.rmtree(OUTPUT_DIR / class_name)
        features = class_features(class_name)
        for feature in features:
            label = f"L{feature['level']:>2} {feature['subclass'] + ': ' if feature['subclass'] else ''}{feature['feature']}"
            try:
                print(f"  [{download(feature)}] {label}")
            except (requests.RequestException, OSError) as error:
                print(f"  [ERR] {label} ({feature['url']}): {error}")
                continue
            manifest.append({**feature, "file": str(target_path(feature).relative_to(OUTPUT_DIR))})
        print(f"Hotovo: {class_name}, {len(features)} featur.")
        time.sleep(DELAY)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"\nManifest: {manifest_path}")


if __name__ == "__main__":
    main(sys.argv[1:])
