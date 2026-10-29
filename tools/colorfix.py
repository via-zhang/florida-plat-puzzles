"""Color corrections for odd sheets in the mosaic (e.g. the purple-tinted township).

Each fix is a rectangle in UTM meters plus a 256-entry lookup table that maps
the sheet's luminance to the colors of the neighboring sheets at the same
(histogram-matched) brightness. Ink stays dark, paper becomes tan.

    python tools/colorfix.py detect   # (re)compute fixes.json + before/after preview
"""
import json
import math
import sys

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from common import FIXES, PREVIEW, TILED

# Rough location of the purple sheet (from the 20 m COG), padded when searching.
PURPLE_SEARCH = (268760, 3280040, 282040, 3293320)  # left, bottom, right, top (m)
RING = 1500   # neighbor ring width (m) used for the target colors
FEATHER_M = 66  # blend width at the rectangle edge, in meters (6 px at 11 m)


def luminance(rgb):
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    return 0.299 * r + 0.587 * g + 0.114 * b


def detect():
    src = rasterio.open(TILED)
    w = from_bounds(*PURPLE_SEARCH, src.transform)
    a = src.read(window=w).transpose(1, 2, 0)
    T = src.window_transform(w)
    r, g, b = (a[..., i].astype(int) for i in range(3))
    purple = b > r + 5
    cols = np.nonzero(purple.mean(0) > 0.5)[0]
    rows = np.nonzero(purple.mean(1) > 0.5)[0]
    pad = 10  # threshold edges are soft; grow a little
    c0, c1 = cols.min() - pad, cols.max() + 1 + pad
    r0, r1 = rows.min() - pad, rows.max() + 1 + pad
    left, top = T * (c0, r0)
    right, bottom = T * (c1, r1)

    inside = np.zeros(purple.shape, bool)
    inside[r0:r1, c0:c1] = True
    ring_px = int(RING / src.res[0])
    ring = np.zeros_like(inside)
    ring[max(r0 - ring_px, 0):r1 + ring_px, max(c0 - ring_px, 0):c1 + ring_px] = True
    valid = a.max(axis=2) > 20
    ring &= ~inside & valid & ~purple

    Ls = luminance(a[inside])
    Lt = luminance(a[ring])
    # Histogram match: source luminance quantile -> target luminance.
    # Linear brightness map that keeps ink dark: source 1st percentile -> 45,
    # source median -> neighbors' median paper brightness.
    s1, s50 = np.percentile(Ls, [1, 50])
    t50 = np.percentile(Lt, 50)
    gain = (t50 - 45) / max(s50 - s1, 1)
    lum_map = np.clip(45 + (np.arange(256) - s1) * gain, 0, 255)
    # Mean target color for each target-luminance bin (smoothed).
    tgt_rgb = a[ring].astype(np.float32)
    bins = np.clip(Lt.astype(int), 0, 255)
    sums = np.zeros((256, 3)); counts = np.zeros(256)
    np.add.at(sums, bins, tgt_rgb); np.add.at(counts, bins, 1)
    k = np.ones(9) / 9
    sm = np.stack([np.convolve(sums[:, i], k, "same") for i in range(3)], 1)
    cnt = np.convolve(counts, k, "same")
    known = cnt > 20
    color = np.stack([np.interp(np.arange(256), np.nonzero(known)[0], sm[known, i] / cnt[known])
                       for i in range(3)], 1)
    lut = color[np.clip(lum_map.round().astype(int), 0, 255)]

    fixes = [{
        "name": "purple-sheet-big-bend",
        "note": "Purple-tinted township near Steinhatchee (~29.69N, 83.32W)",
        "bounds": [round(float(v), 1) for v in (left, bottom, right, top)],
        "lut": lut.round().astype(int).tolist(),
    }]
    FIXES.write_text(json.dumps(fixes))
    print("wrote", FIXES, "bounds", fixes[0]["bounds"])

    PREVIEW.mkdir(exist_ok=True)
    from PIL import Image
    after = apply(a.copy(), T)
    both = np.concatenate([a, after], axis=1)
    Image.fromarray(both).resize((both.shape[1] // 2, both.shape[0] // 2)).save(
        PREVIEW / "purple_before_after.jpg", quality=85)
    print("preview:", PREVIEW / "purple_before_after.jpg")


_cache = None


def load_fixes():
    global _cache
    if _cache is None:
        _cache = json.loads(FIXES.read_text()) if FIXES.exists() else []
        for f in _cache:
            f["lut_arr"] = np.array(f["lut"], dtype=np.float32)
    return _cache


def apply(rgb, transform):
    """Apply all fixes to an HxWx3 uint8 array whose pixel grid is `transform`."""
    h, w = rgb.shape[:2]
    inv = ~transform
    for f in load_fixes():
        l, b, r, t = f["bounds"]
        c0, r0 = inv * (l, t)
        c1, r1 = inv * (r, b)
        px = abs(transform.a)
        feather = max(1.0, FEATHER_M / px)
        # At coarse scales, edge pixels mix the sheet with its neighbors: include them.
        grow = 1 if px > 30 else 0
        c0, r0 = math.floor(c0) - grow, math.floor(r0) - grow
        c1, r1 = math.ceil(c1) + grow, math.ceil(r1) + grow
        if c1 <= 0 or r1 <= 0 or c0 >= w or r0 >= h:
            continue
        cc0, cc1, rr0, rr1 = max(c0, 0), min(c1, w), max(r0, 0), min(r1, h)
        sub = rgb[rr0:rr1, cc0:cc1]
        new = f["lut_arr"][np.clip(luminance(sub).round().astype(int), 0, 255)]
        # Feathered weight: 1 inside, ramping to 0 over FEATHER px at the rectangle edge.
        yy = np.arange(rr0, rr1)[:, None]; xx = np.arange(cc0, cc1)[None, :]
        d = np.minimum(np.minimum(yy - r0, r1 - 1 - yy), np.minimum(xx - c0, c1 - 1 - xx)).astype(np.float32)
        wgt = np.clip((d + 1) / feather, 0, 1)[..., None]
        valid = (sub.max(axis=2) > 20)[..., None]
        wgt = wgt * valid
        rgb[rr0:rr1, cc0:cc1] = (sub * (1 - wgt) + new * wgt).round().clip(0, 255).astype(np.uint8)
    return rgb


if __name__ == "__main__":
    if sys.argv[1:] == ["detect"]:
        detect()
    else:
        print(__doc__)
