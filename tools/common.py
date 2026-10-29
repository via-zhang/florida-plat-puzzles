"""Shared paths and helpers for the asset tools."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
COG = SRC / "glo-plat-mosaic-20m-cog.tif"
TILED = Path(os.environ.get("MOSAIC_TILED", SRC / "mosaic-11m-tiled.tif"))
PUBLIC = ROOT / "public"
PREVIEW = ROOT / "_preview"
FIXES = Path(__file__).resolve().parent / "fixes.json"
