"""Builds the forgotten mines' terrain sheet from the cave art in public/caves2 (RPGFW Set 2).

The set draws its cave walls as big free-standing blocks of rock to be stamped by hand; the game lays its walls tile by
tile, so this cuts the pieces it needs out of them into public/caves2/mines-terrain.png:
- the rock tops' dark (the faint cobbles of a block's black top, cut where they repeat so they tile seamlessly), and
  the scalloped rim round them: the block's top edge, turned to run down either side, and its rounded corners;
- the straight rock face (the front of the plain wall block in hills1_main.png: its black top, scalloped lip and four
  tiles of stone), the same face cut shorter (its lip kept over fewer rows of stone, for rock only a few rows deep),
  and all of them turned onto the slant the game's slanted walls run at (two pixels across for every pixel down);
- the rim along a south slant, and a chasm's edge as the set's own pit draws it: its pebbles, dark thorns over the
  floor, and the grey-blue cobbles of its cliff (the face's stones in the pit's colours) fading into the dark below;
- old pit props sinking into a chasm (from wood_el.png).
src/level/MineTiles.ts maps where each piece lands; keep the two in step.

Run from the repository root:  python3 scripts/mine-sheets.py
"""

import random

from PIL import Image

SRC = 'public/caves2/'
OUT = 'public/caves2/mines-terrain.png'
TILE = 32
SHEET_W, SHEET_H = 1024, 704

# The plain wall block of hills1_main.png: its face is three tiles across (x 256..352) with an outline either side,
# cut from the bottom of its black top (y 64) down past its foot (y 224).
FACE_X = 256
FACE_COLUMNS = 3
FACE_TOP, FACE_BOTTOM = 64, 224
FACE_H = FACE_BOTTOM - FACE_TOP
END_LEFT_X, END_RIGHT_X, END_W = 248, 352, 8
# A face cut short keeps this band of its top (the last of the black and the scalloped lip) over its lower stones.
CAP_FROM, CAP_TO = 8, 30
# Faces cut short over 1..4 rows of rock: their height is the rows less this (the top of the highest row under the rim).
CUT_ROWS = (1, 2, 3, 4)
CUT_UNDER_RIM = 16
FACE_SHADOW = 8
# The block's top edge: the scalloped rim, its black under it, a tile across each (y 31..47).
RIM_Y, RIM_H = 31, 16
CORNER = 16
# One ring of the rim (where two runs of it meet at a corner of the floor), cut round.
KNOT_AT, KNOT = (279, 32), 14
# A patch of the black top's cobbles that repeats every 32 px with no seam (found by scanning the block's top).
FILL_AT = (62, 94)
# A slant drops half a pixel for every pixel across: a tile's strip of it, 16 px from one side to the other.
SLANT_DROP = TILE // 2
# Slanted faces turn from the light: the north-west ones (facing south-east) a little, the north-east ones more.
SHADE = {'nw': 0.92, 'ne': 0.74}
# A south slant's rim piece: the rim turned onto the slant, the dark run on under it.
SLANT_RIM_H = 48
# The set's pit (the lower left block of hills1_main.png): its pebbles (lighter than this) and the stones of its cliff.
PIT_BOX = (20, 318, 205, 480)
PEBBLE_LIGHT = 45
CLIFF_BOX = (30, 470, 190, 580)
# A chasm's cliff: thorns reach this far over the floor above it; it falls over CLIFF_ROWS rows, the lower FADE share of
# it darkening into the black (its foot ragged by up to RAGGED px), and where no cliff runs on beside it, its side fades
# out over SIDE_FADE px.
THORN_H = 10
CLIFF_ROWS = 3
CLIFF_FADE = 0.4
CLIFF_RAGGED = 9
SIDE_FADE = 14
# The pit's own colours are darker than the game's dim light can show: the cliff is lit up by this much.
CLIFF_LIGHT = 1.4
CLIFF_STONE_FROM = 26
# The edges of a chasm beside the floor: pebbles down the side (a strip SIDE_W wide whose middle is the tile's edge).
SIDE_W = 16
SIDE_OVER = 6
SOUTH_H = 12
# Pit props sinking into the dark: posts from wood_el.png, fading to black over their lower FADE share.
POSTS = [(736, 0, 18, 174), (782, 0, 18, 174), (7, 320, 18, 174), (8, 512, 16, 172)]
POST_H = 176
POST_FADE = 0.55
# Dark thorns: their colour, and how many stand along a tile's edge.
THORN = (14, 13, 17, 255)
THORNS_PER_TILE = 8


