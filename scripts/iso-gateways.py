#!/usr/bin/env python3
"""
Makes public/castle-izometric/gateways.png: the isometric castle's gateways, set where a straight corridor two tiles wide
leaves a room through its north wall (src/level/generators/IsoDresser.ts, drawn as the iso_gate_* props of
src/level/Props.ts). Its art (public/castle-izometric/mainlevbuild1.png) is drawn for walls on the slant; each gateway is
made of its straight pieces, one frame each, side by side:

  0  the arch: the straight span of the arcade at the top left of the sheet, two pillars and the lintel over a way
     64 px (two tiles) wide, walked under;
  1  the arch with its doors standing open, swung back against the wall either side (the red leaves at the ends of the
     doorway walls at the sheet's top right);
  2  the arch barred: a row of the grate's bars under it (from the barred corner below the doors), seen through, never
     walked through.

The arch lies centred in each FRAME_W × FRAME_H frame, its pillars' feet on the frame's foot; whatever stands behind it
(the leaves, the bars) is laid first.

    python3 scripts/iso-gateways.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'castle-izometric' / 'mainlevbuild1.png'
OUT = ROOT / 'public' / 'castle-izometric' / 'gateways.png'

FRAME_W = 160
FRAME_H = 84
# The straight arch (x, y, w, h): pillars 17 px wide either side of a 64 px way.
ARCH = (199, 144, 98, 83)
# The open leaves: the left one (its near end to the left) and its mirror on the right.
LEAF_LEFT = (533, 19, 25, 80)
LEAF_RIGHT = (946, 19, 26, 80)
LEAF_TUCK = 3
# One bar of the grate (a stretch of its body, under the rail), stacked from the frame's foot up under the lintel
# (BAR_TOP px below the arch's top), and where bars stand across the way, from the arch's left edge.
BAR = (730, 405, 9, 50)
BAR_TOP = 6
BAR_XS = [21, 37, 53, 69]
# The leaves are cut with a piece of the slanted lintel crossing their tops: it is cleared, and what of the leaf lay above
# it (a pixel this close to grey and this bright is stone, not the leaf's dark red, its teal edge or its black outline).
GREY_SPREAD = 12
GREY_MIN = 36


def piece(sheet: Image.Image, rect: tuple[int, int, int, int]) -> Image.Image:
    x, y, w, h = rect
    return sheet.crop((x, y, x + w, y + h))


def leaf(sheet: Image.Image, rect: tuple[int, int, int, int]) -> Image.Image:
    """A door leaf alone: in each column, everything down to the lowest grey of the lintel crossing it is cleared, so its
    top follows the lintel's slant."""
    out = piece(sheet, rect)
    px = out.load()
    for x in range(out.width):
        lowest = -1
        for y in range(out.height):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < GREY_SPREAD and max(r, g, b) >= GREY_MIN:
                lowest = y
        for y in range(lowest + 1):
            px[x, y] = (0, 0, 0, 0)
    return out


def bars(sheet: Image.Image, height: int) -> Image.Image:
    """A bar `height` px tall: copies of its body stacked from the foot up, the top one cut short."""
    body = piece(sheet, BAR)
    out = Image.new('RGBA', (body.width, height), (0, 0, 0, 0))
    y = height
    while y > 0:
        y -= body.height
        out.alpha_composite(body.crop((0, max(0, -y), body.width, body.height)), (0, max(0, y)))
    return out


def main() -> None:
    sheet = Image.open(SOURCE).convert('RGBA')
    arch = piece(sheet, ARCH)
    arch_x = (FRAME_W - arch.width) // 2
    arch_y = FRAME_H - arch.height
    out = Image.new('RGBA', (FRAME_W * 3, FRAME_H), (0, 0, 0, 0))

    # The doors: each leaf stands against the outside of its pillar (tucked LEAF_TUCK px behind it), foot on the frame's foot.
    left = leaf(sheet, LEAF_LEFT)
    right = leaf(sheet, LEAF_RIGHT)
    out.alpha_composite(left, (FRAME_W + arch_x - left.width + LEAF_TUCK, FRAME_H - left.height))
    out.alpha_composite(right, (FRAME_W + arch_x + arch.width - LEAF_TUCK, FRAME_H - right.height))

    # The grate: its bars across the way, their tops hidden under the lintel.
    bar = bars(sheet, FRAME_H - arch_y - BAR_TOP)
    for bx in BAR_XS:
        out.alpha_composite(bar, (2 * FRAME_W + arch_x + bx, FRAME_H - bar.height))

    for i in range(3):
        out.alpha_composite(arch, (i * FRAME_W + arch_x, arch_y))
    out.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)} (3 frames of {FRAME_W}x{FRAME_H}; arch at x {arch_x})')


if __name__ == '__main__':
    main()
