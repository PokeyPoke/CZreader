"""Generates the app icons: a cream hacek (the diacritic that defines Czech)
on carmine. Pure stdlib PNG writing so there is no toolchain to install."""
import zlib, struct

BG   = (0xD9, 0x3A, 0x24)   # carmine
INK  = (0xF4, 0xEA, 0xDB)   # warm cream

def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5

def render(size):
    # The hacek: two strokes meeting in a V.
    segs = [(0.30, 0.33, 0.50, 0.67), (0.50, 0.67, 0.70, 0.33)]
    half = 0.075 * size
    rows = []
    for y in range(size):
        row = bytearray([0])                       # PNG filter byte: none
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            d = min(dist_to_segment(px, py, a * size, b * size, c * size, e * size)
                    for a, b, c, e in segs)
            # Antialias across one pixel at the stroke edge.
            alpha = max(0.0, min(1.0, (half - d) + 0.5))
            row += bytes(round(BG[i] + (INK[i] - BG[i]) * alpha) for i in range(3))
        rows.append(bytes(row))
    return b''.join(rows)

def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

def write_png(path, size):
    raw = render(size)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(f'{path}: {size}x{size}, {len(png)} bytes')

write_png('icons/icon-192.png', 192)
write_png('icons/icon-512.png', 512)
