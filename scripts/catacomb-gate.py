#!/usr/bin/env python3
"""
Makes public/catacombs/barred-gate.png, the barred gate set into the catacombs' north faces (the `barred_gate` prop of
src/level/Props.ts): the framed, barred opening at the top of public/catacombs/mainlevbuild.png (cols 31–36, rows 2–6),
three tiles wide. The art leaves the opening clear, so whatever the gate stands over would show between its bars: here
the opening is filled with the dark beyond.

    python3 scripts/catacomb-gate.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'catacombs' / 'mainlevbuild.png'
OUT = ROOT / 'public' / 'catacombs' / 'barred-gate.png'

# The gate (x, y, w, h) and its opening inside the frame, in the gate's own pixels (x0, y0, x1, y1).
GATE = (496, 32, 96, 80)
OPENING = (1, 4, 95, 60)
DARK = (10, 9, 12, 255)


def main() -> None:
    x, y, w, h = GATE
    gate = Image.open(SOURCE).convert('RGBA').crop((x, y, x + w, y + h))
    behind = Image.new('RGBA', gate.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = OPENING
    behind.paste(DARK, (x0, y0, x1, y1))
    behind.alpha_composite(gate)
    behind.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)} ({w}x{h})')


if __name__ == '__main__':
    main()
