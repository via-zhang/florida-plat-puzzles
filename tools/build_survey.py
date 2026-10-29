"""Build the Survey-mode pieces: puzzle pieces cut along the real survey lines.

Florida's land was divided by the Public Land Survey System into 6-mile townships
of 36 one-mile sections, the same lines drawn on the GLO plats. This fetches those
boundaries from the BLM's national PLSS service (CadNSDI, public, no key) for each
puzzle square and turns them into puzzle pieces at three difficulty levels:

    easy    whole townships (clipped to the square)          ~ 5-10 pieces
    medium  half townships (north / south, 3 x 6 sections)   ~ 10-15
    hard    quarter townships (3 x 3 sections)               ~ 15-25

Pieces meet along straight lines. The PLSS polygons themselves have notches where
lakes, meander lines and fractional sections were left out, so instead the survey grid
is fitted as straight lines: every numbered section's center (from its township and
section number) is used to fit the grid across the square, with a per-row east-west
shift for the jogs at correction lines. Townships, halves and quarters are then cells of
that grid, so they tile the square exactly with straight shared edges. Thin strips at
the square's edges are merged into their neighbors.

    pip install -r tools/requirements.txt
    python tools/build_survey.py              # all squares (resumable, cached)
    python tools/build_survey.py --only c17-r06 --force

Outputs public/survey/{id}.json, polygons in board units (0-1000, y down).
"""
import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon, box, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "public" / "puzzles" / "manifest.json"
OUT = ROOT / "public" / "survey"
CACHE = Path(__file__).resolve().parent / ".cache" / "plss"
SERVICE = "https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer"
LAYERS = {"township": 1, "section": 2}
FIELDS = {"township": "PLSSID,TWNSHPLAB", "section": "PLSSID,FRSTDIVNO"}
BOARD = 1000
# Piece outlines in a township's (col, row) section grid, 0-6.
LEVELS = {
    "easy": [(0, 0, 6, 6)],                                   # whole township
    "medium": [(0, 0, 6, 3), (0, 3, 6, 6)],                   # north / south halves
    "hard": [(0, 0, 3, 3), (3, 0, 6, 3), (0, 3, 3, 6), (3, 3, 6, 6)],  # quarters
}
SLIVER = 0.06                      # pieces smaller than this share of a full township get merged
MIN_THICKNESS = 1600               # meters (~1 mile): thinner strips are merged too (hard to grab)
SIMPLIFY = 0.6                     # board units


def fetch(layer: str, bounds, sid: str):
    """GeoJSON features intersecting the square (EPSG:26917), cached on disk."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{sid}.{layer}.json"
    if cached.exists():
        return json.loads(cached.read_text())["features"]
    q = urllib.parse.urlencode({
        "geometry": ",".join(f"{v:.1f}" for v in bounds), "geometryType": "esriGeometryEnvelope",
        "inSR": 26917, "outSR": 26917, "spatialRel": "esriSpatialRelIntersects",
        "outFields": FIELDS[layer], "returnGeometry": "true", "f": "geojson",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(f"{SERVICE}/{LAYERS[layer]}/query?{q}", timeout=90) as r:
                data = json.load(r)
            if "features" not in data:
                raise RuntimeError(f"PLSS query failed: {data.get('error')}")
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    cached.write_text(json.dumps(data))
    return data["features"]


def section_cell(num: str | None, geom, town_geom):
    """(row, col) of a section within its township's 6 x 6 grid."""
    try:
        n = int(num)
    except (TypeError, ValueError):
        n = 0
    if 1 <= n <= 36:
        r = (n - 1) // 6
        c = 5 - (n - 1) % 6 if r % 2 == 0 else (n - 1) % 6  # boustrophedon, 1 at the NE corner
        return r, c
    # Irregular sections (e.g. Spanish land grants): place by position in the township.
    x0, y0, x1, y1 = town_geom.bounds
    p = geom.representative_point()
    c = min(5, max(0, int((p.x - x0) / max(x1 - x0, 1) * 6)))
    r = min(5, max(0, int((y1 - p.y) / max(y1 - y0, 1) * 6)))
    return r, c


def thickness(g) -> float:
    """Shorter side of the piece's oriented bounding rectangle (meters)."""
    r = g.minimum_rotated_rectangle
    if r.geom_type != "Polygon":
        return 0.0
    xs = list(r.exterior.coords)
    sides = [((xs[i][0] - xs[i + 1][0]) ** 2 + (xs[i][1] - xs[i + 1][1]) ** 2) ** 0.5 for i in range(2)]
    return min(sides)