def shaded(img, factor):
    """The image darkened by `factor` (alpha kept)."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * factor), int(g * factor), int(b * factor), a)
    return out


def faded(img, start_share, power=1.0):
    """The image darkening to black from `start_share` of its height down to its foot."""
    out = img.copy()
    px = out.load()
    start = out.height * start_share
    for y in range(out.height):
        k = 1.0 if y < start else max(0.0, 1 - ((y - start) / (out.height - start)) ** power)
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * k), int(g * k), int(b * k), a)
    return out


def shear_drop(x, w, corner):
    """How far column x of a w-wide strip drops on the slant: nw and se strips lie lower on the left, ne and sw on the right."""
    return min((w - x) // 2 if corner in ('nw', 'se') else x // 2, SLANT_DROP)


def sheared(img, corner):
    """A strip turned onto the slant: each column dropped by how far it is from the strip's high side."""
    out = Image.new('RGBA', (img.width, img.height + SLANT_DROP), (0, 0, 0, 0))
    for x in range(img.width):
        out.paste(img.crop((x, 0, x + 1, img.height)), (x, shear_drop(x, img.width, corner)))
    return out


def tiled(tile, w, h, ox=0, oy=0):
    """A w×h image of a seamless tile laid from offset (ox, oy) in it."""
    out = Image.new('RGBA', (w, h))
    for y in range(-oy, h, tile.height):
        for x in range(-ox, w, tile.width):
            out.paste(tile, (x, y))
    return out


def stacked(top, bottom):
    """Two images of one width, one above the other."""
    out = Image.new('RGBA', (top.width, top.height + bottom.height), (0, 0, 0, 0))
    out.paste(top, (0, 0))
    out.paste(bottom, (0, top.height))
    return out


def cut_face(face, rows):
    """A face cut short over `rows` rows of rock: its lip kept over the lowest of its stones."""
    h = rows * TILE - CUT_UNDER_RIM + FACE_SHADOW
    cap = face.crop((0, CAP_FROM, TILE, CAP_TO))
    stones = face.crop((0, FACE_H - (h - cap.height), TILE, FACE_H))
    return stacked(cap, stones)


def with_fill_under(strip, fill, h, corner=None):
    """A rim strip (straight, or turned onto the slant) with the rock's dark run on under it down to h."""
    out = tiled(fill, strip.width, h)
    out.alpha_composite(sheared(strip, corner) if corner else strip)
    if corner:
        # Above the slanted rim the strip shows nothing: clear the dark there.
        px = out.load()
        for x in range(strip.width):
            for y in range(shear_drop(x, strip.width, corner)):
                px[x, y] = (0, 0, 0, 0)
    return out


def recoloured(img, palette):
    """
    The image in another palette, its histogram matched: each pixel takes the palette's colour as far up the palette's
    brightness as the pixel's brightness lies up the image's own.
    """
    px = img.load()
    lums = sorted(sum(px[x, y][:3]) for y in range(img.height) for x in range(img.width) if px[x, y][3])
    rank = {}
    for i, v in enumerate(lums):
        rank.setdefault(v, []).append(i / max(1, len(lums) - 1))
    rank = {v: sum(r) / len(r) for v, r in rank.items()}
    out = img.copy()
    opx = out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a:
                opx[x, y] = palette[min(len(palette) - 1, int(rank[r + g + b] * (len(palette) - 1)))][:3] + (a,)
    return out


