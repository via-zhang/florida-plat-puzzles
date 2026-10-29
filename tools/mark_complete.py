"""Mark puzzle squares that have no blank pieces, for random picks.

A square is "complete" when, in every mode and difficulty, no tile or piece is more
than 5% missing data: the 3x3 / 4x4 / 5x5 grids (Rotate, Jigsaw, Slide) and every
Survey piece. "New puzzle" and the first visit only pick from these squares; the map
still offers every square.

Run after build_assets.py and build_survey.py:

    python tools/mark_complete.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MANIFEST = PUBLIC / "puzzles" / "manifest.json"
MAX_MISSING = 0.05
SIZE = 800


def worst_missing(sq_id: str) -> float:
    missing = np.asarray(Image.open(PUBLIC / "puzzles" / f"{sq_id}.{SIZE}.webp").convert("RGBA"))[..., 3] < 128
    worst = 0.0
    for n in (3, 4, 5):
        s = SIZE // n
        for r in range(n):
            for c in range(n):
                worst = max(worst, float(missing[r * s:(r + 1) * s, c * s:(c + 1) * s].mean()))
    survey = PUBLIC / "survey" / f"{sq_id}.json"
    if survey.exists():
        k = SIZE / 1000
        for pieces in json.loads(survey.read_text()).values():
            for p in pieces:
                mask = Image.new("L", (SIZE, SIZE), 0)
                draw = ImageDraw.Draw(mask)
                for sub in (x for x in p["path"].split("Z") if x):
                    pts = [tuple(float(v) * k for v in q.split()) for q in sub[1:].split("L")]
                    draw.polygon(pts, fill=255)
                inside = np.asarray(mask) > 0
                if inside.any():
                    worst = max(worst, float(missing[inside].mean()))
    return worst


def main():
    m = json.loads(MANIFEST.read_text())
    for sq in m["squares"]:
        sq["complete"] = worst_missing(sq["id"]) <= MAX_MISSING
    MANIFEST.write_text(json.dumps(m, separators=(",", ":")))
    n = sum(s["complete"] for s in m["squares"])
    print(f"{n} of {len(m['squares'])} squares have no blank pieces")


if __name__ == "__main__":
    main()
