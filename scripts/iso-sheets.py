"""Builds the slanted wall pieces of the catacombs' and the castle's tilesets.

Each tileset is copied to `mainlevbuild-isometric.png` beside it, with a band added under the original art (every
original coordinate stays valid) holding its walls turned onto the slant the isometric castle is drawn at, two pixels
across for every pixel down: the plain face and a couple of arched pieces (windows, a tomb niche, an alcove) sheared
for the slanted faces of a room's north corners, the wall top's rim sheared for its south corners, and a tile of plain
black for the dark under that rim. src/level/SlantTiles.ts maps where each piece lands; keep the two in step.

Run from the repository root:  python3 scripts/iso-sheets.py
"""

from PIL import Image

TILE = 32
SUB = 16
# A face is a cap over three rows of stone (64 px), with an 8 px plinth under its foot.
FACE_H = 64
PLINTH_H = 8
# Where the band of slanted pieces starts, below the original art, and how tall it is.
BAND_H = 128
# Slanted faces are shaded a little darker than the straight ones (they turn away from the light), the north-east
# ones more than the north-west.
SHADE = {'nw': 0.92, 'ne': 0.82}


def face_block(sheet, columns, cap_y, rows_y, plinth_y, plinth_columns=None, cap_columns=None):
    """A stretch of face a sub-tile per source column: its cap, its stone rows top down (k = 3, 2, 1), its plinth."""
    block = Image.new('RGBA', (SUB * len(columns), FACE_H + PLINTH_H), (0, 0, 0, 0))
    for i, x in enumerate(columns):
        cx = (cap_columns or columns)[i]
        block.paste(sheet.crop((cx, cap_y, cx + SUB, cap_y + SUB)), (i * SUB, 0))
        for k, y in enumerate(rows_y):
            block.paste(sheet.crop((x, y, x + SUB, y + SUB)), (i * SUB, SUB * (k + 1)))
        px = (plinth_columns or columns)[i]
        block.paste(sheet.crop((px, plinth_y, px + SUB, plinth_y + PLINTH_H)), (i * SUB, FACE_H))
    return block


def tiled(sheet, rect, w, h):
    """A w×h block tiled from one piece of the sheet."""
    x, y, pw, ph = rect
    piece = sheet.crop((x, y, x + pw, y + ph))
    out = Image.new('RGBA', (w, h))
    for oy in range(0, h, ph):
        for ox in range(0, w, pw):
            out.paste(piece, (ox, oy))
    return out


def shear(block, rises_right):
    """The block turned onto the slant: each column dropped half a pixel per pixel toward its low end."""
    w, h = block.size
    out = Image.new('RGBA', (w, h + w // 2), (0, 0, 0, 0))
    for u in range(w):
        drop = (w - u) // 2 if rises_right else u // 2
        out.paste(block.crop((u, 0, u + 1, h)), (u, drop))
    return out


def shade(img, factor):
    r, g, b, a = img.split()
    r, g, b = (c.point(lambda v: int(v * factor)) for c in (r, g, b))
    return Image.merge('RGBA', (r, g, b, a))


def slant_faces(block):
    """The north-west and north-east slanted faces of a face block (north-west rises to the right)."""
    return {'nw': shade(shear(block, True), SHADE['nw']), 'ne': shade(shear(block, False), SHADE['ne'])}


def rim_block(sheet, edge_left, edge_right, void):
    """A tile of wall top seen from above along its north edge: the rim's two quarters repeated, the dark under them."""
    block = tiled(sheet, void + (SUB, SUB), TILE, TILE)
    rim = Image.new('RGBA', (TILE, 8))
    for x in range(0, TILE, SUB):
        rim.paste(sheet.crop((edge_left[0], edge_left[1], edge_left[0] + 8, edge_left[1] + 8)), (x, 0))
        rim.paste(sheet.crop((edge_right[0], edge_right[1], edge_right[0] + 8, edge_right[1] + 8)), (x + 8, 0))
    block.paste(rim, (0, 0))
    return block


def build(path, out_path, spec):
    sheet = Image.open(path).convert('RGBA')
    w, h = sheet.size
    out = Image.new('RGBA', (w, h + BAND_H), (0, 0, 0, 0))
    out.paste(sheet, (0, 0))
    y0 = h
    x = 0

    def put(img):
        nonlocal x
        out.paste(img, (x, y0), img)
        placed = (x, y0)
        x += img.size[0]
        return placed

    where = {}
    # Plain slanted faces, two tiles of each (so the stone doesn't repeat every tile), and their cobblestone twins.
    for name, block in spec['faces'].items():
        faces = slant_faces(block)
        for corner in ('nw', 'ne'):
            where[f'{name}_{corner}'] = [put(faces[corner].crop((i * TILE, 0, (i + 1) * TILE, faces[corner].size[1]))) for i in range(2)]
    # The rim along a south slant: the south-west one rises to the left, the south-east one to the right.
    rim = rim_block(sheet, *spec['rim'])
    where['rim_sw'] = put(shear(rim, False))
    where['rim_se'] = put(shear(rim, True))
    where['void'] = put(tiled(sheet, spec['rim'][2] + (SUB, SUB), TILE, TILE))
    # Arched pieces for the slanted faces, whole (a tile or two wide).
    for name, block in spec['decor'].items():
        faces = slant_faces(block)
        where[f'{name}_nw'] = put(faces['nw'])
        where[f'{name}_ne'] = put(faces['ne'])
    assert x <= w, f'{out_path}: the band is {x} px wide, the sheet only {w}'
    out.save(out_path)
    print(out_path, out.size)
    for key, value in where.items():
        print(f'  {key}: {value}')


def catacombs():
    path = 'public/catacombs/mainlevbuild.png'
    sheet = Image.open(path).convert('RGBA')
    mid = [80, 96, 112, 128]
    rows = [128, 144, 160]
    cobble = 224
    return path, 'public/catacombs/mainlevbuild-isometric.png', {
        'faces': {
            'brick': face_block(sheet, mid, 112, rows, 176),
            'cobble': face_block(sheet, mid, 112 + cobble, [r + cobble for r in rows], 176 + cobble),
        },
        'rim': ((96, 48), (104, 48), (96, 80)),
        'decor': {
            'window': face_block(sheet, [272, 288], 112, [208, 224, 240], 176, [96, 112], [96, 112]),
            'niche': face_block(sheet, [80, 96, 112, 128], 192, [208, 224, 240], 176),
        },
    }


def castle():
    path = 'public/castle/mainlevbuild.png'
    sheet = Image.open(path).convert('RGBA')
    rows = [128, 144, 160]
    return path, 'public/castle/mainlevbuild-isometric.png', {
        'faces': {'stone': face_block(sheet, [112, 128, 160, 176], 112, rows, 176)},
        'rim': ((112, 0), (120, 0), (160, 48)),
        'decor': {
            'window': face_block(sheet, [0, 16], 112, rows, 176, [112, 128]),
            'alcove': face_block(sheet, [32, 48, 64, 80], 16, [32, 48, 64], 176, [112, 128, 160, 176]),
        },
    }


if __name__ == '__main__':
    for path, out_path, spec in (catacombs(), castle()):
        build(path, out_path, spec)
