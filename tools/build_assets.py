"""Build the published game assets from the private source mosaics.

Pixels come from the 11 m mosaic (converted by prepare_source.py), positioned
with the 20 m COG's coordinates; the COG also supplies the no-data mask.
Writes only small derived files into public/.

    python tools/build_assets.py                 # everything (resumable)
    python tools/build_assets.py --limit 30      # a sample of squares
    python tools/build_assets.py --time-budget 150   # stop after ~150 s; rerun to continue

Outputs
    public/overview.webp                  Florida overview (no-data transparent)
    public/paper.webp                     seamless paper texture for missing data
    public/puzzles/manifest.json          grid + playable squares
    public/puzzles/c{col}-r{row}.{256,800,1600}.webp
"""
import argparse
import json
import math
import time

import numpy as np
import rasterio
from affine import Affine
from PIL import Image, ImageFilter
from rasterio.enums import Resampling
from rasterio.warp import transform as warp
from rasterio.windows import Window, from_bounds

import colorfix
from common import COG, PUBLIC, TILED

SQUARE_M = 20_000          # puzzle square size in meters (~2x2 townships)
SIZES = (1600, 800, 256)   # exported widths
MIN_COVERAGE = 0.5
OVERVIEW_W = 1600
DARK = 20                  # JPEG "black" threshold for mask edge cleanup
QUALITY = {1600: 72, 800: 74, 256: 70}

PUZ = PUBLIC / "puzzles"


def grid(cog):
    b = cog.bounds
    cols = math.ceil((b.right - b.left) / SQUARE_M)
    rows = math.ceil((b.top - b.bottom) / SQUARE_M)
    return b.left, b.top, cols, rows


def square_bounds(left, top, c, r):
    x0, y1 = left + c * SQUARE_M, top - r * SQUARE_M
    return x0, y1 - SQUARE_M, x0 + SQUARE_M, y1  # l, b, r, t


def coverage_table(cog):
    """Fraction of valid data per square, from a coarse read of the COG mask."""
    left, top, cols, rows = grid(cog)
    per = 50  # samples per square side
    m = cog.read_masks(1, window=Window(0, 0, cols * SQUARE_M / 20, rows * SQUARE_M / 20),
                       out_shape=(rows * per, cols * per), boundless=True,
                       resampling=Resampling.nearest) > 0
    return m.reshape(rows, per, cols, per).mean(axis=(1, 3))


def read_square(cog, src, bounds, size):
    """RGBA uint8 array (size x size) for the square, color-fixed, no-data transparent."""
    w = from_bounds(*bounds, src.transform)
    native = int(round(w.width))
    rgb = src.read(window=w, out_shape=(3, native, native), boundless=True, fill_value=0)
    rgb = rgb.transpose(1, 2, 0).copy()
    rgb = colorfix.apply(rgb, src.window_transform(w))
    img = Image.fromarray(rgb).resize((size, size), Image.LANCZOS)

    cw = from_bounds(*bounds, cog.transform)
    m = cog.read_masks(1, window=cw, out_shape=(size, size), boundless=True,
                       resampling=Resampling.nearest)
    mask = Image.fromarray(m)
    # Clean JPEG-black fringes: in a thin band along mask edges, drop dark pixels.
    inner = mask.filter(ImageFilter.MinFilter(7))
    band = (np.asarray(mask) > 0) & (np.asarray(inner) == 0)
    dark = np.asarray(img).max(axis=2) < DARK
    alpha = (np.asarray(mask) > 0) & ~(band & dark)
    alpha = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    img.putalpha(alpha)
    return img


def build_overview(cog):
    left, top, cols, rows = grid(cog)
    # Overview covers the full grid extent so squares map 1:1 onto it.
    gw, gh = cols * SQUARE_M / 20, rows * SQUARE_M / 20
    W = OVERVIEW_W
    H = round(W * gh / gw)
    win = Window(0, 0, gw, gh)
    rgb = cog.read(window=win, out_shape=(3, H, W), boundless=True, fill_value=0,
                   resampling=Resampling.average)
    m = cog.read_masks(1, window=win, out_shape=(H, W), boundless=True,
                       resampling=Resampling.average)
    T = cog.window_transform(win) * Affine.scale(gw / W, gh / H)
    rgb = colorfix.apply(rgb.transpose(1, 2, 0).copy(), T)
    img = Image.fromarray(rgb)
    img.putalpha(Image.fromarray(np.where(m > 100, 255, 0).astype(np.uint8)))
    img.save(PUBLIC / "overview.webp", quality=78, method=6)
    return W, H


