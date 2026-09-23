#!/usr/bin/env python3
"""IMAANS store - texture generator for the MATERIALS library (dev-only, never shipped).

    node tools/materials-extract.mjs            # once: pulls CC0 / CC-BY textures out of ../raw/*.glb
    python3 tools/materials-gen.py [names...]   # (re)builds assets/tex/*.webp  (no names = all)

Every map is SEAMLESS (periodic noise via FFT, periodic Worley via cKDTree(boxsize=1), np.roll
gradients) and authored for a known real-world tile size (see TILE in src/core/materials.js).
Normal maps: OpenGL convention (+Y = +v = up in the image), tangent space.
Fabric colour maps are near-white luminance detail (tinted by material colour / instanceColor).
Requires: numpy, pillow, scipy.  Sources + licences are written to assets/tex/CREDITS.json.
"""
import sys, os, json, math, colorsys
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.dirname(HERE)
RAW = os.path.join(os.path.dirname(STORE), 'raw')
GLBTEX = os.environ.get('GLBTEX', os.path.join(os.path.dirname(STORE), 'work', 'glbtex'))
OUT = os.path.join(STORE, 'assets', 'tex')
PREVIEW = os.environ.get('MAT_PREVIEW', os.path.join(os.path.dirname(STORE), 'work', 'texprev'))
os.makedirs(OUT, exist_ok=True)
os.makedirs(PREVIEW, exist_ok=True)

STATS = {}      # name -> info (mean linear value of colour maps etc.)
CREDITS = {}    # file -> {source, license, author}

PROCEDURAL = {'source': 'procedural (tools/materials-gen.py)', 'license': 'CC0', 'author': 'IMAANS store materials pass (own work)'}
HARDWOOD = {'source': 'three.js examples textures/hardwood2_{diffuse,bump,roughness}.jpg (planks recomposed into herringbone, recoloured)',
            'license': 'MIT (three.js repository examples)', 'author': 'three.js authors'}
SHEENCHAIR = {'source': 'Khronos glTF-Sample-Assets SheenChair.glb (velvet normal/base, wood base)', 'license': 'CC0 1.0',
              'author': 'Wayfair LLC / Khronos'}
SWLSOFA = {'source': 'Khronos glTF-Sample-Assets SheenWoodLeatherSofa.glb (Brown fabric base)', 'license': 'CC BY 4.0',
           'author': 'Darmstadt Graphics Group GmbH, Eric Chadwick; original model Fran Calvente (Poly Haven, CC0)'}
CHECKER = {'source': 'three.js examples textures/FloorsCheckerboard_S_{Diffuse,Normal}.jpg', 'license': 'MIT (three.js repository examples)',
           'author': 'three.js authors'}


# --------------------------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------------------------
def R(seed):
    return np.random.default_rng(seed)


def grid(w, h=None):
    """Pixel-centre coordinates in tile units [0,1). y grows DOWN the image (row index)."""
    h = h or w
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    return (x + 0.5) / w, (y + 0.5) / h


def norm01(a, lo=None, hi=None):
    lo = a.min() if lo is None else lo
    hi = a.max() if hi is None else hi
    return np.clip((a - lo) / (hi - lo + 1e-12), 0, 1)


def fnoise(shape, seed, beta=2.0, lo=1.0, hi=None, ax=1.0, ay=1.0, rot=0.0):
    """Seamless 1/f^beta noise (zero mean, unit std). ax/ay > 1 squash that frequency axis
    (ay large -> vertical streaks). lo/hi: band limits in cycles per tile."""
    H, W = shape
    F = np.fft.fft2(R(seed).standard_normal(shape))
    fy = np.fft.fftfreq(H)[:, None] * H
    fx = np.fft.fftfreq(W)[None, :] * W
    if rot:
        c, s = math.cos(rot), math.sin(rot)
        fx, fy = fx * c - fy * s, fx * s + fy * c
    f = np.sqrt((fx * ax) ** 2 + (fy * ay) ** 2)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    amp *= 1.0 / (1.0 + np.exp(np.clip(-(f - lo) * 4.0, -50, 50)))
    if hi:
        amp *= np.exp(-(f / hi) ** 2)
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(F * amp))
    return (out - out.mean()) / (out.std() + 1e-12)


def worley(shape, npts, seed, aspect=(1.0, 1.0), k=2, pts=None):
    """Periodic Worley: returns (d[k], idx[k], pts). Distances in tile units (x scaled by aspect)."""
    H, W = shape
    ax, ay = aspect
    if pts is None:
        pts = R(seed).random((npts, 2))
    tree = cKDTree(pts * [ax, ay], boxsize=[ax, ay])
    x, y = grid(W, H)
    q = np.stack([(x * ax).ravel(), (y * ay).ravel()], -1)
    q = np.mod(q, [ax, ay])
    d, idx = tree.query(q, k=k)
    return d.reshape(H, W, k), idx.reshape(H, W, k), pts


def blur(a, s):
    return ndimage.gaussian_filter(a, s, mode='wrap')


