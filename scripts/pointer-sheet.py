#!/usr/bin/env python3
"""
Makes public/ui/pointer.png, the game's pointers, from public/dng-pointer.png (2x2 pictures of 1024 px on a noisy,
nearly transparent ground): the hand over the HUD and menus, the hand pressing (sparks at its fingertip) over
something clickable, the battle cross in the world, and the red cross over an enemy. Each is cut from the same
square of its quarter, cleaned of the faint noise around it and scaled down to one frame of FRAME px, side by side
in that order. It prints each frame's hot spot (the fingertip, the cross's middle) for src/ui/Pointer.ts
(POINTER_FRAMES): keep the two in step.

    python3 scripts/pointer-sheet.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'dng-pointer.png'
OUT = ROOT / 'public' / 'ui' / 'pointer.png'

CELL = 1024
# Every picture lies inside this square of its quarter (the separator and the margins left out).
CROP = (112, 112, 912, 912)
FRAME = 64
# The ground's noise is faint (alpha under ~40); the art is solid.
SOLID = 128
# The order of the frames, and the quarter (column, row) each is cut from.
FRAMES = [('hand', 0, 0), ('hand_press', 1, 0), ('cross', 0, 1), ('cross_enemy', 1, 1)]


def cleaned(cell: Image.Image) -> Image.Image:
    """The picture alone: anything fainter than solid art is cleared."""
    alpha = cell.getchannel('A').point(lambda a: 255 if a >= SOLID else 0)
    out = cell.copy()
    out.putalpha(alpha)
    return out


def fingertip(cell: Image.Image) -> tuple[float, float]:
    """The hand's fingertip: the solid, not red (the sparks), pixel furthest up and to the left."""
    px = cell.load()
    best = None
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b, a = px[x, y]
            if a < SOLID or (r > 150 and g < 90):
                continue
            if best is None or x + y < best[0] + best[1]:
                best = (x, y)
    return best


def crossing(cell: Image.Image) -> tuple[float, float]:
    """The cross's middle: the middle of its widest row and of its tallest column."""
    alpha = cell.getchannel('A')
    w, h = cell.size
    rows = [sum(1 for x in range(w) if alpha.getpixel((x, y)) >= SOLID) for y in range(h)]
    cols = [sum(1 for y in range(h) if alpha.getpixel((x, y)) >= SOLID) for x in range(w)]
    # The bars are many pixels thick: the middle of the band of rows (columns) as wide (tall) as the widest.
    widest = max(rows)
    band = [y for y, n in enumerate(rows) if n >= widest * 0.95]
    tallest = max(cols)
    stem = [x for x, n in enumerate(cols) if n >= tallest * 0.95]
    return (sum(stem) / len(stem), sum(band) / len(band))


def main() -> None:
    source = Image.open(SOURCE).convert('RGBA')
    sheet = Image.new('RGBA', (FRAME * len(FRAMES), FRAME), (0, 0, 0, 0))
    scale = FRAME / (CROP[2] - CROP[0])
    for i, (name, col, row) in enumerate(FRAMES):
        cell = source.crop((col * CELL + CROP[0], row * CELL + CROP[1], col * CELL + CROP[2], row * CELL + CROP[3]))
        cell = cleaned(cell)
        spot = fingertip(cell) if name.startswith('hand') else crossing(cell)
        # Scaled with premultiplied alpha, so the cleared ground leaves no dark fringe.
        small = cell.convert('RGBa').resize((FRAME, FRAME), Image.LANCZOS).convert('RGBA')
        sheet.paste(small, (i * FRAME, 0))
        print(f'{name}: hot spot {spot[0] * scale:.1f}, {spot[1] * scale:.1f}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