def pit_palette(pit):
    """The colours of the pit's cliff, darkest first (each as often as it is used, so ranks follow its spread)."""
    px = pit.load()
    x0, y0, x1, y1 = CLIFF_BOX
    cols = [px[x, y] for y in range(y0, y1) for x in range(x0, x1) if px[x, y][3] and sum(px[x, y][:3]) > 30]
    return sorted(cols, key=lambda c: sum(c[:3]))


def pebbles(hills):
    """The pebbles round the set's pit, each cut out with its dark outline (one side of the pit: the other mirrors it)."""
    px = hills.load()
    x0, y0, x1, y1 = PIT_BOX
    light = lambda x, y: px[x, y][3] and sum(px[x, y][:3]) // 3 >= PEBBLE_LIGHT
    seen, out = set(), []
    for y in range(y0, y1):
        for x in range(x0, (x0 + x1) // 2):
            if (x, y) in seen or not light(x, y):
                continue
            todo, pts = [(x, y)], []
            seen.add((x, y))
            while todo:
                p = todo.pop()
                pts.append(p)
                for q in ((p[0] + 1, p[1]), (p[0] - 1, p[1]), (p[0], p[1] + 1), (p[0], p[1] - 1)):
                    if q not in seen and x0 <= q[0] < x1 and y0 <= q[1] < y1 and light(*q):
                        seen.add(q)
                        todo.append(q)
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            w, h = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            if not (5 <= w <= 11 and 3 <= h <= 9 and len(pts) >= 15):
                continue
            stamp = Image.new('RGBA', (w + 2, h + 2), (0, 0, 0, 0))
            spx = stamp.load()
            inside = set(pts)
            for sy in range(h + 2):
                for sx in range(w + 2):
                    ax, ay = min(xs) - 1 + sx, min(ys) - 1 + sy
                    near = any((ax + dx, ay + dy) in inside for dx in (-1, 0, 1) for dy in (-1, 0, 1))
                    if (ax, ay) in inside or near:
                        r, g, b, a = px[ax, ay]
                        spx[sx, sy] = (r, g, b, 255) if (ax, ay) in inside else (min(r, 20), min(g, 18), min(b, 22), 255)
            out.append(stamp)
    return out


def stamp_wrapped(img, stamp, cx, cy, wrap_x=True, wrap_y=False):
    """A stamp centred at (cx, cy), wrapping round the image's sides so a row of such images joins up."""
    for ox in ((-img.width, 0, img.width) if wrap_x else (0,)):
        for oy in ((-img.height, 0, img.height) if wrap_y else (0,)):
            x, y = cx - stamp.width // 2 + ox, cy - stamp.height // 2 + oy
            if x + stamp.width > 0 and x < img.width and y + stamp.height > 0 and y < img.height:
                img.alpha_composite(stamp, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))


def thorn(img, x, y, dx, dy, length, rng):
    """A dark thorn from (x, y) along (dx, dy), now and then with a twig off it."""
    px = img.load()
    for k in range(length):
        tx, ty = round(x + dx * k), round(y + dy * k)
        for wx in ((0, 1) if k < 2 else (0,)):
            if 0 <= tx + wx < img.width and 0 <= ty < img.height:
                px[tx + wx, ty] = THORN
        if k == length // 2 and rng.random() < 0.5:
            side = 1 if rng.random() < 0.5 else -1
            for j in range(1, 3):
                bx, by = round(tx + side * j), round(ty + dy * j * 0.6 - abs(dx) * j * 0.3)
                if 0 <= bx < img.width and 0 <= by < img.height:
                    px[bx, by] = THORN