def down(a, f):
    if f == 1:
        return a
    H, W = a.shape[:2]
    sh = (H // f, f, W // f, f) + a.shape[2:]
    return a.reshape(sh).mean(axis=(1, 3))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(h, px_size=1.0, strength=1.0, rms=None):
    """h in metres (or any unit) on a pixel grid of px_size -> unit normals HxWx3 (OpenGL, +v up).
    rms: if given, rescale slopes so their RMS equals this (authoring-friendly strength)."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * px_size)
    dy = (np.roll(h, 1, 0) - np.roll(h, -1, 0)) / (2 * px_size)
    if rms:
        k = rms / (np.sqrt((dx * dx + dy * dy).mean()) + 1e-12)
        dx, dy = dx * k, dy * k
    n = np.dstack([-dx * strength, -dy * strength, np.ones_like(h)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def down_normals(n, f):
    n = down(n, f)
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def save(img, name, q=80, credit=PROCEDURAL, lossless=False, kind='color'):
    """img: HxW or HxWx3 float [0,1] (colour maps are sRGB values). Writes assets/tex/<name>.webp"""
    a = np.clip(np.asarray(img), 0, 1)
    u8 = (a * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(u8, 'L' if u8.ndim == 2 else 'RGB')
    path = os.path.join(OUT, name + '.webp')
    if lossless:
        im.save(path, 'WEBP', lossless=True, quality=100, method=6)
    else:
        im.save(path, 'WEBP', quality=q, method=6)
    prev = im if max(im.size) <= 512 else im.resize((512, 512), Image.LANCZOS)
    prev.save(os.path.join(PREVIEW, name + '.png'))
    size = os.path.getsize(path)
    info = {'bytes': size, 'px': im.size[0]}
    if kind == 'color':
        lin = srgb_to_lin(a)
        lum = lin if lin.ndim == 2 else (lin @ np.array([0.2126, 0.7152, 0.0722]))
        info['meanLin'] = round(float(lum.mean()), 4)
        m = [float(lin.mean())] * 3 if lin.ndim == 2 else [float(lin[..., c].mean()) for c in range(3)]
        info['meanRGB'] = [round(v, 4) for v in m]
    elif kind == 'rough':
        info['mean'] = round(float(a.mean() if a.ndim == 2 else a[..., 1].mean()), 4)
    STATS[name] = info
    CREDITS[name + '.webp'] = credit
    print(f'  {name}.webp  {im.size[0]}x{im.size[1]}  {size / 1024:.0f} KB  {info}')
    return path


def save_normal(n, name, q=90, credit=PROCEDURAL):
    return save(n * 0.5 + 0.5, name, q=q, credit=credit, kind='normal')


def load_rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64) / 255.0


def load_gray(path):
    return np.asarray(Image.open(path).convert('L')).astype(np.float64) / 255.0


def resize(a, w, h=None):
    h = h or w
    if a.ndim == 2:
        return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 65535).astype(np.uint16)).resize((w, h), Image.LANCZOS)).astype(np.float64) / 65535
    return np.dstack([resize(a[..., i], w, h) for i in range(a.shape[2])])


def hsv(h, s, v):
    return np.array(colorsys.hsv_to_rgb(h % 1.0, np.clip(s, 0, 1), np.clip(v, 0, 1)))


GENS = {}


def gen(fn):
    GENS[fn.__name__.replace('gen_', '').replace('_', '-')] = fn
    return fn


# --------------------------------------------------------------------------------------------
# WOOD
# --------------------------------------------------------------------------------------------
@gen
def gen_oak_floor():
    """Herringbone oak floor: 56 planks (0.09 x 0.63 m) recomposed from the hardwood2 photo set.
    Tile = 2*L*sqrt2 = 1.782 m square. Zig-zag spine runs along v."""
    N, SS = 1024, 2
    M = N * SS
    Wp, Lp = 0.09, 0.63
    T = 2 * Lp * math.sqrt(2)
    px = T / M
    src = load_rgb(os.path.join(RAW, 'hardwood2_diffuse.jpg'))          # 1024 x 2048
    srcR = load_gray(os.path.join(RAW, 'hardwood2_roughness.jpg'))
    SH, SW = src.shape[:2]
    Y = src @ np.array([0.3, 0.59, 0.11])
    bands = [(2, 128), (132, 262), (266, 391), (395, 517), (521, 646), (650, 771), (776, 898), (902, 1022)]
    joints = {0: [0, 966], 1: [597, 1565]}
    scale = 104 / Wp                                  # source px per metre
    wpx, lpx = 104, int(round(Lp * scale))
    rr = R(7)
    cands = []
    for bi, (b0, b1) in enumerate(bands):
        js = joints[bi % 2]
        segs = [(js[0] + 4, js[1] - 4), (js[1] + 4, js[0] + SW - 4)]
        for (s0, s1) in segs:
            slack = (s1 - s0) - lpx
            for fx in (0.0, 0.33, 0.66, 1.0):
                for fy in (0.0, 1.0):
                    x0 = s0 + fx * slack
                    y0 = b0 + 3 + fy * max(0, (b1 - b0 - 6) - wpx)
                    xs = (np.arange(0, lpx, 4) + x0).astype(int) % SW
                    ys = (np.arange(0, wpx, 4) + y0).astype(int)
                    patch = Y[np.ix_(ys, xs)]
                    med = np.median(patch)
                    knots = (patch < med * 0.72).mean() + 2.0 * (patch < med * 0.55).mean()
                    cands.append((knots, x0, y0))
    cands.sort(key=lambda c: c[0])
    pool = cands[:int(len(cands) * 0.5)]

    # plank classification (plank frame = floor frame rotated 45 deg)
    x, y = grid(M)
    v = x * T                                        # swapped: zig-zag spine runs along v (toward the back wall)
    u = (1 - y) * T
    c45 = math.sqrt(0.5)
    X = (u - v) * c45
    Yp = (u + v) * c45
    a0 = np.floor((X + Yp) / (2 * Wp))
    b0_ = np.floor((X - Yp) / (2 * Lp))
    pid = np.full((M, M), -1, np.int64)
    S = np.zeros((M, M))
    Tt = np.zeros((M, M))
    na, nb = int(round(T / (Wp * math.sqrt(2)))), 2  # 14 x 2 lattice cells per tile
    for da in (-5, -4, -3, -2, -1, 0, 1):
        for db in (-1, 0, 1):
            a = a0 + da
            b = b0_ + db
            rx = X - a * Wp - b * Lp
            ry = Yp - a * Wp + b * Lp
            inH = (rx >= 0) & (rx < Lp) & (ry >= 0) & (ry < Wp) & (pid < 0)
            inV = (rx >= Lp) & (rx < Lp + Wp) & (ry >= Wp - Lp) & (ry < Wp) & (pid < 0) & ~inH
            ida = np.mod(a, na).astype(np.int64)
            idb = np.mod(b, nb).astype(np.int64)
            base = (ida * nb + idb) * 2
            pid = np.where(inH, base, pid)
            S = np.where(inH, rx, S)
            Tt = np.where(inH, ry, Tt)
            pid = np.where(inV, base + 1, pid)
            S = np.where(inV, ry - (Wp - Lp), S)
            Tt = np.where(inV, rx - Lp, Tt)
    assert (pid >= 0).all(), 'herringbone classification hole'
    nP = na * nb * 2
    order = rr.permutation(len(pool))
    P = []
    for i in range(nP):
        k, x0, y0 = pool[order[i % len(pool)]]
        P.append(dict(x0=x0, y0=y0, flip=rr.random() < 0.5,
                      h=rr.uniform(0.083, 0.1), s=rr.uniform(0.27, 0.37), val=rr.uniform(0.58, 0.7),
                      tilt=(rr.normal(0, 0.0035), rr.normal(0, 0.0035)), cup=rr.uniform(0.0, 0.05),
                      rough=rr.normal(0, 0.035)))
    pidf = pid.ravel()
    Sf, Tf = S.ravel(), Tt.ravel()
    flip = np.array([p['flip'] for p in P])[pidf]
    s_ = np.where(flip, Lp - Sf, Sf)
    t_ = np.where(flip, Wp - Tf, Tf)
    sx = np.array([p['x0'] for p in P])[pidf] + s_ * scale
    sy = np.array([p['y0'] for p in P])[pidf] + t_ * scale
    coords = np.stack([sy, sx])
    samp = np.stack([ndimage.map_coordinates(src[..., c], coords, order=1, mode='grid-wrap') for c in range(3)], -1)
    sampR = ndimage.map_coordinates(srcR, coords, order=1, mode='grid-wrap')
    lum = samp @ np.array([0.3, 0.59, 0.11])
    pm = ndimage.mean(lum, pidf, np.arange(nP))
    d = lum / np.asarray(pm)[pidf]
    d = np.clip(d, 0.35, 1.6)
    d = np.where(d < 0.74, 0.74 + (d - 0.74) * 0.3, d)          # heal knots / darkest latewood
    # recolour: per-plank oak base, latewood (d<1) slightly more saturated / warmer
    base = np.array([hsv(p['h'], p['s'], p['val']) for p in P])[pidf]
    dd = d ** 0.85
    gam = np.array([0.85, 1.0, 1.22])
    col = base * dd[:, None] ** gam[None, :]
    # keep a hint of the photo's own hue variation
    photo = samp / (np.asarray(ndimage.mean(lum, pidf, np.arange(nP)))[pidf][:, None] + 1e-6)
    photo = photo / (photo.mean(1, keepdims=True) + 1e-6)
    col = col * (1 + 0.18 * (photo - 1))
    # edges: micro bevel + groove
    e = np.minimum(np.minimum(Sf, Lp - Sf), np.minimum(Tf, Wp - Tf))
    groove = 1 - smoothstep(0.0, 0.0011, e)
    col = col * (1 - 0.55 * groove[:, None])
    col = col.reshape(M, M, 3)
    # height (metres): grain relief + cup + tilt + bevel
    hgt = (1 - d) * 0.00012
    tilt = np.array([p['tilt'] for p in P])[pidf]
    cup = np.array([p['cup'] for p in P])[pidf]
    hgt = hgt + tilt[:, 0] * (s_ - Lp / 2) + tilt[:, 1] * (t_ - Wp / 2) - cup * ((t_ - Wp / 2) / (Wp / 2)) ** 2 * 0.0004
    bevel = np.clip(0.0016 - e, 0, None)
    hgt = hgt - bevel * 0.35 - groove * 0.0003
    hgt = hgt.reshape(M, M)
    n = normal_from_height(hgt, px)
    # roughness: satin lacquer + scratches from the photo's roughness map + per-plank variation
    rough = 0.40 + np.array([p['rough'] for p in P])[pidf] + 0.10 * np.clip((sampR - 0.34) * 2.5, -0.3, 1.0) \
        - 0.04 * (1 - np.clip(d, 0, 1.2)) + 0.45 * groove
    rough = rough.reshape(M, M)
    save(down(col, SS), 'oak-floor_c', q=82, credit=HARDWOOD)
    save_normal(down_normals(n, SS), 'oak-floor_n', q=86, credit=HARDWOOD)
    save(down(rough, SS * 2), 'oak-floor_r', q=80, credit=HARDWOOD, kind='rough')


@gen
def gen_wood():
    """Furniture woods: edge-glued boards, grain along u. Tile 0.6 m (512 px).
    Grain luminance from SheenChair (CC0) wood base, tone/board variation procedural."""
    N = 512
    g = load_gray(os.path.join(GLBTEX, 'SheenChair_3_tex.png'))       # 512, grain vertical
    g = np.rot90(g, 1)                                                 # grain along u
    g = g / g.mean()
    rr = R(21)
    x, y = grid(N)
    nb = 5                                                             # boards across v
    board = np.floor(y * nb).astype(int)
    offs = rr.integers(0, N, nb)
    flips = rr.random(nb) < 0.5
    G = np.zeros((N, N))
    for b in range(nb):
        m = board == b
        sh = np.roll(g, offs[b], axis=1)
        sh = np.roll(sh, rr.integers(0, N), axis=0)
        if flips[b]:
            sh = sh[::-1, :]
        G[m] = sh[m]
    tone = np.array([rr.normal(0, 0.05) for _ in range(nb)])[board]
    streak = fnoise((N, N), 22, beta=2.2, ax=6, ay=1, hi=40) * 0.05       # long tone streaks along grain
    seam = np.minimum(np.mod(y * nb, 1), 1 - np.mod(y * nb, 1)) / nb    # distance to board seam (tile units)
    seamd = 1 - smoothstep(0, 0.6 / N, seam)
    d = G * (1 + tone + streak)
    d = d * (1 - 0.18 * seamd)
    def colourise(base, gam, contrast):
        dd = np.clip(d, 0.2, 2.0) ** contrast
        return np.clip(base[None, None, :] * dd[..., None] ** gam[None, None, :], 0, 1)
    oak = colourise(hexrgb('#c09a72'), np.array([0.9, 1.0, 1.25]), 0.9)
    walnut_d = d
    wal = colourise(hexrgb('#5b3f2f'), np.array([0.85, 1.0, 1.15]), 1.25)
    # walnut: add purple-grey cast in darks, warm in lights
    wl = wal @ np.array([0.3, 0.59, 0.11])
    wal = wal + (0.5 - wl)[..., None] * np.array([0.02, -0.01, 0.0]) * 0.8
    save(oak, 'wood-oak_c', q=80, credit=SHEENCHAIR)
    save(wal, 'wood-walnut_c', q=80, credit=SHEENCHAIR)
    h = blur(G, 0.7) * 0.00025 - seamd * 0.0002
    n = normal_from_height(h, 0.6 / N, rms=0.07)
    save_normal(n, 'wood_n', q=86, credit=SHEENCHAIR)
    rough = 0.78 + 0.25 * np.clip(1 - G, -0.4, 0.6) + 0.1 * seamd       # pores/latewood rougher (multiplier)
    save(np.clip(rough, 0, 1), 'wood_r', q=80, credit=SHEENCHAIR, kind='rough')


# --------------------------------------------------------------------------------------------
# PLASTER / STONE / MINERAL
# --------------------------------------------------------------------------------------------
@gen
def gen_plaster():
    """Limewash: soft cloudy mottling (colour tile 3 m) + brush-stroke micro relief (normal tile 1 m)."""
    N = 512
    c1 = fnoise((N, N), 31, beta=2.6, hi=60)
    c2 = fnoise((N, N), 32, beta=2.0, lo=4, hi=90, rot=0.7, ax=2.5)        # diagonal brush clouds
    c3 = fnoise((N, N), 33, beta=2.0, lo=4, hi=90, rot=-0.7, ax=2.5)
    m = 0.55 * c1 + 0.3 * c2 + 0.3 * c3
    lum = 0.93 + 0.06 * np.tanh(m * 0.9)
    save(lum, 'plaster_c', q=82)
    # deeper, chalkier mottling for dark limewash (bottle green)
    lum2 = 0.9 + 0.06 * np.tanh(m * 1.0) + 0.02 * fnoise((N, N), 34, beta=1.4, lo=20)
    save(np.clip(lum2, 0, 1), 'plaster-deep_c', q=82)
    # normal (1 m tile): brush strokes criss-cross + fine grit
    s1 = fnoise((N, N), 35, beta=1.6, lo=6, hi=160, rot=0.75, ax=4)
    s2 = fnoise((N, N), 36, beta=1.6, lo=6, hi=160, rot=-0.75, ax=4)
    grit = fnoise((N, N), 37, beta=0.6, lo=100)
    h = (0.6 * s1 + 0.6 * s2) * 0.00012 + grit * 0.000012
    n = normal_from_height(h, 1.0 / N, rms=0.035)
    save_normal(n, 'plaster_n', q=84)


@gen
def gen_terrazzo():
    """Terrazzo, tile 1.2 m @1024: polygonal marble chips in a warm white cement matrix."""
    N, SS = 1024, 2
    M = N * SS
    rr = R(41)
    x, y = grid(M)
    matrix = hexrgb('#e8e2d7')
    fine = fnoise((M, M), 42, beta=0.3, lo=300)
    col = np.ones((M, M, 3)) * matrix
    col *= (1 + 0.035 * fnoise((M, M), 43, beta=2.2, hi=30))[..., None]
    # sand specks
    speck = fine > 2.1
    col[speck] = col[speck] * 0.72
    speck2 = fine < -2.3
    col[speck2] = col[speck2] * 0.9 + 0.1
    palette = [('#f4efe7', 24), ('#d9d5cf', 16), ('#b5aea6', 10), ('#e2b3a6', 14), ('#c98b7e', 6), ('#7c3530', 4),
               ('#3f5d4f', 5), ('#403d3c', 5), ('#c7a46a', 3)]
    pc = np.array([hexrgb(c) for c, _ in palette])
    pw = np.array([w for _, w in palette], float)
    pw /= pw.sum()
    chipmask = np.zeros((M, M), bool)
    rough = np.full((M, M), 0.30)
    height = np.zeros((M, M))
    # three layers of chips: big sparse, medium, small dense
    for li, (npts, gap, keep) in enumerate([(700, 0.0024, 0.5), (5000, 0.0011, 0.5), (26000, 0.0006, 0.42)]):
        d, idx, pts = worley((M, M), npts, 44 + li)
        f1, f2 = d[..., 0], d[..., 1]
        cid = idx[..., 0]
        sel = rr.random(npts) < keep
        g = gap * (0.7 + 0.6 * rr.random(npts))
        inside = sel[cid] & ((f2 - f1) > g[cid]) & ~chipmask
        ci = rr.choice(len(pc), npts, p=pw)
        cc = pc[ci][cid]
        # chip interior variation + slight darker rim
        var = 1 + 0.06 * fnoise((M, M), 50 + li, beta=1.5, lo=10) * (li < 2)
        rim = smoothstep(0, g[cid] * 1.6, (f2 - f1) - g[cid])
        chip = cc * (var * (0.93 + 0.07 * rim))[..., None]
        col = np.where(inside[..., None], chip, col)
        rough = np.where(inside, 0.2, rough)
        height = np.where(inside, 1.0, height)
        chipmask |= inside
    col = down(col, SS)
    save(col, 'terrazzo_c', q=74)
    h = blur(height, 1.0) * 0.00004 + fine * 0.000004
    n = down_normals(normal_from_height(h, 1.2 / M, rms=0.04), SS * 2)
    save_normal(n, 'terrazzo_n', q=82)
    save(down(rough, SS * 2) / 0.30 * 0.8, 'terrazzo_r', q=80, kind='rough')


def vein_field(M, seed, freq, warp_amp, octs=4, beta=2.0):
    """Periodic domain-warped sinusoidal vein distance in [0,1] (0 = on a vein)."""
    x, y = grid(M)
    w1 = fnoise((M, M), seed, beta=beta + 0.6, hi=18)
    w2 = fnoise((M, M), seed + 1, beta=beta, lo=3, hi=60)
    a, b = freq
    ph = 2 * np.pi * (a * x + b * y) + warp_amp * (w1 + 0.35 * w2)
    return np.abs(np.sin(ph * 0.5))


@gen
def gen_marble():
    """Carrara (white, soft grey feathered veins along a dominant diagonal), tile 1.6 m @1024."""
    M = 1024
    x, y = grid(M)
    base = fnoise((M, M), 61, beta=2.8, hi=40)
    wx = fnoise((M, M), 63, beta=3.0, hi=14) * 18.0
    wy = fnoise((M, M), 64, beta=3.0, hi=14) * 18.0

    def warped(field, amt):
        return ndimage.map_coordinates(field, [np.mod(np.arange(M)[:, None] + wy * amt, M),
                                               np.mod(np.arange(M)[None, :] + wx * amt, M)], order=1, mode='grid-wrap')

    def veins(seed, beta, ay, rot, width, amt):
        n = warped(fnoise((M, M), seed, beta=beta, ax=1, ay=ay, rot=rot, hi=60), amt)
        return np.exp(-(n / width) ** 2)

    fade = lambda sd, p: norm01(fnoise((M, M), sd, beta=2.4, hi=12)) ** p
    soft = veins(65, 3.2, 3.0, 0.55, 0.22, 1.0) * fade(66, 1.2)
    main = veins(67, 3.0, 3.5, 0.6, 0.05, 1.0) * fade(68, 1.4)
    fine = veins(69, 2.6, 2.5, 0.4, 0.035, 1.4) * fade(70, 2.2)
    hair = veins(71, 2.2, 2.0, 0.9, 0.03, 1.8) * fade(72, 3.0)
    cloud = norm01(fnoise((M, M), 73, beta=2.2, lo=2, hi=50)) ** 3
    g = 0.945 - 0.025 * base - 0.22 * soft - 0.42 * main - 0.30 * fine - 0.2 * hair - 0.08 * cloud
    tint = np.dstack([g * 0.992, g * 0.996, g * 1.012])                   # faint cool grey veins
    tint += (0.01 * fnoise((M, M), 74, beta=2.5, hi=20))[..., None] * np.array([1.0, 0.7, 0.2])
    save(np.clip(tint, 0, 1), 'marble_c', q=84)
    rough = 0.85 + 0.15 * np.clip(main + fine, 0, 1)
    save(down(rough, 2), 'marble_r', q=78, kind='rough')


@gen
def gen_marble_green():
    """Verde Alpi style: bottle green with mottled patches, white/pale-green crackle veins. Tile 1.2 m."""
    N = 1024
    M = N
    x, y = grid(M)
    b1 = fnoise((M, M), 81, beta=2.4, hi=50)
    b2 = fnoise((M, M), 82, beta=1.6, lo=8, hi=160)
    dark = hexrgb('#16302a')
    mid = hexrgb('#2e5646')
    light = hexrgb('#6f9a84')
    t = norm01(b1 * 0.8 + b2 * 0.4, -2.2, 2.2)
    col = dark[None, None] * (1 - t[..., None]) ** 1.2 + mid[None, None] * t[..., None]
    # crackle network (domain warped Worley edges)
    wx = fnoise((M, M), 83, beta=2.6, hi=12) * 0.018
    wy = fnoise((M, M), 84, beta=2.6, hi=12) * 0.018
    crack = np.zeros((M, M))
    for li, (npts, wdt, keepf, amp) in enumerate([(50, 0.0022, 0.7, 1.0), (260, 0.0012, 0.45, 0.75), (1400, 0.0007, 0.25, 0.5)]):
        pts = R(85 + li).random((npts, 2))
        tree = cKDTree(pts, boxsize=1.0)
        xs = np.mod(x + wx * (1 + li), 1)
        ys = np.mod(y + wy * (1 + li), 1)
        dd, ii = tree.query(np.stack([xs.ravel(), ys.ravel()], -1), k=2)
        edge = (dd[:, 1] - dd[:, 0]).reshape(M, M)
        keep = R(90 + li).random(npts) < keepf
        vary = norm01(fnoise((M, M), 95 + li, beta=2.0, hi=20)) ** 1.5
        crack = np.maximum(crack, amp * np.exp(-(edge / wdt) ** 2) * keep[ii[:, 0].reshape(M, M)] * (0.35 + 0.65 * vary))
    v1 = vein_field(M, 87, (2, 1), 6.0)
    wide = np.exp(-(v1 / 0.03) ** 2) * norm01(fnoise((M, M), 88, beta=2.2, hi=10)) ** 1.3
    pale = hexrgb('#dfe9df')
    col = col * (1 - 0.55 * wide[..., None]) + light[None, None] * 0.55 * wide[..., None]
    col = col * (1 - 0.8 * crack[..., None]) + pale[None, None] * 0.8 * crack[..., None]
    col *= (1 + 0.05 * fnoise((M, M), 89, beta=1.0, lo=60))[..., None]
    save(np.clip(col, 0, 1), 'marble-green_c', q=84)


@gen
def gen_travertine():
    """Vein-cut travertine, tile 1.2 m @1024: horizontal bands + elongated pores (recessed, rough)."""
    N = 1024
    M = N
    x, y = grid(M)
    warp = fnoise((M, M), 91, beta=2.8, hi=10) * 0.008
    band = fnoise((M, M), 92, beta=1.4, ay=1, ax=30, lo=2, hi=200)          # horizontal bands
    bandw = ndimage.map_coordinates(band, [np.mod((y + warp) * M, M), x * M], order=1, mode='grid-wrap')
    c0, c1, c2 = hexrgb('#e3d4bd'), hexrgb('#c2a784'), hexrgb('#f1e7d7')
    t = norm01(bandw, -2, 2)
    col = c1[None, None] * (1 - t[..., None]) + c2[None, None] * t[..., None]
    col = col * 0.75 + c0[None, None] * 0.25
    col *= (1 + 0.035 * fnoise((M, M), 93, beta=2.0, lo=4, hi=80))[..., None]
    # pores: elongated along u (anisotropic Worley)
    d, idx, pts = worley((M, M), 2600, 94, aspect=(1.0, 6.0))
    f1 = d[..., 0]
    rr = R(95)
    sz = (0.002 + 0.01 * rr.random(2600) ** 3)
    cid = idx[..., 0]
    pore = smoothstep(sz[cid], sz[cid] * 0.55, f1)
    # pores cluster in some bands
    pore *= smoothstep(-0.6, 0.8, fnoise((M, M), 96, beta=1.2, ax=20, lo=2, hi=100))
    micro = fnoise((M, M), 97, beta=0.8, lo=80) > 2.3
    pore = np.maximum(pore, micro * 0.6)
    deep = hexrgb('#9c8466')
    col = col * (1 - 0.65 * pore[..., None]) + deep[None, None] * 0.65 * pore[..., None]
    save(np.clip(col, 0, 1), 'travertine_c', q=82)
    h = -pore * 0.0012 + bandw * 0.00003
    n = down_normals(normal_from_height(blur(h, 0.6), 1.2 / M, rms=0.12), 2)
    save_normal(n, 'travertine_n', q=84)
    rough = 0.72 + 0.28 * pore
    save(down(rough, 2), 'travertine_r', q=78, kind='rough')


@gen
def gen_concrete():
    """Polished / sealed concrete, tile 2 m @512."""
    N = 512
    m = fnoise((N, N), 101, beta=2.4, hi=60)
    f = fnoise((N, N), 102, beta=1.0, lo=40)
    lum = 0.9 + 0.05 * np.tanh(m) + 0.02 * f
    d, idx, pts = worley((N, N), 500, 103)
    sz = 0.0015 + 0.004 * R(104).random(500) ** 4
    pit = smoothstep(sz[idx[..., 0]], sz[idx[..., 0]] * 0.4, d[..., 0])
    lum = lum * (1 - 0.35 * pit)
    save(lum, 'concrete_c', q=80)
    h = -pit * 0.0015 + f * 0.00002 + m * 0.00005
    save_normal(normal_from_height(h, 2.0 / N, rms=0.05), 'concrete_n', q=82)
    save(0.8 + 0.12 * np.tanh(m) + 0.15 * pit, 'concrete_r', q=78, kind='rough')


@gen
def gen_checker():
    """Worn stone checkerboard (three.js FloorsCheckerboard photos). Tile 1.8 m (6x6 squares)."""
    c = load_rgb(os.path.join(RAW, 'FloorsCheckerboard_S_Diffuse.jpg'))
    n = load_rgb(os.path.join(RAW, 'FloorsCheckerboard_S_Normal.jpg'))
    # warm up the cold photo slightly, deepen the dark squares into near-black stone
    lum = c @ np.array([0.3, 0.59, 0.11])
    dark = lum < 0.45
    c2 = c * np.array([1.0, 0.985, 0.95])
    c2 = np.where(dark[..., None], c2 * 0.78, c2 * 1.03)
    save(np.clip(c2, 0, 1), 'stone-checker_c', q=82, credit=CHECKER)
    save(n, 'stone-checker_n', q=76, credit=CHECKER, kind='normal')


# --------------------------------------------------------------------------------------------
# METALS
# --------------------------------------------------------------------------------------------
@gen
def gen_brushed():
    """Brushed metal (streaks along v), tile 0.3 m @512: roughness multiplier + faint normal."""
    N = 512
    s = fnoise((N, N), 111, beta=1.2, ax=1, ay=40, lo=4)                 # vertical streaks
    s2 = fnoise((N, N), 112, beta=2.0, ax=1, ay=12, hi=60)
    rr = R(113)
    scr = np.zeros((N, N))
    x, y = grid(N)
    for _ in range(26):                                                    # sparse long scratches
        x0, a = rr.random(), rr.normal(0, 0.03)
        dist = np.abs(np.mod(x - x0 - a * y + 0.5, 1) - 0.5)
        seg = smoothstep(0.35, 0.0, np.abs(np.mod(y - rr.random() + 0.5, 1) - 0.5)) * (rr.random() < 0.7)
        scr = np.maximum(scr, np.exp(-(dist * N / 0.7) ** 2) * seg * rr.uniform(0.3, 1))
    rough = 0.82 + 0.1 * s + 0.08 * s2 + 0.25 * scr
    save(np.clip(rough, 0, 1), 'brushed_r', q=84, kind='rough')
    h = s * 0.0000025 + scr * -0.000004
    save_normal(normal_from_height(h, 0.3 / N, rms=0.03), 'brushed_n', q=86)


# --------------------------------------------------------------------------------------------
# SOFT GOODS (non-garment)
# --------------------------------------------------------------------------------------------
@gen
def gen_rug():
    """Wool loop-pile (berber) rug, tile 0.3 m @512."""
    N, SS = 512, 2
    M = N * SS
    rr = R(121)
    # loops on a jittered grid: rows 4.5 mm, columns 3.8 mm
    rows, cols = int(0.3 / 0.0045), int(0.3 / 0.0038)
    gy, gx = np.mgrid[0:rows, 0:cols].astype(float)
    pts = np.stack([(gx + 0.5 + 0.5 * (gy % 2) + rr.normal(0, 0.12, gx.shape)) / cols,
                    (gy + 0.5 + rr.normal(0, 0.1, gy.shape)) / rows], -1).reshape(-1, 2) % 1.0
    d, idx, _ = worley((M, M), len(pts), 0, aspect=(1.0, rows / cols), pts=pts)
    f1, f2 = d[..., 0] * cols, d[..., 1] * cols
    loop = np.clip(1 - (f1 / (0.5 * (f1 + f2) + 1e-6)) ** 2, 0, 1) ** 0.6
    ht = rr.uniform(0.75, 1.0, len(pts))[idx[..., 0]]
    fib = fnoise((M, M), 122, beta=0.8, lo=60)
    h = loop * ht + 0.08 * fib
    n = down_normals(normal_from_height(h * 0.0022, 0.3 / M), SS)
    save_normal(n, 'rug_n', q=78)
    # heathered yarn: 3 tones per loop + fleck
    tone = rr.choice([0.78, 0.9, 1.0, 1.0, 0.96], len(pts))[idx[..., 0]]
    col = (0.6 + 0.4 * loop) * tone * (1 + 0.05 * fib)
    save(down(np.clip(col, 0, 1), SS), 'rug_c', q=80)


@gen
def gen_paper():
    """Paper / kraft / cardboard fibre detail, tile 0.25 m @512 (tinted by material colour)."""
    N = 512
    rr = R(131)
    from PIL import ImageDraw
    big = Image.new('L', (N, N), 128)
    dr = ImageDraw.Draw(big)
    for _ in range(9000):
        x0, y0 = rr.random() * N, rr.random() * N
        ang = rr.random() * np.pi
        ln = rr.uniform(3, 18)
        x1, y1 = x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln
        v = int(128 + rr.choice([-1, 1]) * rr.uniform(10, 40))
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                dr.line([(x0 + ox, y0 + oy), (x1 + ox, y1 + oy)], fill=v, width=1)
    fib = (np.asarray(big).astype(float) - 128) / 40
    fib = blur(fib, 0.5)
    m = fnoise((N, N), 132, beta=2.0, lo=2, hi=60)
    lum = 0.93 + 0.035 * fib + 0.03 * m
    save(np.clip(lum, 0, 1), 'paper_c', q=80)
    h = fib * 1.0 + blur(m, 1.0) * 0.08                     # fibre tooth only — paper is flat, not orange peel
    save_normal(normal_from_height(h, 0.25 / N, rms=0.035), 'paper_n', q=82)


# --------------------------------------------------------------------------------------------
# FABRICS  (colour = near-white luminance detail; roughness = multiplier around ~0.9)
# --------------------------------------------------------------------------------------------
def thread_noise(n, length, seed, beta=1.5, hi=None):
    """Per-thread periodic 1D noise along each thread: (n, length), unit std per thread."""
    F = np.fft.fft(R(seed).standard_normal((n, length)), axis=1)
    f = np.abs(np.fft.fftfreq(length) * length)
    f[0] = 1
    amp = f ** (-beta / 2)
    amp[0] = 0
    if hi:
        amp *= np.exp(-(f / hi) ** 2)
    out = np.real(np.fft.ifft(F * amp, axis=1))
    return (out - out.mean(1, keepdims=True)) / (out.std(1, keepdims=True) + 1e-9)


def prof(f, t):
    return np.sqrt(np.clip(1 - ((f - 0.5) / (0.5 * t)) ** 2, 0, 1))


def weave(M, nx, ny, over, seed, twarp=0.85, tweft=0.85, tjit=0.05, wob=0.05, slub=0.0, slub_weft=None,
          ply=0.0, lift=0.55, fuzz=0.0):
    """Woven fabric height field (tile = MxM px). over: (px, py) array, 1 = warp over weft (warp i, weft j).
    Warps run vertically (along v), wefts horizontally. j = image-row order (downwards)."""
    rr = R(seed)
    x, y = grid(M)
    X = x * nx + fnoise((M, M), seed + 1, beta=3.0, hi=8) * wob
    Y = y * ny + fnoise((M, M), seed + 2, beta=3.0, hi=8) * wob
    i = np.floor(X).astype(int)
    fx = X - i
    i %= nx
    j = np.floor(Y).astype(int)
    fy = Y - j
    j %= ny
    P = np.asarray(over)
    px_, py_ = P.shape
    ov = lambda ii, jj: P[ii % px_, jj % py_]
    jn = np.where(fy > 0.5, j + 1, j - 1)
    in_ = np.where(fx > 0.5, i + 1, i - 1)
    o = ov(i, j).astype(float)
    ew = o + (ov(i, jn) - o) * smoothstep(0, 1, np.abs(fy - 0.5))
    ef = o + (ov(in_, j) - o) * smoothstep(0, 1, np.abs(fx - 0.5))
    rows = np.minimum((y * M).astype(int), M - 1)
    cols = np.minimum((x * M).astype(int), M - 1)
    sw = thread_noise(nx, M, seed + 3, beta=1.3)
    sf = thread_noise(ny, M, seed + 4, beta=1.3)
    twi = twarp * (1 + tjit * rr.standard_normal(nx))[i] * (1 + slub * np.clip(sw[i, rows] - 0.9, 0, None))
    sl2 = slub if slub_weft is None else slub_weft
    tfj = tweft * (1 + tjit * rr.standard_normal(ny))[j] * (1 + sl2 * np.clip(sf[j, cols] - 0.9, 0, None))
    hw = prof(fx, np.clip(twi, 0.2, 1.25)) * ((1 - lift) + lift * ew)
    hf = prof(fy, np.clip(tfj, 0.2, 1.25)) * ((1 - lift) + lift * (1 - ef))
    if ply:
        hw *= 1 - ply * 0.28 * (0.5 + 0.5 * np.cos(2 * np.pi * (2 * fx + 1.6 * Y)))
        hf *= 1 - ply * 0.28 * (0.5 + 0.5 * np.cos(2 * np.pi * (2 * fy + 1.6 * X)))
    h = np.maximum(hw, hf)
    if fuzz:
        h = h + fuzz * fnoise((M, M), seed + 5, beta=0.9, lo=M / 16)
    return dict(h=h, warp=hw >= hf, i=i, j=j, fx=fx, fy=fy, sw=sw[i, rows], sf=sf[j, cols], rows=rows, cols=cols)


def stockinette(U, V, lean=0.42, a_minor=0.2, a_major=0.62):
    """Knit V-stitch height. U: wale coordinate (1 per wale), V: course coordinate increasing UP."""
    h = np.zeros_like(U)
    cu = np.floor(U)
    cv0 = np.floor(V)
    ca, sa = math.cos(lean), math.sin(lean)
    for dv in (-1, 0, 1):
        fv = V - (cv0 + dv) - 0.5
        for du_ in (-1, 0, 1):
            fu = U - (cu + du_)
            for side, sg in ((0.28, 1), (0.72, -1)):
                du = fu - side
                p = du * ca + fv * sa * sg
                q = -du * sa * sg + fv * ca
                r2 = (p / a_minor) ** 2 + (q / a_major) ** 2
                leg = np.sqrt(np.clip(1 - r2, 0, 1))
                # yarn ply twist striation along the leg
                leg *= 1 - 0.12 * (0.5 + 0.5 * np.cos(2 * np.pi * (p / a_minor * 0.9 + q * 3.2)))
                h = np.maximum(h, leg)
    return h


def purl(U, V):
    """Reverse stockinette: staggered horizontal loop heads."""
    h = np.zeros_like(U)
    for dv in (-1, 0, 1):
        for du_ in (-1, 0, 1):
            for (cxo, cyo) in ((0.5, 0.25), (0.0, 0.75)):
                cu = np.floor(U) + du_ + cxo
                cv = np.floor(V) + dv + cyo
                r2 = ((U - cu) / 0.5) ** 2 + ((V - cv) / 0.24) ** 2
                h = np.maximum(h, np.sqrt(np.clip(1 - r2, 0, 1)))
    return h


def fabric_out(name, h, M, N, rms, col, rough, credit=PROCEDURAL, q_n=80, q_c=82):
    f = M // N
    n = normal_from_height(h, 1.0, rms=rms)
    save_normal(down_normals(n, f), f'fab-{name}_n', q=q_n, credit=credit)
    save(down(np.clip(col, 0, 1), f), f'fab-{name}_c', q=q_c, credit=credit)
    save(down(np.clip(rough, 0, 1), f), f'fab-{name}_r', q=80, credit=credit, kind='rough')


def cavity(h, lo=0.8, p=0.7):
    hn = norm01(h, np.percentile(h, 1), np.percentile(h, 99.5))
    return lo + (1 - lo) * hn ** p


def groove(h, lo=0.55, edge=0.3):
    """Darken only the deepest part of the relief (crevices between cables / ribs)."""
    hn = norm01(h, np.percentile(h, 1), np.percentile(h, 99.5))
    return lo + (1 - lo) * smoothstep(0.0, edge, hn)


@gen
def gen_fab_cotton():
    """Poplin: fine warp, fuller weft -> soft horizontal rib. Tile 1.2 cm, 256 px."""
    N, M = 256, 512
    w = weave(M, 40, 28, [[1, 0], [0, 1]], 201, twarp=0.78, tweft=1.0, tjit=0.05, wob=0.06, fuzz=0.02)
    rr = R(202)
    tone = 1 + 0.025 * rr.standard_normal(40)[w['i']] * w['warp'] + 0.025 * rr.standard_normal(28)[w['j']] * ~w['warp']
    col = 0.97 * cavity(w['h'], 0.84) * tone
    rough = 0.9 + 0.1 * (1 - norm01(w['h']))
    fabric_out('cotton', w['h'], M, N, 0.32, col, rough)


@gen
def gen_fab_denim():
    """3/1 right-hand twill (warp face), tile 2.4 cm @512. Near-white variant + baked indigo variant."""
    N, M = 512, 1024
    nx, ny = 56, 48
    over = np.array([[1 if ((i + j) % 4) != 3 else 0 for j in range(4)] for i in range(4)])
    w = weave(M, nx, ny, over, 211, twarp=0.95, tweft=0.82, tjit=0.07, wob=0.07, slub=0.25, slub_weft=0.1, lift=0.6,
              fuzz=0.02)
    cav = cavity(w['h'], 0.78)
    mott = np.tanh(w['sw'] * 0.8)                                     # ring-spun slub mottling along each warp
    big = fnoise((M, M), 212, beta=2.4, ax=1, ay=4, hi=12)            # soft wash fade
    warp_t = 0.9 + 0.06 * mott + 0.03 * big
    col = np.where(w['warp'], warp_t, 1.0) * cav
    rough = 0.92 + 0.08 * (1 - norm01(w['h']))
    fabric_out('denim', w['h'], M, N, 0.36, col, rough)
    # indigo: dyed warp (ring-dyed -> slubs lighter) over ecru weft
    ind_d, ind_l = hexrgb('#0d1840'), hexrgb('#3a62ad')
    t = np.clip(0.32 + 0.3 * mott + 0.12 * big, 0, 1)[..., None]
    warpc = ind_d * (1 - t) + ind_l * t
    weftc = hexrgb('#a3aec2') * (0.95 + 0.05 * fnoise((M, M), 213, beta=1, lo=40))[..., None]
    c = np.where(w['warp'][..., None], warpc, weftc) * cav[..., None]
    save(down(np.clip(c, 0, 1), 2), 'fab-denim-indigo_c', q=86)


@gen
def gen_fab_linen():
    """Slubby, open plain weave; tile 3.2 cm @512."""
    N, M = 512, 1024
    w = weave(M, 56, 52, [[1, 0], [0, 1]], 221, twarp=0.74, tweft=0.76, tjit=0.14, wob=0.1, slub=0.45, lift=0.5,
              fuzz=0.035)
    rr = R(222)
    tone = np.where(w['warp'], (1 + 0.035 * rr.standard_normal(56))[w['i']] * (1 + 0.02 * np.clip(w['sw'], -1, 2)),
                    (1 + 0.035 * rr.standard_normal(52))[w['j']] * (1 + 0.02 * np.clip(w['sf'], -1, 2)))
    col = 0.9 * cavity(w['h'], 0.8, 0.6) * tone
    rough = 0.94 + 0.06 * (1 - norm01(w['h']))
    fabric_out('linen', w['h'], M, N, 0.42, col, rough)


def twill_over(n=4, up=2, herring=0):
    if not herring:
        return np.array([[1 if ((i + j) % n) < up else 0 for j in range(n)] for i in range(n)])
    P = np.zeros((2 * herring, n), int)
    for i in range(2 * herring):
        dr = 1 if (i // herring) % 2 == 0 else -1
        for j in range(n):
            P[i, j] = 1 if ((j + dr * i) % n) < up else 0
    return P


@gen
def gen_fab_wool():
    """Worsted/flannel 2/2 twill with fuzz + heather; tile 1.6 cm @256."""
    N, M = 256, 512
    w = weave(M, 48, 48, twill_over(4, 2), 231, twarp=0.92, tweft=0.92, tjit=0.06, wob=0.08, lift=0.5)
    h = blur(w['h'], 1.4) + 0.06 * fnoise((M, M), 232, beta=1.1, lo=20)
    heather = fnoise((M, M), 233, beta=0.8, lo=30) * 0.035 + fnoise((M, M), 234, beta=2, hi=20) * 0.02
    col = 0.93 * cavity(h, 0.86) * (1 + heather)
    rough = np.full((M, M), 0.97) + 0.03 * fnoise((M, M), 235, beta=1, lo=10)
    fabric_out('wool', h, M, N, 0.24, col, rough)


@gen
def gen_fab_tweed():
    """Herringbone twill (reverses every 8 warps) + coloured-yarn flecks; tile 4.5 cm @512."""
    N, M = 512, 1024
    w = weave(M, 64, 64, twill_over(4, 2, herring=8), 241, twarp=0.95, tweft=0.95, tjit=0.1, wob=0.09, slub=0.2,
              lift=0.55)
    h = blur(w['h'], 1.2) + 0.08 * fnoise((M, M), 242, beta=1.0, lo=40)
    rr = R(243)
    tone = np.where(w['warp'], (1 + 0.07 * rr.standard_normal(64))[w['i']], (1 + 0.07 * rr.standard_normal(64))[w['j']])
    d, idx, _ = worley((M, M), 5000, 244)
    fl = rr.random(5000)
    fleck = np.where(d[..., 0] < 0.0022, np.where(fl[idx[..., 0]] < 0.05, 1.18, np.where(fl[idx[..., 0]] > 0.94, 0.62, 1.0)), 1.0)
    fleck = blur(fleck, 1.0)
    heather = 1 + 0.05 * fnoise((M, M), 245, beta=0.7, lo=40)
    col = 0.84 * cavity(h, 0.78) * tone * fleck * heather
    rough = np.full((M, M), 0.98)
    fabric_out('tweed', h, M, N, 0.4, col, rough)


@gen
def gen_fab_canvas():
    """Heavy duck canvas: 2-ply yarns, plain weave; tile 3.2 cm @512."""
    N, M = 512, 1024
    w = weave(M, 40, 40, [[1, 0], [0, 1]], 251, twarp=0.97, tweft=0.97, tjit=0.05, wob=0.05, ply=1.0, lift=0.45,
              fuzz=0.02)
    col = 0.95 * cavity(w['h'], 0.8) * (1 + 0.02 * fnoise((M, M), 252, beta=1.5, lo=4))
    rough = 0.93 + 0.07 * (1 - norm01(w['h']))
    fabric_out('canvas', w['h'], M, N, 0.38, col, rough)


@gen
def gen_fab_silk():
    """Habotai/dupioni: very fine plain weave + faint horizontal slub streaks; tile 1 cm @256."""
    N, M = 256, 512
    w = weave(M, 84, 84, [[1, 0], [0, 1]], 261, twarp=0.95, tweft=0.95, tjit=0.03, wob=0.03, slub=0.3, lift=0.35)
    streak = fnoise((M, M), 262, beta=1.4, ax=20, ay=1, lo=2)
    col = 0.96 * cavity(w['h'], 0.94) * (1 + 0.012 * streak)
    rough = 0.95 + 0.05 * (1 - norm01(w['h']))
    fabric_out('silk', w['h'] + 0.05 * streak, M, N, 0.1, col, rough)


@gen
def gen_fab_satin():
    """5-harness satin: long smooth warp floats; tile 1 cm @256."""
    N, M = 256, 512
    over = np.array([[0 if (j - 2 * i) % 5 == 0 else 1 for j in range(5)] for i in range(5)])
    w = weave(M, 100, 60, over, 271, twarp=1.0, tweft=0.8, tjit=0.03, wob=0.03, lift=0.4)
    col = 0.97 * cavity(w['h'], 0.95)
    rough = 0.9 + 0.1 * (1 - norm01(w['h']))
    fabric_out('satin', w['h'], M, N, 0.08, col, rough)


@gen
def gen_fab_jersey():
    """Single jersey (stockinette V's), fine yarn; tile 1.2 cm @256 (12 wales x 15 courses)."""
    N, M = 256, 512
    x, y = grid(M)
    U = x * 12 + fnoise((M, M), 281, beta=3, hi=6) * 0.05
    V = (1 - y) * 15 + fnoise((M, M), 282, beta=3, hi=6) * 0.05
    h = stockinette(U, V) + 0.04 * fnoise((M, M), 283, beta=1.0, lo=30)
    col = 0.96 * cavity(h, 0.84)
    rough = 0.94 + 0.06 * (1 - norm01(h))
    fabric_out('jersey', h, M, N, 0.34, col, rough)


@gen
def gen_fab_knit():
    """2x2 rib knit (chunky): knit columns proud, purl columns recessed; tile 4 cm @512 (16 wales x 20 courses)."""
    N, M = 512, 1024
    x, y = grid(M)
    U = x * 16 + fnoise((M, M), 291, beta=3, hi=6) * 0.06
    V = (1 - y) * 20 + fnoise((M, M), 292, beta=3, hi=6) * 0.06
    k = np.floor(U).astype(int) % 4
    st = stockinette(U, V)
    pu = purl(U * 1.0, V)
    knitcol = k < 2
    # knit rib: two wales rounded together
    ribu = np.mod(U, 4) / 2.0
    ribprof = np.sqrt(np.clip(1 - (ribu - 0.5) ** 2 * 4, 0, 1))
    h = np.where(knitcol, 0.35 + 0.35 * ribprof + 0.5 * st, 0.05 + 0.3 * pu)
    h = blur(h, 0.8) + 0.03 * fnoise((M, M), 293, beta=1.0, lo=40)
    col = 0.97 * cavity(h, 0.86, 0.8) * groove(h, 0.55, 0.3) * (1 + 0.02 * fnoise((M, M), 294, beta=1.2, lo=8))
    rough = np.full((M, M), 0.98)
    fabric_out('knit', h, M, N, 0.5, col, rough)


@gen
def gen_fab_cable():
    """Aran cable knit: 2 six-stitch cables + single knit column on reverse stockinette. Tile 12 cm @512."""
    N, M = 512, 1024
    x, y = grid(M)
    nw, nc = 22, 28
    U = x * nw + fnoise((M, M), 301, beta=3, hi=6) * 0.05
    V = (1 - y) * nc + fnoise((M, M), 302, beta=3, hi=6) * 0.05
    h = 0.18 + 0.28 * purl(U, V)
    # single knit column at wale 11
    kc = (U >= 11) & (U < 12)
    h = np.where(kc, 0.4 + 0.45 * stockinette(U, V), h)
    c = 7.0 / 14.0
    for u0, off in ((3.0, 0.0), (14.0, 7.0)):
        cl, cr = u0 + 1.5, u0 + 4.5
        phi = np.mod(V + off, 2 * 14) / 14.0
        s1 = smoothstep(0, 1, np.clip(phi / c, 0, 1))
        s2 = smoothstep(0, 1, np.clip((phi - 1) / c, 0, 1))
        posA = np.where(phi < 1, cl + (cr - cl) * s1, cr - (cr - cl) * s2)
        posB = cl + cr - posA
        overA = np.where(phi < c, np.sin(np.pi * phi / c), 0.0)
        overB = np.where((phi >= 1) & (phi < 1 + c), np.sin(np.pi * (phi - 1) / c), 0.0)
        for pos, ovr, und in ((posA, overA, overB), (posB, overB, overA)):
            d = U - pos
            inside = np.abs(d) < 1.55
            sp = np.sqrt(np.clip(1 - (d / 1.6) ** 2, 0, 1))
            st = stockinette(d + 1.5, V)
            hs = 0.42 + 0.3 * ovr - 0.25 * und + 0.4 * sp + 0.32 * st
            hs = hs * smoothstep(1.55, 1.3, np.abs(d))
            h = np.where(inside, np.maximum(h, hs), h)
    h = blur(h, 0.9) + 0.025 * fnoise((M, M), 303, beta=1.0, lo=40)
    col = 0.97 * cavity(h, 0.86, 0.9) * groove(h, 0.5, 0.32) * (1 + 0.02 * fnoise((M, M), 304, beta=1.2, lo=8))
    rough = np.full((M, M), 0.98)
    fabric_out('cable', h, M, N, 0.55, col, rough)


@gen
def gen_fab_corduroy():
    """8-wale corduroy (wales along v, 3 mm); tile 2.4 cm @256."""
    N, M = 256, 512
    x, y = grid(M)
    U = x * 8 + fnoise((M, M), 311, beta=3, hi=5) * 0.03
    fu = np.mod(U, 1)
    ridge = np.clip(1 - (2 * fu - 1) ** 2, 0, 1) ** 0.4
    pile = fnoise((M, M), 312, beta=0.7, lo=40)
    crush = fnoise((M, M), 313, beta=2.0, ax=1, ay=5, hi=10)
    h = ridge + 0.05 * pile
    col = (0.8 + 0.2 * ridge ** 1.5) * (1 + 0.035 * crush) * (1 + 0.02 * pile)
    rough = 0.95 + 0.05 * (1 - ridge)
    fabric_out('corduroy', h, M, N, 0.45, col, rough)


@gen
def gen_fab_fleece():
    """Brushed polar fleece: multi-scale fibre clumps + pills; tile 3 cm @256."""
    N, M = 256, 512
    h = 0.6 * fnoise((M, M), 321, beta=1.6, lo=6, hi=90) + 0.4 * fnoise((M, M), 322, beta=0.8, lo=40)
    d, idx, _ = worley((M, M), 160, 323)
    pill = smoothstep(0.012, 0.004, d[..., 0]) * (R(324).random(160) < 0.5)[idx[..., 0]]
    h = blur(h, 0.8) + 1.2 * pill
    col = 0.95 * cavity(h, 0.88) * (1 + 0.02 * fnoise((M, M), 325, beta=2, hi=10))
    rough = np.full((M, M), 0.99)
    fabric_out('fleece', h, M, N, 0.2, col, rough)


@gen
def gen_fab_velvet():
    """Crushed velvet pile (normal + base from SheenChair, CC0); tile 0.25 m @512."""
    N = 512
    n0 = load_rgb(os.path.join(GLBTEX, 'SheenChair_0_tex.png')) * 2 - 1       # 1024
    n0 = n0 / np.linalg.norm(n0, axis=2, keepdims=True)
    n = down_normals(n0, 2)
    b = load_gray(os.path.join(GLBTEX, 'SheenChair_2_tex.png'))
    b = b / b.mean()
    col = np.clip(0.92 * (1 + (b - 1) * 1.4), 0, 1)
    slope = np.sqrt(n[..., 0] ** 2 + n[..., 1] ** 2)
    rough = 0.9 + 0.1 * norm01(slope)
    save_normal(n, 'fab-velvet_n', q=80, credit=SHEENCHAIR)
    save(col, 'fab-velvet_c', q=82, credit=SHEENCHAIR)
    save(rough, 'fab-velvet_r', q=80, credit=SHEENCHAIR, kind='rough')


@gen
def gen_fab_leather():
    """Pebble-grain leather: domed cells, crease network, pores; tile 7 cm @512."""
    N, M = 512, 1024
    d, idx, _ = worley((M, M), 3400, 331)
    f1, f2 = d[..., 0], d[..., 1]
    t = f1 / (f1 + f2 + 1e-9)
    dome = 1 - (2 * t) ** 2.2
    seam = smoothstep(0.0, 0.12, 0.5 - t)
    crease_n = fnoise((M, M), 332, beta=2.6, hi=24)
    crease = np.exp(-(crease_n / 0.07) ** 2) * norm01(fnoise((M, M), 333, beta=2, hi=10)) ** 1.5
    pores = (fnoise((M, M), 334, beta=0.2, lo=200) > 2.6).astype(float)
    h = 0.5 * dome * seam - 0.6 * crease - 0.15 * blur(pores, 0.6) + 0.1 * fnoise((M, M), 335, beta=2.4, hi=16)
    col = 0.96 * (0.88 + 0.12 * dome * seam) * (1 - 0.1 * crease) * (1 + 0.02 * fnoise((M, M), 336, beta=2, hi=12))
    rough = 0.78 + 0.18 * (1 - dome * seam) + 0.15 * crease
    fabric_out('leather', h, M, N, 0.3, col, rough)


@gen
def gen_fab_suede():
    """Suede / nubuck nap: brushed patches + fine fibre; colour detail from SheenWoodLeatherSofa (CC BY 4.0). Tile 8 cm @512."""
    N = 512
    b = load_rgb(os.path.join(GLBTEX, 'SheenWoodLeatherSofa_0_tex.webp')) @ np.array([0.3, 0.59, 0.11])
    b = b / b.mean()
    patch = fnoise((N, N), 341, beta=2.6, hi=10)
    patch2 = fnoise((N, N), 342, beta=1.6, lo=6, hi=40, ax=3, rot=0.6)
    col = np.clip(0.92 * (1 + (b - 1) * 1.2) * (1 + 0.04 * patch + 0.025 * patch2), 0, 1)
    h = 0.3 * patch2 + 0.5 * fnoise((N, N), 343, beta=0.6, lo=60) + 0.2 * (b - 1) * 4
    n = normal_from_height(h, 1.0, rms=0.12)
    save_normal(n, 'fab-suede_n', q=80, credit=SWLSOFA)
    save(col, 'fab-suede_c', q=82, credit=SWLSOFA)
    save(np.clip(0.97 + 0.03 * patch, 0, 1), 'fab-suede_r', q=80, credit=SWLSOFA, kind='rough')


@gen
def gen_fab_puffer():
    """Down puffer: horizontal baffle channels every 12 cm, stitch line, compression wrinkles, ripstop grid.
    Tile 0.24 m @512."""
    N, M = 512, 1024
    x, y = grid(M)
    V = (1 - y) * 2
    cv = np.mod(V, 1)
    bulge = np.sin(np.pi * cv)                                              # soft down-filled channel
    near = 1 - bulge
    wr = fnoise((M, M), 351, beta=1.8, ax=1, ay=5, lo=14, hi=90)            # fine vertical pinch wrinkles
    wr2 = fnoise((M, M), 352, beta=2.4, lo=3, hi=30, rot=0.8, ax=3)
    seamd = np.minimum(cv, 1 - cv)
    stitch = (np.mod(x * 68, 1) < 0.6) * np.exp(-(seamd / 0.006) ** 2)
    rip = np.maximum(np.exp(-(np.minimum(np.mod(x * 48, 1), 1 - np.mod(x * 48, 1)) / 0.04) ** 2),
                     np.exp(-(np.minimum(np.mod(y * 48, 1), 1 - np.mod(y * 48, 1)) / 0.04) ** 2))
    h = 1.0 * bulge + 0.022 * wr * near ** 2 + 0.006 * wr2 - 0.04 * stitch + 0.004 * rip
    col = (0.8 + 0.2 * np.sqrt(bulge)) * (1 - 0.1 * stitch) * (1 + 0.01 * wr)
    rough = 0.85 + 0.12 * near + 0.05 * rip
    n = normal_from_height(h, 0.24 / M, strength=0.02)
    save_normal(down_normals(n, 2), 'fab-puffer_n', q=82)
    save(down(np.clip(col, 0, 1), 2), 'fab-puffer_c', q=84)
    save(down(np.clip(rough, 0, 1), 2), 'fab-puffer_r', q=80, kind='rough')


@gen
def gen_boucle():
    """Boucle upholstery loops (random curly yarn loops); tile 0.12 m @512."""
    N, M = 512, 1024
    rr = R(361)
    d, idx, pts = worley((M, M), 5200, 362)
    f1, f2 = d[..., 0], d[..., 1]
    t = f1 / (f1 + f2 + 1e-9)
    loop = np.exp(-((t - 0.28) / 0.1) ** 2)                                  # ring-shaped loops
    ht = rr.uniform(0.6, 1.0, 5200)[idx[..., 0]]
    h = loop * ht + 0.25 * (1 - 2 * t) * ht + 0.08 * fnoise((M, M), 363, beta=0.8, lo=60)
    col = 0.95 * cavity(h, 0.78, 0.8)
    rough = np.full((M, M), 0.99)
    fabric_out('boucle', h, M, N, 0.45, col, rough)


def sync_materials_js(stats):
    """Rewrite mean / rMean of every SETS entry in src/core/materials.js from the measured texture stats."""
    import re
    p = os.path.join(STORE, 'src', 'core', 'materials.js')
    src = open(p).read()
    out = []
    for line in src.split('\n'):
        mc = re.search(r"\bc: '([^']+)'", line)
        mr = re.search(r"\br: '([^']+)'", line)
        if mc and 'mean:' in line and mc.group(1) in stats and 'meanRGB' in stats[mc.group(1)]:
            m = stats[mc.group(1)]['meanRGB']
            val = str(m[0]) if m[0] == m[1] == m[2] else '[' + ', '.join(str(v) for v in m) + ']'
            line = re.sub(r"mean: (\[[^\]]*\]|[0-9.]+)", 'mean: ' + val, line)
        if mr and 'rMean:' in line and mr.group(1) in stats:
            st = stats[mr.group(1)]
            rv = st['meanRGB'][1] if 'meanRGB' in st else st.get('mean')
            if rv is not None:
                line = re.sub(r"rMean: [0-9.]+", 'rMean: ' + str(rv), line)
        out.append(line)
    new = '\n'.join(out)
    if new != src:
        open(p, 'w').write(new)
        print('  synced texture means into src/core/materials.js')


if __name__ == '__main__':
    names = sys.argv[1:] or list(GENS)
    statp = os.path.join(PREVIEW, '_stats.json')
    old = json.load(open(statp)) if os.path.exists(statp) else {}
    credp = os.path.join(OUT, 'CREDITS.json')
    oldc = {c['file']: c for c in json.load(open(credp))} if os.path.exists(credp) else {}
    for nm in names:
        print(nm)
        GENS[nm]()
    old.update(STATS)
    json.dump(old, open(statp, 'w'), indent=1, sort_keys=True)
    for f, c in CREDITS.items():
        oldc[f] = {'file': f, **c}
    json.dump(sorted(oldc.values(), key=lambda c: c['file']), open(credp, 'w'), indent=1)
    sync_materials_js(old)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'assets/tex total: {tot / 1024:.0f} KB')
