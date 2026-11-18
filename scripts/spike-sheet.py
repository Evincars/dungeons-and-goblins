#!/usr/bin/env python3
"""
Makes public/catacombs/spikes.png, the catacombs' spike trap (src/systems/TrapSystem.ts), from the five frames of
public/catacombs/spike_0.png … spike_4.png (13 px wide, 12 to 14 px tall as the spikes rise: four holes, then spikes
thrust up out of them). A trap fills one floor tile, so each frame of the sheet is a tile (FRAME px) holding the art
twice across and twice down, each copy padded to the tallest frame's height with its base at the bottom, so only the
spikes move.

    python3 scripts/spike-sheet.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / 'public' / 'catacombs' / f'spike_{i}.png' for i in range(5)]
OUT = ROOT / 'public' / 'catacombs' / 'spikes.png'

FRAME = 32
# Where the four copies' top-left corners lie in a frame (centred, a pixel or two of floor between them).
COPIES = [(3, 2), (16, 2), (3, 16), (16, 16)]


def main() -> None:
    frames = [Image.open(path).convert('RGBA') for path in SOURCES]
    tallest = max(frame.height for frame in frames)
    sheet = Image.new('RGBA', (FRAME * len(frames), FRAME), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        lift = tallest - frame.height
        for x, y in COPIES:
            sheet.alpha_composite(frame, (i * FRAME + x, y + lift))
    sheet.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)} ({len(frames)} frames of {FRAME} px)')


if __name__ == '__main__':
    main()