def build_paper(src, cog, size=512):
    """Seamless paper texture: the plats' median paper color plus noise generated in
    the frequency domain, so it tiles.
    """
    # Median color of bright (paper, not ink) pixels across the mosaic.
    f = 64
    a = cog.read(out_shape=(3, cog.height // f, cog.width // f)).reshape(3, -1).T
    m = (cog.read_masks(1, out_shape=(cog.height // f, cog.width // f)) > 0).ravel()
    a = a[m]
    lum = a.mean(axis=1)
    paper = np.median(a[lum > np.percentile(lum, 40)], axis=0).astype(np.float32)

    rng = np.random.default_rng(11)
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    r = np.sqrt(fx ** 2 + fy ** 2)
    r[0, 0] = 1

    def periodic_noise(power):
        spec = np.fft.fft2(rng.standard_normal((size, size))) / r ** power
        spec[0, 0] = 0
        n = np.fft.ifft2(spec).real
        return n / n.std()

    blotch = periodic_noise(1.6)          # soft stains / uneven aging
    grain = periodic_noise(0.4)           # fine fiber grain
    shade = blotch * 6 + grain * 5        # luminance offsets
    tint = blotch[..., None] * np.array([1.0, 0.6, 0.2]) * 3  # stains lean warm
    tex = paper[None, None, :] + shade[..., None] + tint
    Image.fromarray(tex.clip(0, 255).astype(np.uint8)).save(PUBLIC / "paper.webp", quality=75)
    return [int(v) for v in paper]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only build N squares (highest coverage first)")
    ap.add_argument("--min-coverage", type=float, default=MIN_COVERAGE)
    ap.add_argument("--time-budget", type=float, default=0, help="stop after N seconds")
    ap.add_argument("--force", action="store_true", help="rebuild existing images")
    args = ap.parse_args()
    t0 = time.time()

    PUZ.mkdir(parents=True, exist_ok=True)
    cog, src = rasterio.open(COG), rasterio.open(TILED)
    left, top, cols, rows = grid(cog)

    if args.force or not (PUBLIC / "overview.webp").exists():
        build_overview(cog)
        print("overview.webp")
    if args.force or not (PUBLIC / "paper.webp").exists():
        build_paper(src, cog)
        print("paper.webp")
    ov = Image.open(PUBLIC / "overview.webp").size

    cov = coverage_table(cog)
    playable = [(float(cov[r, c]), c, r) for r in range(rows) for c in range(cols)
                if cov[r, c] >= args.min_coverage]
    playable.sort(reverse=True)
    if args.limit:
        playable = playable[: args.limit]
    print(f"{len(playable)} playable squares (coverage >= {args.min_coverage})")

    squares, built, pending = [], 0, 0
    for cv, c, r in sorted(playable, key=lambda t: (t[2], t[1])):
        sid = f"c{c:02d}-r{r:02d}"
        b = square_bounds(left, top, c, r)
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        lon, lat = warp(cog.crs, "EPSG:4326", [cx], [cy])
        files = [PUZ / f"{sid}.{s}.webp" for s in SIZES]
        if args.force or not all(f.exists() for f in files):
            if args.time_budget and time.time() - t0 > args.time_budget:
                pending += 1
                continue
            big = read_square(cog, src, b, SIZES[0])
            for s, f in zip(SIZES, files):
                (big if s == SIZES[0] else big.resize((s, s), Image.LANCZOS)).save(
                    f, quality=QUALITY[s], alpha_quality=80, method=4)
            built += 1
        squares.append({"id": sid, "col": c, "row": r, "coverage": round(cv, 3),
                        "lon": round(lon[0], 4), "lat": round(lat[0], 4)})

    manifest = {
        "attribution": "Map imagery: Florida Museum of Natural History",
        "crs": "EPSG:26917",
        "squareMeters": SQUARE_M,
        "origin": [left, top],
        "cols": cols, "rows": rows,
        "sizes": list(SIZES),
        "overview": {"file": "overview.webp", "width": ov[0], "height": ov[1]},
        "squares": squares,
    }
    (PUZ / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    print(f"built {built}, manifest lists {len(squares)}, still pending {pending} "
          f"({time.time() - t0:.0f}s)")
    if pending:
        print("Time budget reached: run again to continue.")


if __name__ == "__main__":
    main()
