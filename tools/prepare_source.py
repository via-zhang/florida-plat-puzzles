"""Step 0a: convert the 11 m mosaic JPG into a tiled, georeferenced GeoTIFF.

The JPG has no georeferencing, but it covers exactly the same footprint as the
20 m COG, so it takes the COG's bounds and CRS. Output stays in source/ (git-ignored).

    python tools/prepare_source.py
"""
import os
from pathlib import Path
import sys

import pyvips
import rasterio
from rasterio.transform import from_bounds

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
JPG = SRC / "glo-plat-mosaic-11m.jpg"
COG = SRC / "glo-plat-mosaic-20m-cog.tif"
# MOSAIC_TILED lets you put the large working file on a faster local disk.
OUT = Path(os.environ.get("MOSAIC_TILED", SRC / "mosaic-11m-tiled.tif"))


def main() -> None:
    if OUT.exists() and "--force" not in sys.argv:
        print(f"{OUT.name} already exists (use --force to rebuild)")
    else:
        tmp = OUT.with_suffix(".tmp.tif")
        img = pyvips.Image.new_from_file(str(JPG), access="sequential")
        print(f"converting {img.width} x {img.height} JPG -> tiled TIFF (a few minutes)…")
        img.tiffsave(str(tmp), tile=True, tile_width=512, tile_height=512,
                     compression="jpeg", Q=92, bigtiff=True)
        tmp.replace(OUT)

    with rasterio.open(COG) as cog:
        crs, b = cog.crs, cog.bounds
    with rasterio.open(OUT, "r+") as dst:
        dst.crs = crs
        dst.transform = from_bounds(b.left, b.bottom, b.right, b.top, dst.width, dst.height)
        print("georeferenced:", dst.crs, dst.transform.a, dst.transform.e)


if __name__ == "__main__":
    main()
