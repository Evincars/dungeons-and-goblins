import os
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup


def download_spells_icons(url, output_dir="bg3_spell_icons"):
    # Vytvoření cílové složky, pokud neexistuje
    os.makedirs(output_dir, exist_ok=True)

    # Hlavička User-Agent, aby požadavek vypadal jako z běžného prohlížeče
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }

    print(f"Načítám stránku: {url}")
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Chyba při načítání stránky: {e}")
        return

    soup = BeautifulSoup(response.text, "html.parser")

    # Vyhledání všech značek <img> na stránce
    img_tags = soup.find_all("img")
    print(f"Nalezeno {len(img_tags)} obrázků. Zahajuji stahování...")

    downloaded_count = 0

    for img in img_tags:
        # Získání URL obrázku (podpora standardního 'src' i lazy-load 'data-src')
        src = img.get("src") or img.get("data-src")
        if not src:
            continue

        # Převod případné relativní adresy na absolutní URL
        img_url = urljoin(url, src)

        # Získání názvu souboru z URL
        filename = os.path.basename(img_url.split("?")[0])

        # Pokud názvu chybí přípona nebo je neplatný, přeskočíme ho
        if not filename or not any(
            filename.lower().endswith(ext)
            for ext in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]
        ):
            continue

        filepath = os.path.join(output_dir, filename)

        # Stažení samotného obrázku
        try:
            img_data = requests.get(img_url, headers=headers).content
            with open(filepath, "wb") as f:
                f.write(img_data)
            downloaded_count += 1
            print(f"[{downloaded_count}] Staženo: {filename}")
        except Exception as e:
            print(f"Chyba při stahování {img_url}: {e}")

    print(
        f"\nHotovo! Celkem bylo staženo {downloaded_count} ikonek do složky '{output_dir}'."
    )


if __name__ == "__main__":
    target_url = "https://rpgwire.com/bg3/spells/"
    download_spells_icons(target_url)