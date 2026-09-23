#!/usr/bin/env python3
"""Dev-only contact sheet of assets/tex (normals shown lit from the upper-left). Usage: materials-sheet.py out.png [substr...]"""
import sys, os, glob
import numpy as np
from PIL import Image, ImageDraw
STORE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = sorted(glob.glob(os.path.join(STORE, 'assets/tex/*.webp')))
flt = sys.argv[2:]
if flt: files = [f for f in files if any(s in os.path.basename(f) for s in flt)]
th = 256
cols = 4
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * th, rows * (th + 16)), (30, 30, 30))
d = ImageDraw.Draw(sheet)
L = np.array([-0.5, 0.5, 0.7]); L /= np.linalg.norm(L)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB')
    w = im.size[0]
    crop = im.crop((0, 0, min(w, 256), min(w, 256))) if '--crop' in os.environ.get('SHEET', '') else im.resize((th, th), Image.LANCZOS)
    if f.endswith('_n.webp'):
        a = np.asarray(crop).astype(float) / 127.5 - 1
        shade = np.clip(a @ L, 0, 1) ** 1.5
        crop = Image.fromarray((shade * 255).astype(np.uint8)).convert('RGB')
    x, y = (i % cols) * th, (i // cols) * (th + 16)
    sheet.paste(crop, (x, y + 16))
    d.text((x + 3, y + 2), f'{os.path.basename(f)} {w}px {os.path.getsize(f)//1024}KB', fill=(255, 230, 120))
sheet.save(sys.argv[1])
