"""Builds the forgotten mines' terrain sheet from the cave art in public/caves2 (RPGFW Set 2).

The set draws its cave walls as big free-standing blocks of rock to be stamped by hand; the game lays its walls tile by
tile, so this cuts the pieces it needs out of them into public/caves2/mines-terrain.png: the straight rock face (the
front of the plain wall block in hills1_main.png, its black top, scalloped lip and four tiles of stone), that face turned
onto the slant the game's slanted walls run at (two pixels across for every pixel down), the scalloped rim of the black
rock tops (straight, down the sides, on the slant), the dark cliffs of a chasm falling away into the black, and old
pit props sinking into it (from wood_el.png). src/level/MineTiles.ts maps where each piece lands; keep the two in step.

Run from the repository root:  python3 scripts/mine-sheets.py
"""

from PIL import Image

SRC = 'public/caves2/RPGFW_Set2_v1.0/'
OUT = 'public/caves2/mines-terrain.png'
TILE = 32
SHEET_W, SHEET_H = 512, 656

# The plain wall block of hills1_main.png: its face is three tiles across (x 256..352) with an outline either side,
# cut from the bottom of its black top (y 64) down past its foot (y 224).
FACE_X = 256
FACE_COLUMNS = 3
FACE_TOP, FACE_BOTTOM = 64, 224
FACE_H = FACE_BOTTOM - FACE_TOP
END_LEFT_X, END_RIGHT_X, END_W = 248, 352, 8
# Its black top's scalloped rim: along the top (with the black under it), down its sides and round its top corners.
RIM_Y = 32
SIDE_RIM_Y = 52
CORNER = 16
# A slant drops half a pixel for every pixel across: a tile's strip of it, 16 px from one side to the other.
SLANT_DROP = TILE // 2
# Slanted faces turn from the light: the north-west ones (facing south-east) a little, the north-east ones more.
SHADE = {'nw': 0.92, 'ne': 0.74}
# A chasm's far side: the stone of the face, darkened, falling away to black over CHASM_H; its rims a little darker.
CHASM_H = 96
CHASM_STONE = 0.42
CHASM_RIM = 0.78
# Pit props sinking into the dark: posts from wood_el.png, fading to black over their lower FADE share.
POSTS = [(736, 0, 18, 174), (782, 0, 18, 174), (7, 320, 18, 174), (8, 512, 16, 172)]
POST_H = 176
POST_FADE = 0.55
# Below this brightness a pixel of the rim art is the black of the rock top, not the stones of its rim.
RIM_DARK = 12


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


def sheared(img, corner):
    """A strip turned onto the slant: each column dropped by how far it is from the strip's high side."""
    out = Image.new('RGBA', (img.width, img.height + SLANT_DROP), (0, 0, 0, 0))
    for x in range(img.width):
        # nw and se: the left side lies lower; ne and sw: the right side does.
        drop = (img.width - x) // 2 if corner in ('nw', 'se') else x // 2
        out.paste(img.crop((x, 0, x + 1, img.height)), (x, min(drop, SLANT_DROP)))
    return out


def sheared_solid(img, corner, fill):
    """A rim strip turned onto the slant, the black under it run on down to the strip's foot (no floor shows under it)."""
    out = sheared(img, corner)
    for x in range(img.width):
        drop = (img.width - x) // 2 if corner in ('nw', 'se') else x // 2
        top = min(drop, SLANT_DROP) + img.height
        out.paste(Image.new('RGBA', (1, out.height - top), fill), (x, top))
    return out


def stones_only(img):
    """The rim's stones without the black under them."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if r + g + b < RIM_DARK * 3:
                px[x, y] = (0, 0, 0, 0)
    return out


def main():
    hills = Image.open(SRC + 'hills1_main.png').convert('RGBA')
    wood = Image.open(SRC + 'wood_el.png').convert('RGBA')
    sheet = Image.new('RGBA', (SHEET_W, SHEET_H), (0, 0, 0, 0))
    black = hills.getpixel((100, 100))
    sheet.paste(Image.new('RGBA', (TILE, TILE), black), (0, 0))

    faces = [hills.crop((FACE_X + i * TILE, FACE_TOP, FACE_X + (i + 1) * TILE, FACE_BOTTOM)) for i in range(FACE_COLUMNS)]
    for i, face in enumerate(faces):
        sheet.paste(face, (i * TILE, 32))
    sheet.paste(hills.crop((END_LEFT_X, FACE_TOP, END_LEFT_X + END_W, FACE_BOTTOM)), (96, 32))
    sheet.paste(hills.crop((END_RIGHT_X, FACE_TOP, END_RIGHT_X + END_W, FACE_BOTTOM)), (104, 32))

    for i, face in enumerate(faces):
        sheet.paste(shaded(sheared(face, 'nw'), SHADE['nw']), (i * TILE, 200))
        sheet.paste(shaded(sheared(face, 'ne'), SHADE['ne']), (96 + i * TILE, 200))

    rims = [hills.crop((FACE_X + i * TILE, RIM_Y, FACE_X + (i + 1) * TILE, RIM_Y + TILE)) for i in range(FACE_COLUMNS)]
    side_w = hills.crop((END_LEFT_X, SIDE_RIM_Y, END_LEFT_X + END_W, SIDE_RIM_Y + TILE))
    side_e = hills.crop((END_RIGHT_X, SIDE_RIM_Y, END_RIGHT_X + END_W, SIDE_RIM_Y + TILE))
    for i, rim in enumerate(rims):
        sheet.paste(rim, (i * TILE, 384))
        sheet.paste(sheared_solid(rim, 'se', black), (i * TILE, 424))
        sheet.paste(sheared_solid(rim, 'sw', black), (96 + i * TILE, 424))
    sheet.paste(side_w, (96, 384))
    sheet.paste(side_e, (104, 384))
    sheet.paste(hills.crop((END_LEFT_X, RIM_Y, END_LEFT_X + CORNER, RIM_Y + CORNER)), (112, 384))
    sheet.paste(hills.crop((END_RIGHT_X + END_W - CORNER, RIM_Y, END_RIGHT_X + END_W, RIM_Y + CORNER)), (128, 384))

    for i, face in enumerate(faces):
        stone = faded(shaded(face.crop((0, FACE_H - CHASM_H - 8, TILE, FACE_H - 8)), CHASM_STONE), 0.1, 0.8)
        cliff = Image.new('RGBA', (TILE, CHASM_H), black)
        cliff.alpha_composite(stone)
        cliff.alpha_composite(shaded(stones_only(rims[i].crop((0, 0, TILE, CORNER + 4))), CHASM_RIM))
        sheet.paste(cliff, (i * TILE, 480))
        lip = shaded(stones_only(rims[i].crop((0, 0, TILE, CORNER))), CHASM_RIM).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        sheet.paste(lip, (112 + i * TILE, 480))
    sheet.paste(shaded(stones_only(side_w), CHASM_RIM), (96, 480))
    sheet.paste(shaded(stones_only(side_e), CHASM_RIM), (104, 480))

    for i, (x, y, w, h) in enumerate(POSTS):
        post = faded(wood.crop((x, y, x + w, y + h)), 1 - POST_FADE)
        sheet.paste(post, (224 + i * TILE + (TILE - w) // 2, 480))

    sheet.save(OUT)


if __name__ == '__main__':
    main()
