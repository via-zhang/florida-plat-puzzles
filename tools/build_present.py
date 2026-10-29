"""Build the present-day (Sentinel-2) images that match each puzzle square.

Nothing private is needed: square bounds come from public/puzzles/manifest.json and the
imagery is fetched from Microsoft Planetary Computer (free, no key). For each square it
makes a cloud-free median composite of the most recent complete dry season
(November-April) and warps it onto exactly the same UTM 17N grid as the historical
square, so the two line up pixel for pixel.

    pip install -r tools/requirements.txt
    python tools/build_present.py                 # everything (resumable)
    python tools/build_present.py --only c17-r06 c28-r15
    python tools/build_present.py --time-budget 600

Outputs
    public/present/{id}.{1600,800,256}.webp
    public/overview-present.webp
    public/puzzles/manifest.json  (adds a "present" block)
"""
import argparse
import datetime as dt
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MANIFEST = PUBLIC / "puzzles" / "manifest.json"
OUT = PUBLIC / "present"
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
CRS_GRID = CRS.from_epsg(26917)  # NAD83 / UTM 17N, the plats' grid
SIZES = (1600, 800, 256)
QUALITY = {1600: 74, 800: 76, 256: 72}
SCENES_PER_TILE = 3       # clearest scenes per Sentinel-2 tile (dry season is mostly clear)
MAX_CLOUD = 15            # % scene cloud cover
# Scene classification classes treated as unusable: no data, saturated, cloud shadow,
# cloud (medium/high probability), thin cirrus, snow.
BAD_SCL = np.array([0, 1, 3, 8, 9, 10, 11])
# Color: the 8-bit "visual" (true color) asset is a little dark for Florida's greens.
GAMMA = 0.82
GAIN = 1.08
SATURATION = 1.12