def pebble_row(width, height, line, stamps, rng, vertical=False, thorns_to=None):
    """
    A strip of pebbles along a line `line` px into it (across it for a vertical strip), wrapping at its ends so strips of
    it join, with thorns standing off it toward `thorns_to` (-1: up or left, +1: down or right). The pebble at each end is
    the same in every strip, so any two of them join whole.
    """
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    span = height if vertical else width
    if thorns_to:
        for k in range(THORNS_PER_TILE):
            along = 3 + (span - 6) * (k + rng.random() * 0.8) / THORNS_PER_TILE
            slant = rng.uniform(-0.55, 0.55)
            length = rng.randint(4, 9)
            at = line + thorns_to * 2
            if vertical:
                thorn(img, at, along, thorns_to, slant, length, rng)
            else:
                thorn(img, along, at, slant, thorns_to, length, rng)
    ends = stamps[0]
    places = [0] + [round(span * (k + 0.5 + rng.uniform(-0.15, 0.15)) / 4) for k in range(4)]
    for k, along in enumerate(places):
        stamp = ends if k == 0 else stamps[rng.randrange(len(stamps))]
        across = line + (0 if k == 0 else rng.randint(-1, 1))
        if vertical:
            stamp_wrapped(img, stamp, across, along, wrap_x=False, wrap_y=True)
        else:
            stamp_wrapped(img, stamp, along, across)
    return img


def cliff_column(face, palette, rng, fade_left, fade_right):
    """
    A tile's column of a chasm's cliff: the face's stones in the pit's colours, falling CLIFF_ROWS rows and fading out at
    a ragged foot, and fading out at whichever side no cliff runs on from.
    """
    h = CLIFF_ROWS * TILE
    stone = recoloured(face.crop((0, CLIFF_STONE_FROM, TILE, CLIFF_STONE_FROM + h)), palette)
    px = stone.load()
    start = h * (1 - CLIFF_FADE)
    foot = [h - rng.randint(0, CLIFF_RAGGED) for _ in range(TILE)]
    for x in range(1, TILE):
        foot[x] = (foot[x] + foot[x - 1]) // 2
    side = [rng.randint(0, 4) for _ in range(h)]
    for y in range(h):
        for x in range(TILE):
            k = 1.0 if y < start else max(0.0, 1 - (y - start) / max(1, foot[x] - start))
            if fade_left:
                k *= min(1.0, max(0.0, (x - side[y]) / SIDE_FADE))
            if fade_right:
                k *= min(1.0, max(0.0, (TILE - 1 - x - side[y]) / SIDE_FADE))
            r, g, b, a = px[x, y]
            k *= CLIFF_LIGHT
            px[x, y] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)), a)
    return stone


