import os
import re
import time
from urllib.parse import urljoin, unquote
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://bg3.wiki"
PAGES = [
    "https://bg3.wiki/wiki/Fighter",
    "https://bg3.wiki/wiki/Wizard",
    "https://bg3.wiki/wiki/Rogue",
    "https://bg3.wiki/wiki/Cleric",
    "https://bg3.wiki/wiki/Sorcerer",
    "https://bg3.wiki/wiki/Barbarian",
]

OUTPUT_DIR = "bg3_class_features"

# bg3.wiki blokuje výchozí User-Agent knihovny requests (vrací 403)
HEADERS = {
    "User-Agent": "BG3IconDownloader/1.0 (personal project; Python requests)"
}

# Sekce, kde končí class features a začínají seznamy kouzel nebo patička
STOP_SECTIONS = {
    "spells",
    "spell list",
    "cantrips",
    "starting equipment",
    "equipment",
    "gallery",
    "external links",
    "see also",
    "references",
    "navigation",
}

# Obecné herní ikony, které nejsou samotnou class featurou
IGNORED_TITLES = {
    "action",
    "bonus action",
    "reaction",
    "movement",
    "class action",
    "spell slot",
    "level 1 spell slot",
    "level 2 spell slot",
    "level 3 spell slot",
    "level 4 spell slot",
    "level 5 spell slot",
    "level 6 spell slot",
    "sorcery point",
    "sorcery points",
    "ki point",
    "superiority die",
    "bardic inspiration",
    "channel divinity charge",
    "rage charge",
    "hit points",
    "armour class",
    "proficiency",
}


def sanitize_filename(name: str) -> str:
    """Převede název featury na bezpečný název souboru .png."""
    name = name.strip()
    # Odstranění případných závorek typu "(class feature)"
    name = re.sub(r"\s*\(.*?\)\s*$", "", name)
    # Odstranění znaků zakázaných ve Windows/Linux názvech souborů
    name = re.sub(r'[<>:"/\\|?*]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return f"{name}.png"


def get_full_res_png_url(img_src: str) -> str | None:
    """
    Převede MediaWiki thumbnail URL na plné rozlišení PNG.
    Např.:
      /w/images/thumb/a/ab/Archery_Icon.png/40px-Archery_Icon.png
      -> https://bg3.wiki/w/images/a/ab/Archery_Icon.png
    """
    full_url = urljoin(BASE_URL, img_src)

    if "/thumb/" in full_url:
        # Rozdělí podle /thumb/ a odřízne poslední segment (např. /40px-Nazev.png)
        prefix, rest = full_url.split("/thumb/", 1)
        original_path = rest.rsplit("/", 1)[0]
        full_url = f"{prefix}/{original_path}"

    # Zkontroluje, že jde skutečně o PNG
    clean_path = full_url.split("?")[0].lower()
    if not clean_path.endswith(".png"):
        return None

    return full_url


def extract_feature_name(img_tag, parent_a) -> str | None:
    """Získá čistý název class featury z odkazu <a> nebo atributu <img>."""
    raw_name = ""

    if parent_a and parent_a.get("title"):
        raw_name = parent_a["title"]
    elif img_tag.get("alt"):
        raw_name = img_tag["alt"]
    else:
        src = img_tag.get("src", "")
        filename = unquote(src.split("/")[-1])
        filename = re.sub(r"^\d+px-", "", filename)
        filename = re.sub(r"_Icon\.png$|\.png$", "", filename, flags=re.IGNORECASE)
        raw_name = filename.replace("_", " ")

    raw_name = raw_name.strip()
    if not raw_name:
        return None

    # Odfiltrování odkazů na soubory (File:...) a obecných UI ikon
    if raw_name.lower().startswith("file:"):
        return None
    if raw_name.lower() in IGNORED_TITLES:
        return None
    if "spell slot" in raw_name.lower() or "class icon" in raw_name.lower():
        return None

    return raw_name


def scrape_class_features(page_url: str):
    class_name = page_url.rstrip("/").split("/")[-1]
    print(f"\n=== Zpracovávám: {class_name} ({page_url}) ===")

    resp = requests.get(page_url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    content = soup.find("div", class_="mw-parser-output")
    if not content:
        print(f"[!] Nenalezen obsah stránky pro {class_name}")
        return

    class_dir = os.path.join(OUTPUT_DIR, class_name)
    os.makedirs(class_dir, exist_ok=True)

    in_progression = False
    downloaded = {}  # feature_name -> url

    # Procházíme elementy v hlavním obsahu stránky od "Class progression" po "Spells"
    for element in content.children:
        if not getattr(element, "name", None):
            continue

        # Detekce nadpisů (v MediaWiki bývají h2/h3 nebo div.mw-heading)
        heading_text = ""
        if element.name in ("h2", "h3"):
            heading_text = element.get_text(" ", strip=True)
        elif element.name == "div" and "mw-heading" in element.get("class", []):
            heading_text = element.get_text(" ", strip=True)

        if heading_text:
            clean_heading = re.sub(r"\[edit\]", "", heading_text, flags=re.IGNORECASE).strip().lower()

            if "class progression" in clean_heading or clean_heading == "level 1":
                in_progression = True
            elif any(stop in clean_heading for stop in STOP_SECTIONS):
                # Jakmile narazíme na Spells / Equipment apod., končíme
                if in_progression:
                    break

        if not in_progression:
            continue

        # Hledáme obrázky uvnitř sekce progrese
        for img in element.find_all("img"):
            # Ignorujeme obrázky uvnitř případných vnořených spell tabulek
            if img.find_parent("table", class_=lambda c: c and "spell" in " ".join(c).lower()):
                continue

            src = img.get("src", "")
            if "/w/images/" not in src:
                continue

            # Přeskočíme miniaturní dekorace (např. šipky < 20px)
            width = img.get("width")
            if width and width.isdigit() and int(width) < 20:
                continue

            parent_a = img.find_parent("a")
            feature_name = extract_feature_name(img, parent_a)
            if not feature_name:
                continue

            png_url = get_full_res_png_url(src)
            if not png_url:
                continue

            if feature_name not in downloaded:
                downloaded[feature_name] = png_url

    # Stažení nalezených ikon
    for feature_name, png_url in downloaded.items():
        filename = sanitize_filename(feature_name)
        filepath = os.path.join(class_dir, filename)

        if os.path.exists(filepath):
            print(f"  [SKIP] {filename} už existuje")
            continue

        try:
            img_resp = requests.get(png_url, headers=HEADERS, timeout=20)
            img_resp.raise_for_status()
            with open(filepath, "wb") as f:
                f.write(img_resp.content)
            print(f"  [OK] {filename}")
            time.sleep(0.15)  # Šetrné prodlevy vůči serveru wiki
        except Exception as e:
            print(f"  [ERR] {filename} ({png_url}): {e}")

    print(f"Hotovo pro {class_name}: celkem {len(downloaded)} ikon.")


if __name__ == "__main__":
    for url in PAGES:
        scrape_class_features(url)