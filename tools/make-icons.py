#!/usr/bin/env python3
"""Generate SOUL LINK pixel-art icons (PNG) without external libraries."""
import os
import struct
import zlib

HEART = [
    "..####..####..",
    ".######.######.",
    "##############",
    "##############",
    "##############",
    ".############.",
    "..##########..",
    "...########...",
    "....######....",
    ".....####.....",
    "......##......",
]

BG = (11, 7, 20, 255)
BG2 = (17, 11, 30, 255)
BORDER = (58, 41, 84, 255)
RED = (255, 51, 85, 255)
RED_DARK = (179, 0, 47, 255)
GOLD = (255, 215, 94, 255)
WHITE = (255, 244, 214, 255)


def blank(size, color=(0, 0, 0, 0)):
    return [[color for _ in range(size)] for _ in range(size)]


def put(img, x, y, color):
    if 0 <= y < len(img) and 0 <= x < len(img[y]):
        img[y][x] = color


def rect(img, x, y, w, h, color):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            put(img, xx, yy, color)


def make_icon(size, transparent=False):
    img = blank(size)
    if not transparent:
        rect(img, 0, 0, size, size, BG)
        cell = max(4, size // 32)
        for y in range(0, size, cell):
            for x in range(0, size, cell):
                if (x // cell + y // cell) % 2 == 0:
                    rect(img, x, y, cell, cell, BG2)
        b = max(3, size // 64)
        rect(img, 0, 0, size, b, BORDER)
        rect(img, 0, size - b, size, b, BORDER)
        rect(img, 0, 0, b, size, BORDER)
        rect(img, size - b, 0, b, size, BORDER)
        # corner cuts for a pixel feel
        c = size // 16
        for i in range(c):
            for j in range(c - i):
                put(img, i, j, (0, 0, 0, 0))
                put(img, size - 1 - i, j, (0, 0, 0, 0))
                put(img, i, size - 1 - j, (0, 0, 0, 0))
                put(img, size - 1 - i, size - 1 - j, (0, 0, 0, 0))

    # heart 14 columns x 11 rows, scaled and centred
    cols = len(HEART[0])
    rows = len(HEART)
    scale = int(size * (0.62 if transparent else 0.56) / max(cols, rows))
    scale = max(1, scale)
    hw = cols * scale
    hh = rows * scale
    ox = (size - hw) // 2
    oy = (size - hh) // 2
    for ry, line in enumerate(HEART):
        for rx, ch in enumerate(line):
            if ch != '#':
                continue
            color = RED
            if ry >= rows - 3 and rx >= 4 + (ry - (rows - 3)):
                color = RED_DARK
            rect(img, ox + rx * scale, oy + ry * scale, scale, scale, color)
    # highlight
    rect(img, ox + 3 * scale, oy + 2 * scale, scale, scale, WHITE)
    # gold spark
    if size >= 48:
        s = max(1, scale // 2)
        sx = ox + hw + scale * 2
        sy = oy - scale * 2
        rect(img, sx, sy + s, s, s, GOLD)
        rect(img, sx - s, sy + 2 * s, s * 3, s, GOLD)
        rect(img, sx, sy + 3 * s, s, s, GOLD)
    return img


def write_png(path, img):
    size = len(img)
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in img)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(png)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_png(os.path.join(root, "assets", "icon-192.png"), make_icon(192))
    write_png(os.path.join(root, "assets", "icon-512.png"), make_icon(512))
    write_png(os.path.join(root, "assets", "icon-maskable-512.png"), make_icon(512))

    android_res = os.path.join(root, "android", "app", "src", "main", "res")
    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, px in sizes.items():
        write_png(os.path.join(android_res, folder, "ic_launcher.png"), make_icon(px))
        write_png(
            os.path.join(android_res, folder, "ic_launcher_foreground.png"),
            make_icon(px, transparent=True),
        )
    print("icons written")