def main():
    hills = Image.open(SRC + 'hills1_main.png').convert('RGBA')
    wood = Image.open(SRC + 'wood_el.png').convert('RGBA')
    sheet = Image.new('RGBA', (SHEET_W, SHEET_H), (0, 0, 0, 0))
    rng = random.Random(7)

    # The rock tops: their dark (two tiles square, so any tile's window of it can be cut at any offset), the rim.
    fill = hills.crop((FILL_AT[0], FILL_AT[1], FILL_AT[0] + TILE, FILL_AT[1] + TILE))
    sheet.paste(tiled(fill, 2 * TILE, 2 * TILE), (0, 0))
    rims = [hills.crop((FACE_X + i * TILE, RIM_Y, FACE_X + (i + 1) * TILE, RIM_Y + RIM_H)) for i in range(FACE_COLUMNS)]
    for i, rim in enumerate(rims):
        sheet.paste(rim, (128 + i * TILE, 0))
        sheet.paste(rim.transpose(Image.Transpose.ROTATE_90), (224 + i * RIM_H, 0))
        sheet.paste(rim.transpose(Image.Transpose.ROTATE_270), (272 + i * RIM_H, 0))
    # A knot of rim where two runs of it meet at a corner of the floor: a ring of it, cut round.
    knot = hills.crop((KNOT_AT[0], KNOT_AT[1], KNOT_AT[0] + KNOT, KNOT_AT[1] + KNOT))
    kpx = knot.load()
    for y in range(KNOT):
        for x in range(KNOT):
            if (x - KNOT / 2 + 0.5) ** 2 + (y - KNOT / 2 + 0.5) ** 2 > (KNOT / 2) ** 2:
                kpx[x, y] = (0, 0, 0, 0)
    sheet.paste(knot, (64, 0))

    # Faces: whole, their ends, and cut short over 1..4 rows (each cut's columns side by side).
    faces = [hills.crop((FACE_X + i * TILE, FACE_TOP, FACE_X + (i + 1) * TILE, FACE_BOTTOM)) for i in range(FACE_COLUMNS)]
    for i, face in enumerate(faces):
        sheet.paste(face, (i * TILE, 64))
        for k, rows in enumerate(CUT_ROWS):
            sheet.paste(cut_face(face, rows), (112 + (k * FACE_COLUMNS + i) * TILE, 64))
    sheet.paste(hills.crop((END_LEFT_X, FACE_TOP, END_LEFT_X + END_W, FACE_BOTTOM)), (96, 64))
    sheet.paste(hills.crop((END_RIGHT_X, FACE_TOP, END_RIGHT_X + END_W, FACE_BOTTOM)), (104, 64))

    # Slanted faces: whole (nw then ne), then cut short (for each cut, nw's three columns then ne's).
    for i, face in enumerate(faces):
        for c, corner in enumerate(('nw', 'ne')):
            sheet.paste(shaded(sheared(face, corner), SHADE[corner]), ((c * FACE_COLUMNS + i) * TILE, 232))
            for k, rows in enumerate(CUT_ROWS):
                piece = shaded(sheared(cut_face(face, rows), corner), SHADE[corner])
                sheet.paste(piece, (192 + ((k * 2 + c) * FACE_COLUMNS + i) * TILE, 232))

    # The rim along a south slant, the rock's dark run on under it.
    for i, rim in enumerate(rims):
        sheet.paste(with_fill_under(rim, fill, SLANT_RIM_H, 'se'), (i * TILE, 416))
        sheet.paste(with_fill_under(rim, fill, SLANT_RIM_H, 'sw'), (96 + i * TILE, 416))

    # Chasms: the cliff under a north brink (thorns and pebbles along its top; whole, or fading out at its left, its right
    # or both sides, each the three columns), and the brinks beside and south of a chasm.
    stamps = pebbles(hills)
    palette = pit_palette(hills)
    for i, face in enumerate(faces):
        brink = pebble_row(TILE, THORN_H + 6, THORN_H + 1, stamps, random.Random(100 + i), thorns_to=-1)
        for k, (left, right) in enumerate(((False, False), (True, False), (False, True), (True, True))):
            piece = Image.new('RGBA', (TILE, THORN_H + CLIFF_ROWS * TILE), (0, 0, 0, 0))
            piece.paste(cliff_column(face, palette, random.Random(200 + i), left, right), (0, THORN_H))
            piece.alpha_composite(brink)
            sheet.paste(piece, ((k * FACE_COLUMNS + i) * TILE, 480))
        west = pebble_row(SIDE_W, TILE, SIDE_OVER, stamps, random.Random(300 + i), vertical=True, thorns_to=-1)
        sheet.paste(west, (384 + i * SIDE_W, 480))
        sheet.paste(west.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (432 + i * SIDE_W, 480))
        south = pebble_row(TILE, SOUTH_H, SOUTH_H - 6, stamps, random.Random(400 + i))
        sheet.paste(south, (480 + i * TILE, 480))
    # Knots of pebbles for where a chasm's brinks meet at a corner.
    for k in range(3):
        cluster = Image.new('RGBA', (CORNER, CORNER), (0, 0, 0, 0))
        crng = random.Random(500 + k)
        for _ in range(3):
            stamp_wrapped(cluster, stamps[crng.randrange(len(stamps))], 8 + crng.randint(-3, 3), 8 + crng.randint(-3, 3), wrap_x=False)
        sheet.paste(cluster, (576 + k * CORNER, 480))

    for i, (x, y, w, h) in enumerate(POSTS):
        post = faded(wood.crop((x, y, x + w, y + h)), 1 - POST_FADE)
        sheet.paste(post, (640 + i * TILE + (TILE - w) // 2, 480))

    sheet.save(OUT)


if __name__ == '__main__':
    main()