rasterio_env = rasterio.Env(GDAL_HTTP_MAX_RETRY=4, GDAL_HTTP_RETRY_DELAY=2,
                            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", VSI_CACHE=True)


def dry_season(today: dt.date | None = None) -> tuple[str, str]:
    """Most recent complete November-April season."""
    today = today or dt.date.today()
    end_year = today.year if today.month >= 5 else today.year - 1
    return f"{end_year - 1}-11-01", f"{end_year}-04-30"


def search(catalog, bounds_utm, season, limit_per_tile=SCENES_PER_TILE, max_cloud=MAX_CLOUD):
    """Clearest scenes per MGRS tile that intersect the UTM bounds."""
    lonlat = transform_bounds(CRS_GRID, "EPSG:4326", *bounds_utm)
    items = catalog.search(collections=["sentinel-2-l2a"], bbox=lonlat,
                           datetime=f"{season[0]}/{season[1]}",
                           query={"eo:cloud_cover": {"lt": max_cloud}}).item_collection()
    by_tile: dict[str, list] = {}
    # Prefer full-swath scenes (orbit-edge scenes are mostly empty), then the clearest.
    def rank(i):
        empty = i.properties.get("s2:nodata_pixel_percentage", 0)
        return (empty > 20, i.properties["eo:cloud_cover"])
    for it in sorted(items, key=rank):
        by_tile.setdefault(it.properties["s2:mgrs_tile"], []).append(it)
    return [it for tile in by_tile.values() for it in tile[:limit_per_tile]], [
        it.id for tile in by_tile.values() for it in tile[:limit_per_tile]]


def read_scene(item, transform, width, height, overview_level=None):
    """(rgb uint8 HxWx3, valid bool HxW) for one scene warped onto the output grid."""
    item = planetary_computer.sign(item)
    with rasterio_env:
        # For coarse outputs, read a reduced-resolution overview of the COG (much faster).
        kw = {} if overview_level is None else {"overview_level": overview_level}
        with rasterio.open(item.assets["visual"].href, **kw) as src, WarpedVRT(
                src, crs=CRS_GRID, transform=transform, width=width, height=height,
                resampling=Resampling.bilinear, nodata=0) as vrt:
            rgb = vrt.read().transpose(1, 2, 0)
        scl_kw = {} if overview_level is None else {"overview_level": max(overview_level - 1, 0)}
        with rasterio.open(item.assets["SCL"].href, **scl_kw) as src, WarpedVRT(
                src, crs=CRS_GRID, transform=transform, width=width, height=height,
                resampling=Resampling.nearest, nodata=0) as vrt:
            scl = vrt.read(1)
    valid = ~np.isin(scl, BAD_SCL) & (rgb.max(axis=2) > 0)
    return rgb, valid


def composite(items, transform, width, height, threads=6, rows_per_chunk=128):
    """Per-pixel median of the cloud-free observations (falls back to any observation).

    Scenes are kept as uint8 and the median is taken in row chunks to keep memory low.
    """
    with ThreadPoolExecutor(threads) as ex:
        scenes = list(ex.map(lambda it: read_scene(it, transform, width, height), items))
    rgb = np.stack([s[0] for s in scenes])                  # N,H,W,3 uint8
    good = np.stack([s[1] for s in scenes])                 # N,H,W bool
    del scenes
    anydata = rgb.max(axis=3) > 0
    out = np.zeros((height, width, 3), np.float32)
    for y0 in range(0, height, rows_per_chunk):
        sl = slice(y0, y0 + rows_per_chunk)
        stack = rgb[:, sl].astype(np.float32)
        with np.errstate(all="ignore"):
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                med = np.nanmedian(np.where(good[:, sl, :, None], stack, np.nan), axis=0)
                # Pixels never seen cloud-free: use the median of whatever data exists.
                fb = np.nanmedian(np.where(anydata[:, sl, :, None], stack, np.nan), axis=0)
        out[sl] = np.nan_to_num(np.where(np.isnan(med), fb, med), nan=0.0)
    return out


def grade(rgb: np.ndarray) -> np.ndarray:
    """Shared color grade so every square matches."""
    x = np.clip(rgb / 255.0 * GAIN, 0, 1) ** GAMMA
    lum = x @ np.array([0.299, 0.587, 0.114])
    x = lum[..., None] + (x - lum[..., None]) * SATURATION
    return (np.clip(x, 0, 1) * 255).round().astype(np.uint8)


def save_sizes(img: Image.Image, sid: str):
    OUT.mkdir(parents=True, exist_ok=True)
    for s in SIZES:
        (img if img.width == s else img.resize((s, s), Image.LANCZOS)).save(
            OUT / f"{sid}.{s}.webp", quality=QUALITY[s], method=4)


def build_square(catalog, manifest, sq, season):
    m = manifest
    left = m["origin"][0] + sq["col"] * m["squareMeters"]
    top = m["origin"][1] - sq["row"] * m["squareMeters"]
    bounds = (left, top - m["squareMeters"], left + m["squareMeters"], top)
    items, _ = search(catalog, bounds, season)
    size = SIZES[0]
    transform = from_bounds(*bounds, size, size)
    rgb = composite(items, transform, size, size)
    if (rgb.max(axis=2) == 0).mean() > 0.001:
        # Some pixels never got data (e.g. only partial-swath scenes): widen the search.
        items, _ = search(catalog, bounds, season, limit_per_tile=10, max_cloud=50)
        rgb = composite(items, transform, size, size)
    save_sizes(Image.fromarray(grade(rgb)), sq["id"])
    return len(items)


def build_overview(catalog, manifest, season, threads=6):
    """Present-day overview on the same grid extent as public/overview.webp.

    Mosaics clearest-first: each pixel takes the first cloud-free observation, with
    scenes ordered by cloud cover.
    """
    m = manifest
    W, H = m["overview"]["width"], m["overview"]["height"]
    left, top = m["origin"]
    right = left + m["cols"] * m["squareMeters"]
    bottom = top - m["rows"] * m["squareMeters"]
    transform = from_bounds(left, bottom, right, top, W, H)
    items, _ = search(catalog, (left, bottom, right, top), season, limit_per_tile=8, max_cloud=40)
    items.sort(key=lambda it: it.properties["eo:cloud_cover"])
    out = np.zeros((H, W, 3), np.uint8)
    filled = np.zeros((H, W), bool)
    seen = np.zeros((H, W), bool)
    fallback = np.zeros((H, W, 3), np.uint8)
    with ThreadPoolExecutor(threads) as ex:
        # Overview level 3 of a 10 m COG is 160 m: still finer than this ~425 m output.
        for rgb, valid in ex.map(lambda it: read_scene(it, transform, W, H, overview_level=3), items):
            take = valid & ~filled
            out[take] = rgb[take]
            filled |= take
            has = (rgb.max(axis=2) > 0) & ~seen
            fallback[has] = rgb[has]
            seen |= has
    out[~filled] = fallback[~filled]
    img = Image.fromarray(grade(out.astype(np.float32)))
    # Playable squares: paste the full-quality square composites so they match the puzzles.
    cw, ch = W / m["cols"], H / m["rows"]
    for sq in m["squares"]:
        thumb = OUT / f"{sq['id']}.256.webp"
        if thumb.exists():
            x0, y0 = round(sq["col"] * cw), round(sq["row"] * ch)
            x1, y1 = round((sq["col"] + 1) * cw), round((sq["row"] + 1) * ch)
            img.paste(Image.open(thumb).convert("RGB").resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
    # Areas with no imagery stay transparent rather than black.
    alpha = np.where(seen, 255, 0).astype(np.uint8)
    for sq in m["squares"]:
        alpha[round(sq["row"] * ch):round((sq["row"] + 1) * ch), round(sq["col"] * cw):round((sq["col"] + 1) * cw)] = 255
    img.putalpha(Image.fromarray(alpha))
    img.save(PUBLIC / "overview-present.webp", quality=78, method=6)
    return len(items)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="square ids to build")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-overview", action="store_true")
    ap.add_argument("--time-budget", type=float, default=0)
    ap.add_argument("--shard", default="0/1", help="i/n: build every n-th square starting at i (run n in parallel)")
    args = ap.parse_args()
    t0 = time.time()
    season = dry_season()
    manifest = json.loads(MANIFEST.read_text())
    catalog = pystac_client.Client.open(STAC)
    print(f"Sentinel-2 dry season {season[0]} to {season[1]}")

    if not args.no_overview and (args.force or not (PUBLIC / "overview-present.webp").exists()):
        n = build_overview(catalog, manifest, season)
        print(f"overview-present.webp from {n} scenes ({time.time() - t0:.0f}s)")

    shard, nshards = (int(v) for v in args.shard.split("/"))
    squares = [s for k, s in enumerate(manifest["squares"])
               if (not args.only or s["id"] in args.only) and k % nshards == shard]
    done = pending = 0
    for sq in squares:
        if not args.force and all((OUT / f"{sq['id']}.{s}.webp").exists() for s in SIZES):
            continue
        if args.time_budget and time.time() - t0 > args.time_budget:
            pending += 1
            continue
        t = time.time()
        n = build_square(catalog, manifest, sq, season)
        done += 1
        print(f"{sq['id']}: {n} scenes, {time.time() - t:.0f}s")

    if not args.only and pending == 0 and all(
            (OUT / f"{s['id']}.{z}.webp").exists() for s in manifest["squares"] for z in SIZES):
        manifest["present"] = {
            "source": "Sentinel-2 L2A via Microsoft Planetary Computer",
            "season": list(season),
            "attribution": f"Contains modified Copernicus Sentinel data {season[1][:4]}",
            "overview": "overview-present.webp",
        }
        MANIFEST.write_text(json.dumps(manifest, separators=(",", ":")))
        print("manifest updated")
    print(f"built {done}, pending {pending} ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