def tile_square(units, square, min_area):
    """Clip units to the square, add uncovered areas, merge slivers into neighbors."""
    pieces = []
    for g in units:
        g = g.intersection(square).buffer(0)
        # A piece must be one connected shape: split multi-part results.
        for part in getattr(g, "geoms", [g]):
            if part.geom_type == "Polygon" and part.area > 1:
                pieces.append(part)
    covered = unary_union(pieces) if pieces else None
    rest = square.difference(covered) if covered is not None else square
    for part in getattr(rest, "geoms", [rest]):
        if part.area > 1:
            pieces.append(part)
    # Merge slivers into the neighbor they share the longest edge with.
    stuck: set[bytes] = set()   # slivers with no neighbor to join (left as they are)
    for _ in range(1000):
        pieces.sort(key=lambda g: g.area)
        small = [i for i, g in enumerate(pieces)
                 if len(pieces) > 1 and g.wkb not in stuck
                 and (g.area < min_area or thickness(g) < MIN_THICKNESS)]
        if not small:
            break
        i = small[0]
        g = pieces[i]
        best, best_len = None, 0.0
        for j, h in enumerate(pieces):
            if j != i:
                shared = g.buffer(2).intersection(h).area
                if shared > best_len:
                    best, best_len = j, shared
        merged = unary_union([pieces[best], g]).buffer(1, join_style=2).buffer(-1, join_style=2) if best is not None else None
        if merged is None or merged.geom_type != "Polygon":
            stuck.add(g.wkb)
            continue
        for k in sorted((i, best), reverse=True):
            pieces.pop(k)
        pieces.append(merged)
    return pieces


