#!/usr/bin/env python3
"""Génère les icônes PWA (📦 stylisé sur dégradé orange) sans dépendance externe."""
import struct, zlib, math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

# Dégradé #F4A261 -> #E76F51
C1 = (0xF4, 0xA2, 0x61)
C2 = (0xE7, 0x6F, 0x51)
BOX = (0xFF, 0xF3, 0xE6)   # carton clair
TAPE = (0x26, 0x46, 0x53)  # bande sombre #264653


def lerp(a, b, t):
    return int(round(a + (b - a) * t))


def rounded(x, y, x0, y0, x1, y1, r):
    """Point (x,y) dans le rectangle [x0,x1]x[y0,y1] à coins arrondis r ?"""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    # coins
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        in_corner_x = (x < x0 + r and cx == x0 + r) or (x > x1 - r and cx == x1 - r)
        in_corner_y = (y < y0 + r and cy == y0 + r) or (y > y1 - r and cy == y1 - r)
        if in_corner_x and in_corner_y:
            return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    return True


def gen(size):
    W = H = size
    # géométrie de la boîte
    bx0 = int(W * 0.24); bx1 = int(W * 0.76)
    by0 = int(H * 0.26); by1 = int(H * 0.78)
    rad = int(W * 0.05)
    mid_y = int(H * 0.46)             # couture horizontale du couvercle
    cx = W // 2
    tape_w = max(3, int(W * 0.035))   # demi-épaisseur des bandes

    raw = bytearray()
    for y in range(H):
        raw.append(0)  # filtre None
        for x in range(W):
            t = (x + y) / (2 * (W - 1))
            r = lerp(C1[0], C2[0], t)
            g = lerp(C1[1], C2[1], t)
            b = lerp(C1[2], C2[2], t)
            a = 255
            if rounded(x, y, bx0, by0, bx1, by1, rad):
                r, g, b = BOX
                # bande horizontale (couture du couvercle)
                if abs(y - mid_y) <= tape_w:
                    r, g, b = TAPE
                # bande verticale sur le couvercle (du haut jusqu'à la couture)
                elif y < mid_y and abs(x - cx) <= tape_w:
                    r, g, b = TAPE
            raw += bytes((r, g, b, a))

    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xFFFFFFFF)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

    path = os.path.join(OUT, f'icon-{size}.png')
    with open(path, 'wb') as f:
        f.write(png)
    print('écrit', path, len(png), 'octets')


for s in (512, 192):
    gen(s)
