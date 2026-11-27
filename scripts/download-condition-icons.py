#!/usr/bin/env python3
"""
Stáhne ikonky stavů (conditions) z bg3.wiki, z kategorie „Condition Icons“, stránku po stránce.

Kategorie ukazuje 200 souborů na stránku; pod galerií je odkaz „next page“
(/w/index.php?title=Category:Condition_Icons&filefrom=…#mw-category-media). Skript po nich jde, dokud další stránka
není, a z každé položky galerie (li.gallerybox) vezme originál souboru (a.mw-file-source, ne zmenšeninu).

Wiki je ukládá jako .webp nebo .png; skript je uloží jako PNG pod názvem stavu (bez „ Condition Icon“):

    bg3_condition_icons/<Stav>.png              (Blinded.png, Hex.png, Bleeding.png…)
    bg3_condition_icons/manifest.json           (stav, soubor, zdroj)

Použití (potřebuje requests, beautifulsoup4 a Pillow):

    python3 scripts/download-condition-icons.py                     # vše, co ještě není staženo
    python3 scripts/download-condition-icons.py --clean             # nejdřív smaže výstup a stáhne znovu
    python3 scripts/download-condition-icons.py Blinded Prone Hex   # jen vybrané stavy (podle názvu)

Pak scripts/condition-icons.sh je zkopíruje do public/conditions a zpixeluje.
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
CATEGORY_URL = f"{BASE_URL}/w/index.php?title=Category:Condition_Icons"

OUTPUT_DIR = Path(__file__).resolve().parent / "bg3_condition_icons"

# bg3.wiki blokuje výchozí User-Agent knihovny requests (vrací 403).
HEADERS = {"User-Agent": "BG3IconDownloader/1.0 (personal project; Python requests)"}

# Přípona názvu souboru na wiki, která k názvu stavu nepatří.
SUFFIX = re.compile(r"\s*Condition Icon(\s*\(\d+\))?$", re.IGNORECASE)

# Pojistka proti zacyklení stránkování.
MAX_PAGES = 100

# Šetrná prodleva mezi požadavky na wiki (s).
DELAY = 0.2


def sanitize(name: str) -> str:
    """Název stavu jako název souboru (dvojtečka zakázaná ve Windows se mění na „ -“)."""
    name = name.replace(":", " -")
    name = re.sub(r'[<>"/\\|?*]', "", name)
    return re.sub(r"\s+", " ", name).strip()


def condition_name(file_name: str) -> str:
    """„Blinded Condition Icon.webp“ -> „Blinded“."""
    stem = file_name.rsplit(".", 1)[0].replace("_", " ")
    return SUFFIX.sub("", stem).strip()


def gallery_icons(soup) -> list[dict]:
    """Položky galerie jedné stránky kategorie: název stavu a adresa originálu."""
    media = soup.find(id="mw-category-media") or soup
    icons: list[dict] = []
    for box in media.select("li.gallerybox"):
        source = box.select_one("a.mw-file-source")
        caption = box.select_one("a.galleryfilename")
        if not source or not source.get("href"):
            continue
        url = urljoin(BASE_URL, source["href"])
        file_name = caption.get_text(strip=True) if caption else unquote(url.rsplit("/", 1)[-1])
        icons.append({"condition": condition_name(file_name), "file_name": file_name, "url": url})
    return icons


def next_page(soup) -> str | None:
    """Adresa další stránky galerie (odkaz „next page“), nebo None na poslední stránce."""
    media = soup.find(id="mw-category-media") or soup
    link = media.find("a", string=re.compile(r"^\s*next page\s*$"))
    return urljoin(BASE_URL, link["href"]) if link and link.get("href") else None


def all_icons() -> list[dict]:
    """Projde kategorii stránku po stránce (po odkazech „next page“) a vrátí všechny ikonky."""
    icons: list[dict] = []
    url: str | None = CATEGORY_URL
    seen_pages: set[str] = set()
    while url and url not in seen_pages and len(seen_pages) < MAX_PAGES:
        seen_pages.add(url)
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        page = gallery_icons(soup)
        print(f"  stránka {len(seen_pages)}: {len(page)} ikonek")
        icons.extend(page)
        url = next_page(soup)
        time.sleep(DELAY)
    return icons


def target_path(icon: dict) -> Path:
    return OUTPUT_DIR / f"{sanitize(icon['condition'])}.png"


def download(icon: dict) -> str:
    """Stáhne ikonku stavu jako PNG (není-li už stažená); vrátí, co se stalo."""
    path = target_path(icon)
    if path.exists():
        return "SKIP"
    resp = requests.get(icon["url"], headers=HEADERS, timeout=30)
    resp.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    if unquote(icon["url"]).lower().endswith(".png"):
        path.write_bytes(resp.content)
    else:
        Image.open(io.BytesIO(resp.content)).save(path, "PNG")
    time.sleep(DELAY)
    return "OK"


def main(argv: list[str]) -> None:
    clean = "--clean" in argv
    wanted = {a.lower() for a in argv if not a.startswith("--")}
    if clean and OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    print(f"=== {CATEGORY_URL} ===")
    icons = all_icons()
    if wanted:
        icons = [i for i in icons if i["condition"].lower() in wanted]

    manifest: list[dict] = []
    taken: set[str] = set()
    for icon in icons:
        # Dva soubory téhož stavu (.png i .webp): stačí jeden.
        key = sanitize(icon["condition"]).lower()
        if key in taken:
            continue
        taken.add(key)
        try:
            print(f"  [{download(icon)}] {icon['condition']}")
        except (requests.RequestException, OSError) as error:
            print(f"  [ERR] {icon['condition']} ({icon['url']}): {error}")
            continue
        manifest.append({**icon, "file": target_path(icon).name})

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"\nHotovo: {len(manifest)} ikonek. Manifest: {manifest_path}")


if __name__ == "__main__":
    main(sys.argv[1:])
