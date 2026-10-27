"""Geometry: state outlines, power cells, and contiguity repair."""

from functools import lru_cache

import numpy as np
import pyogrio
import shapely
from shapely.geometry import MultiPolygon, Polygon

from load import RAW


def _read_polys(path, key):
    meta, _, geom, fields = pyogrio.raw.read(str(path), columns=[key])
    names = list(meta["fields"])
    keys = fields[names.index(key)]
    return dict(zip(keys, shapely.from_wkb(geom)))


@lru_cache(maxsize=1)
def states_with_water():
    """TIGER/Line state polygons, which include inland and coastal waters.

    Used for contiguity: two pieces of a district joined only by a bay or
    lake inside the state count as contiguous (as courts generally accept).
    """
    return _read_polys(RAW / "tl_2020_us_state.zip", "STATEFP")


@lru_cache(maxsize=1)
def states_shoreline():
    """Cartographic (shoreline-clipped) state polygons, used for display and compactness."""
    return _read_polys(RAW / "cb_2020_us_state_500k.zip", "STATEFP")


@lru_cache(maxsize=1)
def enacted_districts():
    """119th Congress district polygons, keyed by GEOID (state FIPS + district)."""
    return _read_polys(RAW / "cb_2024_us_cd119_500k.zip", "GEOID")


def project(geom, fwd):
    return shapely.transform(geom, lambda xy: np.column_stack(fwd.transform(xy[:, 0], xy[:, 1])))


def _clip_halfplane(poly, n, b):
    """Sutherland-Hodgman: keep the part of convex polygon `poly` where n.x <= b."""
    if len(poly) == 0:
        return poly
    out = []
    v = poly @ n - b
    for i in range(len(poly)):
        P, Q = poly[i], poly[(i + 1) % len(poly)]
        vp, vq = v[i], v[(i + 1) % len(poly)]
        if vp <= 0:
            out.append(P)
        if (vp <= 0) != (vq <= 0):
            t = vp / (vp - vq)
            out.append(P + t * (Q - P))
    return np.array(out) if out else np.zeros((0, 2))


def power_cells(C, w, bounds):
    """Exact convex power cells of centers C with weights w inside a bounding box."""
    x0, y0, x1, y1 = bounds
    box = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], float)
    cc = np.sum(C * C, axis=1)
    cells = []
    for j in range(len(C)):
        poly = box
        for m in range(len(C)):
            if m != j:
                poly = _clip_halfplane(poly, 2 * (C[m] - C[j]), cc[m] - cc[j] - w[m] + w[j])
        cells.append(Polygon(poly) if len(poly) >= 3 else Polygon())
    return cells


def parts(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [q for q in getattr(g, "geoms", []) if isinstance(q, Polygon) and q.area > 0]


def find_fragments(geoms, state, X, p, a):
    """Pieces of a district cut off from its main body within one landmass.

    Pieces on different landmasses (islands) are allowed. Within a landmass,
    each district keeps its most populous piece; every other piece is a
    fragment, handed to the neighbouring district it shares the most edge with.
    Returns a list of (polygon, receiving district).
    """
    out = []
    components = parts(state)
    for j, g in enumerate(geoms):
        mine = a == j
        for comp in components:
            pieces = [q for q in parts(g.intersection(comp)) if q.area > 1e-6]
            if len(pieces) < 2:
                continue
            pops = [p[mine][shapely.contains_xy(q, X[mine, 0], X[mine, 1])].sum() for q in pieces]
            keep = int(np.lexsort(([q.area for q in pieces], pops))[-1])
            for i, q in enumerate(pieces):
                if i == keep:
                    continue
                halo = q.buffer(0.05)
                shared = [halo.intersection(h).area if m != j else -1 for m, h in enumerate(geoms)]
                out.append((q, int(np.argmax(shared))))
    return out


def apply_fragments(geoms, fragments):
    geoms = list(geoms)
    for poly, d in fragments:
        geoms = [g.difference(poly) for g in geoms]
        geoms[d] = geoms[d].union(poly)
    return geoms


def polsby_popper(g):
    return 4 * np.pi * g.area / g.length ** 2 if g.length else 0.0


def reock(g):
    r = shapely.minimum_bounding_radius(g)
    return g.area / (np.pi * r * r) if r else 0.0


@lru_cache(maxsize=1)
def _counties(path):
    meta, _, geom, fields = pyogrio.raw.read(str(path), columns=["GEOID"])
    return dict(zip(fields[0], shapely.from_wkb(geom)))


def counties(fips, fwd, water=True):
    """County polygons for one state, projected, keyed by 3-digit county FIPS.

    water=True uses TIGER/Line (includes water, for contiguity);
    water=False uses the shoreline-clipped cartographic file (for display).
    """
    path = RAW / ("tl_2020_us_county.zip" if water else "cb_2020_us_county_500k.zip")
    return {int(g[2:]): project(v, fwd) for g, v in _counties(path).items() if g[:2] == fips}


def district_geoms(cpolys, whole, cells, fragments):
    """District polygons: whole counties, plus straight-line pieces of released counties."""
    k = len(cells)
    bits = [[] for _ in range(k)]
    for c, poly in cpolys.items():
        if c in whole:
            bits[whole[c]].append(poly)
        else:
            for j in range(k):
                q = poly.intersection(cells[j])
                if not q.is_empty:
                    bits[j].append(q)
    geoms = [shapely.make_valid(shapely.union_all(b)) if b else Polygon() for b in bits]
    return apply_fragments(geoms, fragments)