def clean(g, eps=40.0):
    """Remove hairline spikes and slits left by merging slivers (eps meters)."""
    c = g.buffer(eps, join_style=2).buffer(-2 * eps, join_style=2).buffer(eps, join_style=2)
    c = c if not c.is_empty else g
    # A piece is one shape: keep the main part (any hairline appendage cut off by the
    # cleanup is tiny) and drop tiny holes.
    parts = [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon"]
    if not parts:
        return g
    main = max(parts, key=lambda p: p.area)
    return Polygon(main.exterior, [r for r in main.interiors if Polygon(r).area > 1e5])


def to_board(g, left, top, scale):
    """Shapely geometry (UTM) -> SVG path in board units, plus bbox and centroid."""
    polys = getattr(g, "geoms", [g])
    d = []
    for p in polys:
        p = orient(p.simplify(SIMPLIFY / scale, preserve_topology=True))
        for ring in [p.exterior, *p.interiors]:
            pts = [((x - left) * scale, (top - y) * scale) for x, y in ring.coords[:-1]]
            if len(pts) < 3:
                continue
            d.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
    x0, y0, x1, y1 = g.bounds
    c = g.representative_point()
    return {
        "path": "".join(d),
        "bbox": [round((x0 - left) * scale, 1), round((top - y1) * scale, 1),
                 round((x1 - left) * scale, 1), round((top - y0) * scale, 1)],
        "point": [round((c.x - left) * scale, 1), round((top - c.y) * scale, 1)],
    }


def parse_plssid(pid: str):
    """(row, col) township lattice indices from a PLSS ID, or None for half townships.

    FL29 TTT f D RRR f D d  e.g. FL290250S0220E0 = township 25 S, range 22 E.
    Rows count southward from the base line, columns eastward from the meridian; each
    index is the township's north / west edge.
    """
    try:
        t, tf, td = int(pid[4:7]), pid[7], pid[8]
        r, rf, rd = int(pid[9:12]), pid[12], pid[13]
    except (ValueError, IndexError):
        return None
    if tf != "0" or rf != "0":
        return None
    row = t - 1 if td == "S" else -t
    col = r - 1 if rd == "E" else -r
    return row, col


class Lattice:
    """The survey grid as straight lines: ground = O + (u + shift[row]) * U + v * V,
    with (u, v) in township units (u east, v south). Townships in a row share one
    east-west shift, so range lines can jog at correction lines while every boundary
    stays a straight line."""

    def __init__(self, sections):
        rows = []
        for props, geom in sections:
            ij = parse_plssid(props.get("PLSSID") or "")
            try:
                n = int(props.get("FRSTDIVNO") or 0)
            except ValueError:
                n = 0
            if ij is None or not 1 <= n <= 36:
                continue
            r, c = section_cell(str(n), geom, geom)
            q = geom.centroid
            rows.append((ij[0], ij[1] + (c + 0.5) / 6, ij[0] + (r + 0.5) / 6, q.x, q.y))
        if len(rows) < 6:
            raise ValueError("not enough numbered sections to fit the survey grid")
        a = np.array(rows, float)
        # Ignore township rows with only a stray section or two (mislabeled data).
        counts = {r: int((a[:, 0] == r).sum()) for r in set(a[:, 0])}
        a = a[[counts[r] >= 4 for r in a[:, 0]]]
        if len(a) < 6:
            raise ValueError("not enough numbered sections to fit the survey grid")
        # Robust similarity fit (townships are nominally square: V is U turned 90 degrees
        # clockwise) with a separate offset per township row, so jogs at correction lines
        # don't distort the grid. Refit after dropping outliers (the PLSS data has the odd
        # mislabeled section).  x = ox[row] + a*u + b*v,  y = oy[row] + b*u - a*v.
        def fit(a):
            rows_ = sorted(set(a[:, 0].astype(int)))
            k = {r: n for n, r in enumerate(rows_)}
            n, nr = len(a), len(rows_)
            M = np.zeros((2 * n, 2 * nr + 2)); rhs = np.r_[a[:, 3], a[:, 4]]
            for t in range(n):
                ri = k[int(a[t, 0])]
                M[t, ri] = 1; M[t, 2 * nr] = a[t, 1]; M[t, 2 * nr + 1] = a[t, 2]
                M[n + t, nr + ri] = 1; M[n + t, 2 * nr] = -a[t, 2]; M[n + t, 2 * nr + 1] = a[t, 1]
            sol = np.linalg.lstsq(M, rhs, rcond=None)[0]
            ka, kb = sol[2 * nr], sol[2 * nr + 1]
            offs = {r: (sol[k[r]], sol[nr + k[r]]) for r in rows_}
            return ka, kb, offs
        for _ in range(5):
            ka, kb, offs = fit(a)
            px = np.array([offs[int(r)][0] for r in a[:, 0]]) + ka * a[:, 1] + kb * a[:, 2]
            py = np.array([offs[int(r)][1] for r in a[:, 0]]) + kb * a[:, 1] - ka * a[:, 2]
            err = np.hypot(px - a[:, 3], py - a[:, 4])
            keep = err < max(3 * np.median(err), 1200)
            if keep.all():
                break
            a = a[keep]
        U = np.array([ka, kb])
        town = 6 * 1609.344
        if not 0.9 * town < np.hypot(*U) < 1.1 * town:
            raise ValueError(f"survey grid fit looks wrong (township width {np.hypot(*U):.0f} m)")
        # One shared north-south position for every row (so row boundaries are single
        # straight lines); rows differ only by an east-west shift along U.
        counts = {r: int((a[:, 0] == r).sum()) for r in offs}
        ref = max(counts, key=counts.get)
        self.cx = np.array([offs[ref][0], ka, kb])
        self.cy = np.array([offs[ref][1], kb, -ka])
        self.shift = {r: float(((np.array(offs[r]) - np.array(offs[ref])) @ U) / (U @ U)) for r in offs}
        self.rows_known = sorted(self.shift)

    def s(self, row):
        if row in self.shift:
            return self.shift[row]
        near = min(self.rows_known, key=lambda k: abs(k - row))
        return self.shift[near]

    def ground(self, row, u, v):
        uu = u + self.s(row)
        return (self.cx[0] + self.cx[1] * uu + self.cx[2] * v, self.cy[0] + self.cy[1] * uu + self.cy[2] * v)

    def local(self, x, y):
        M = np.array([[self.cx[1], self.cx[2]], [self.cy[1], self.cy[2]]])
        return np.linalg.solve(M, [x - self.cx[0], y - self.cy[0]])


def build_square(manifest, sq):
    m = manifest
    left = m["origin"][0] + sq["col"] * m["squareMeters"]
    top = m["origin"][1] - sq["row"] * m["squareMeters"]
    bounds = (left, top - m["squareMeters"], left + m["squareMeters"], top)
    square = box(*bounds)
    scale = BOARD / m["squareMeters"]
    sections = [(f["properties"], shape(f["geometry"])) for f in fetch("section", bounds, sq["id"])]
    lat = Lattice(sections)
    full_township = (6 * 1609.344) ** 2
    min_area = SLIVER * full_township

    # Township rows / columns that reach the square (with a margin for the row shifts).
    uv = [lat.local(x, y) for x, y in square.exterior.coords[:4]]
    u0, u1 = min(p[0] for p in uv) - 2, max(p[0] for p in uv) + 2
    v0, v1 = min(p[1] for p in uv), max(p[1] for p in uv)

    out = {}
    for level, splits in LEVELS.items():
        units = []
        for row in range(int(np.floor(v0)), int(np.floor(v1)) + 1):
            for col in range(int(np.floor(u0)), int(np.floor(u1)) + 1):
                for (c0, r0, c1, r1) in splits:
                    ua, ub = col + c0 / 6, col + c1 / 6
                    va, vb = row + r0 / 6, row + r1 / 6
                    poly = Polygon([lat.ground(row, ua, va), lat.ground(row, ub, va),
                                    lat.ground(row, ub, vb), lat.ground(row, ua, vb)])
                    part = poly.intersection(square)
                    if not part.is_empty and part.area > 1:
                        units.append(part)
        pieces = tile_square(units, square, min_area / {"easy": 1, "medium": 2, "hard": 4}[level])
        pieces = [clean(p) for p in pieces]
        pieces.sort(key=lambda p: (-p.centroid.y, p.centroid.x))
        out[level] = [to_board(p, left, top, scale) for p in pieces]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{sq['id']}.json").write_text(json.dumps(out, separators=(",", ":")))
    return {k: len(v) for k, v in out.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    t0 = time.time()
    counts = []
    for sq in manifest["squares"]:
        if args.only and sq["id"] not in args.only:
            continue
        if not args.force and (OUT / f"{sq['id']}.json").exists():
            continue
        c = build_square(manifest, sq)
        counts.append(c)
        print(sq["id"], c)
    if counts:
        for lv in ("easy", "medium", "hard"):
            v = sorted(c[lv] for c in counts)
            print(f"{lv}: min {v[0]}, median {v[len(v) // 2]}, max {v[-1]}")
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
