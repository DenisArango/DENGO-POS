"""Overlay a CSS-pixel grid on a capture so crop coordinates can be read off it.
python grid.py capture/x.png [out.jpg] [step]"""
import sys, os
from PIL import Image, ImageDraw
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join("ref", "grid_" + os.path.basename(src).replace(".png", ".jpg"))
step = int(sys.argv[3]) if len(sys.argv) > 3 else 100
im = Image.open(src).convert("RGB")
dpr = 3 if os.path.basename(src).startswith("m_") else 2
w, h = im.size[0] // dpr, im.size[1] // dpr
im = im.resize((w, h))
d = ImageDraw.Draw(im)
for x in range(0, w, step):
    d.line([(x, 0), (x, h)], fill=(255, 0, 120), width=1)
    d.text((x + 2, 2), str(x), fill=(255, 0, 120))
for y in range(0, h, step):
    d.line([(0, y), (w, y)], fill=(255, 0, 120), width=1)
    d.text((2, y + 2), str(y), fill=(255, 0, 120))
im.save(out, quality=85)
print(out, w, h)
