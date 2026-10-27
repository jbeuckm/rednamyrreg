"""Historical congressional district maps for the site's "annotated history" layer.

Source
  Jeffrey B. Lewis, Brandon DeVine, Lincoln Pritcher and Kenneth C. Martis,
  "Digital Boundary Definitions of U.S. Congressional Districts, 1789-2012"
  (Version 2.0, updated through the 119th Congress), MIT License.
  https://github.com/JeffreyBLewis/congressional-district-boundaries

  The repository's GeoJson/ directory holds one file per state per range of
  Congresses (e.g. Alabama_018_to_022.geojson). Each feature carries
  `district` (0 = at-large, -1 = Indian territory), `startcong` and `endcong`.
  Coordinates are NAD83 lon/lat (EPSG:4269).

What this script does
  1. Lists the GeoJson/ directory through the GitHub API and downloads every
     file whose Congress range covers one of SNAPSHOTS into
     data/raw/history/ (files already present are skipped).
  2. For each snapshot Congress, keeps the features in effect in that
     Congress, drops DC, territories and Indian-territory shapes (-1),
     merges duplicate (state, district) pieces, and simplifies each state's
     districts as a coverage in EPSG:5070 with a 1.5 km tolerance
     (raised for files that would exceed 600 KB).
  3. Writes docs/data/history/cNNN.geojson with properties {"st", "d"} and,
     for a state electing several members at large, a single d=0 feature with
     "n" = number of at-large seats, plus docs/data/history/index.json.
  4. Checks the hand-written docs/data/history/annotations.json: every
     annotation must name a snapshot Congress and a state (and, unless
     d is null, a district) that has a geometry in that snapshot.

Run:  ../.venv/bin/python -I history.py          (from pipeline/)
      ../.venv/bin/python -I history.py --check  (only re-check annotations.json)

Notes
  * Which states had at-large seats, and how many (n), is not recoverable
    from the source data alone; it comes from AT_LARGE / GENERAL_TICKET
    below (Voteview member roster). See AT_LARGE for details.
  * Islands under 10 km2 are dropped. If a file would exceed 600 KB at a
    1.5 km tolerance, the tolerance is raised in steps (see TOLERANCES).
  * When a state elected some members by district and others at large, the
    d=0 feature is the whole state and overlaps the numbered districts; d=0
    features are written first so a map can draw them underneath.
  * Plural-member districts (common before 1842) appear as one feature;
    the schema does not record how many members they elected.
"""

import json
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
import pyproj
import shapely
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "history"
OUT = ROOT / "docs" / "data" / "history"

REPO = "JeffreyBLewis/congressional-district-boundaries"
BRANCH = "master"
TREE_URL = f"https://api.github.com/repos/{REPO}/git/trees/{BRANCH}?recursive=1"
RAW_URL = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/"

# Simplification tolerance in EPSG:5070 metres. The first value is used unless
# the file would exceed MAX_BYTES, in which case the next is tried.
TOLERANCES = (1500, 1750, 2000, 2250, 2500, 3000)
MAX_BYTES = 600_000

# Congress -> (years, title, summary). Seat totals are computed from the output.
SNAPSHOTS = {
    13: ("1813–1815", "The early republic",
         "Each state chose how to elect its members. Massachusetts drew 20 "
         "single-member districts; New Jersey, New York, Pennsylvania and Maryland "
         "drew districts some of which elected two or more members; and "
         "Connecticut, Delaware, Georgia, New Hampshire, Rhode Island and Vermont "
         "elected their whole delegations statewide on a 'general ticket'. "
         "Massachusetts' 1812 state senate map had just given the language the "
         "word 'gerrymander'."),
    28: ("1843–1845", "The first districting mandate",
         "The Apportionment Act of 1842 required members to be elected from "
         "contiguous single-member districts. Four states (Georgia, Mississippi, "
         "Missouri and New Hampshire) ignored it and elected at large anyway, and "
         "the House seated their members."),
    45: ("1877–1879", "The end of Reconstruction",
         "Elected in 1876, the year of the disputed Hayes–Tilden presidential "
         "election. As Democrats regained control of Southern legislatures, they "
         "redrew districts to concentrate Black Republican voters into as few seats "
         "as possible, as in Mississippi's 'shoestring' 6th district along the "
         "Mississippi River."),
    48: ("1883–1885", "Packing after Reconstruction",
         "Southern legislatures redrew again after the 1880 Census. South "
         "Carolina's new 7th district snaked across nine counties to take in as "
         "many Black voters as possible, and Mississippi placed the Delta in a "
         "single district. Several states that gained seats in 1880 elected the "
         "new members at large instead of redrawing."),
    63: ("1913–1915", "The House reaches 435",
         "The 1911 apportionment set the House at 433 seats (435 once Arizona and "
         "New Mexico were admitted in 1912) and required "
         "contiguous, compact districts 'containing as nearly as practicable an "
         "equal number of inhabitants'. States that gained seats often elected the "
         "extra members at large rather than redraw."),
    73: ("1933–1935", "No standards, many at-large seats",
         "The 1929 Act re-apportioned seats automatically but dropped the "
         "compactness and equal-population language, and in Wood v. Broom (1932) "
         "the Supreme Court held those requirements had lapsed. Kentucky, Minnesota, "
         "Missouri and Virginia, whose new maps were vetoed or struck down in "
         "court, elected their entire delegations at large in 1932."),
    88: ("1963–1965", "Malapportionment before Wesberry",
         "Many states had not redrawn in decades, so urban districts held two to "
         "more than four times as many people as rural ones in the same state. In Wesberry v. "
         "Sanders (February 1964) the Supreme Court held that congressional "
         "districts must be as nearly equal in population as practicable."),
    93: ("1973–1975", "One person, one vote",
         "The first maps drawn after the 1970 Census under Wesberry and Kirkpatrick "
         "v. Preisler (1969), which demanded near-exact population equality. "
         "A 1967 statute required single-member districts, and no state with more "
         "than one seat still elected members at large."),
    103: ("1993–1995", "Majority-minority districts",
          "After the 1982 amendments to the Voting Rights Act and Thornburg v. "
          "Gingles (1986), states drew many new majority-Black and majority-"
          "Hispanic districts, some of them very irregular. Shaw v. Reno (1993) "
          "opened these to racial-gerrymandering challenges."),
    109: ("2005–2007", "Texas redraws mid-decade",
          "Texas replaced its court-drawn 2002 map with a new legislative map in "
          "2003, the first major mid-decade congressional redraw of the modern era. "
          "In LULAC v. Perry (2006) the Supreme Court upheld most of it but found "
          "District 23 violated the Voting Rights Act."),
    113: ("2013–2015", "After the 2010 redistricting cycle",
          "Maps drawn after the 2010 Census, with sophisticated software and "
          "precinct-level data, produced some of the least compact districts on "
          "the country, among them Pennsylvania's 7th, Maryland's 3rd and Ohio's 9th."),
    115: ("2017–2019", "Pennsylvania before the court map",
          "The last Congress elected under Pennsylvania's 2011 map, which the "
          "Pennsylvania Supreme Court struck down in January 2018 as a partisan "
          "gerrymander under the state constitution."),
    116: ("2019–2021", "Pennsylvania's remedial map",
          "Pennsylvania elected its delegation from a map drawn by the state "
          "Supreme Court in February 2018, which split far fewer counties than the "
          "2011 plan. Elsewhere, the 2010-cycle maps (with court-ordered changes in "
          "states such as Florida, North Carolina and Virginia) remained in use."),
    118: ("2023–2025", "After the 2020 Census",
          "The first Congress elected from maps drawn after the 2020 Census. "
          "Several of these maps were still in litigation when the 2022 elections "
          "were held."),
    119: ("2025–2027", "Court-ordered changes",
          "Elected in 2024. After Allen v. Milligan (2023), Alabama used a "
          "court-drawn map with a second district giving Black voters an "
          "opportunity to elect a candidate of their choice; Louisiana, Georgia, "
          "New York and North Carolina also used revised maps."),
}

# Two-letter codes for the 50 states (DC and territories are excluded).
STATE_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
    "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
    "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR",
    "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}


# ---------------------------------------------------------------- download

def list_source_files():
    """Return [(filename, first_congress, last_congress)] for GeoJson/*.geojson."""
    with urllib.request.urlopen(TREE_URL, timeout=60) as resp:
        tree = json.load(resp)["tree"]
    files = []
    for item in tree:
        path = item["path"]
        if not (path.startswith("GeoJson/") and path.endswith(".geojson")):
            continue
        name = path.split("/", 1)[1]
        stem = name[: -len(".geojson")]
        state, first, _, last = stem.rsplit("_", 3)
        files.append((name, int(first), int(last)))
    return files


def needed_files(files, congresses):
    names = {name for name, a, b in files
             if any(a <= c <= b for c in congresses)
             and name.rsplit("_", 3)[0] in STATE_ABBR}
    names |= {name for name, _ in BORROWED_OUTLINE.values()}
    return sorted(names)


def download(names):
    RAW.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names, 1):
        dest = RAW / name
        if dest.exists() and dest.stat().st_size > 0:
            continue
        url = RAW_URL + "GeoJson/" + urllib.parse.quote(name)
        print(f"  [{i}/{len(names)}] {name}", file=sys.stderr)
        tmp = dest.with_suffix(".part")
        with urllib.request.urlopen(url, timeout=300) as resp, open(tmp, "wb") as fh:
            while chunk := resp.read(1 << 20):
                fh.write(chunk)
        tmp.rename(dest)


# At-large seats in each snapshot Congress: {state: members elected at large}
# for states that elected some or all members at large while having more than
# one seat. Single-seat states are not listed; they are always at large.
#
# The source data cannot say this by itself: an at-large (district 0) shape is
# stored once with the full range of Congresses in which that outline was
# used, including Congresses in which the state elected by district. So the
# seat counts come from the Voteview member roster (HSall_members.csv:
# district code 98 = general ticket, 99 = an extra at-large seat, later
# occupants of the same seat removed), cross-checked with the apportionment.
AT_LARGE = {
    13: {"CT": 7, "DE": 2, "GA": 6, "NH": 6, "RI": 2, "VT": 6},
    28: {"GA": 8, "MO": 5, "MS": 4, "NH": 4},
    45: {},
    48: {"AR": 1, "CA": 2, "GA": 1, "KS": 4, "ME": 4, "NC": 1, "NY": 1,
         "PA": 1, "VA": 1},
    63: {"AL": 1, "CO": 2, "FL": 1, "ID": 2, "IL": 2, "MI": 1, "MN": 1,
         "MT": 2, "OH": 1, "OK": 3, "PA": 4, "TX": 2, "UT": 2, "WA": 2,
         "WV": 1},
    73: {"CT": 1, "FL": 1, "IL": 2, "KY": 9, "MN": 9, "MO": 13, "ND": 2,
         "NY": 2, "OH": 2, "OK": 1, "TX": 3, "VA": 9},
    88: {"AL": 8, "CT": 1, "HI": 2, "MD": 1, "MI": 1, "NM": 2, "OH": 1,
         "TX": 1},
}

# States that elected their entire (multi-member) delegation at large.
GENERAL_TICKET = {
    13: {"CT", "DE", "GA", "NH", "RI", "VT"},
    28: {"GA", "MO", "MS", "NH"},
    48: {"ME"},
    63: {"ID", "MT", "UT"},
    73: {"KY", "MN", "MO", "ND", "VA"},
    88: {"AL", "HI", "NM"},
}

# Size of the House in each snapshot Congress (history.house.gov).
HOUSE_SIZE = {13: 182, 28: 223, 45: 293, 48: 325}  # 435 from the 63rd on

# The source has no Alabama file for the 88th Congress (all 8 seats were
# elected at large in 1962); borrow the state outline from the 89th.
BORROWED_OUTLINE = {(88, "AL"): ("Alabama_089_to_089.geojson", 89)}

MIN_PART_M2 = 1e7   # drop islands smaller than 10 km2 (invisible at national scale)


# ------------------------------------------------------------------ build

def read_features(path, congress):
    """Yield (district, geometry) for features of `path` in effect in `congress`."""
    data = json.loads(path.read_text())
    for feat in data["features"]:
        p = feat["properties"]
        if feat["geometry"] is None:
            continue
        if not (int(p["startcong"]) <= congress <= int(p["endcong"])):
            continue
        yield int(p["district"]), shapely.from_geojson(json.dumps(feat["geometry"]))


def polygonal(g):
    """Make `g` valid and keep only its polygonal parts."""
    g = shapely.make_valid(g)
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    parts = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    return shapely.union_all(parts) if parts else shapely.Polygon()


def drop_specks(g):
    """Remove polygon parts under MIN_PART_M2, always keeping the largest part."""
    parts = list(shapely.get_parts(g))
    if len(parts) <= 1:
        return g
    areas = shapely.area(parts)
    keep = [p for p, a in zip(parts, areas) if a >= MIN_PART_M2] or [parts[int(np.argmax(areas))]]
    return shapely.multipolygons(keep) if len(keep) > 1 else keep[0]


def repair_coverage(geoms, grid=1.0):
    """Rebuild a state's districts as an exact coverage.

    All district boundaries are snapped to a 1 m grid and noded together;
    each resulting face goes to the first district containing it, so
    overlapping slivers are assigned once and shared edges match exactly.
    Faces in no district (gaps) are dropped.
    """
    snapped = [polygonal(shapely.set_precision(g, grid)) for g in geoms]
    lines = shapely.union_all(shapely.boundary(np.array(snapped, dtype=object)), grid_size=grid)
    faces = np.array(list(shapely.get_parts(shapely.polygonize(list(shapely.get_parts(lines))))), dtype=object)
    points = shapely.point_on_surface(faces)
    owner = np.full(len(faces), -1)
    for i, g in enumerate(snapped):
        shapely.prepare(g)
        free = owner < 0
        owner[free & shapely.contains(g, points)] = i
    return [polygonal(shapely.union_all(faces[owner == i], grid_size=grid))
            for i in range(len(snapped))]


def prepare_coverage(geoms):
    """Return (geometries, status) ready for coverage simplification.

    status is "ok" if the districts already form a valid coverage,
    "repaired" if repair_coverage() fixed overlapping slivers in the source,
    or "fallback" if neither worked; those are simplified one district at a
    time with simplify(preserve_topology=True).
    """
    arr = np.array(geoms, dtype=object)
    if len(arr) == 1 or shapely.coverage_is_valid(arr):
        return arr, "ok"
    fixed = np.array(repair_coverage(arr), dtype=object)
    if shapely.coverage_is_valid(fixed):
        return fixed, "repaired"
    return arr, "fallback"


def simplify(arr, status, tol):
    if status == "fallback":
        return list(shapely.simplify(arr, tol, preserve_topology=True))
    return list(shapely.coverage_simplify(arr, tol))


def rounded(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 3), round(coords[1], 3)]
    return [rounded(c) for c in coords]


def prepare_snapshot(congress, files, fwd, log):
    """Collect one Congress's districts in EPSG:5070, ready to simplify.

    Returns {state: {"d": [numbered districts], "geoms": coverage array,
    "status": ..., "at_large": statewide geometry or None}}.
    """
    pieces = defaultdict(list)          # (st, d) -> [geometry]
    for name, a, b in files:
        if not (a <= congress <= b):
            continue
        state = name.rsplit("_", 3)[0]
        if state not in STATE_ABBR:
            continue
        for d, g in read_features(RAW / name, congress):
            if d >= 0:                  # -1 marks Indian territories
                pieces[(STATE_ABBR[state], d)].append(g)

    for (c, st), (name, other) in BORROWED_OUTLINE.items():
        if c == congress and not any(k[0] == st for k in pieces):
            pieces[(st, 0)] = [shapely.union_all([g for _, g in read_features(RAW / name, other)])]
            log.append(f"{congress}: {st} missing from source; outline taken from {name}")

    by_state = defaultdict(dict)        # st -> {d: projected geometry}
    for (st, d), gs in pieces.items():
        g = polygonal(shapely.union_all([polygonal(x) for x in gs]))
        g = shapely.transform(g, lambda xy: np.column_stack(fwd.transform(xy[:, 0], xy[:, 1])))
        by_state[st][d] = drop_specks(g)

    at_large = AT_LARGE.get(congress, {})
    general = GENERAL_TICKET.get(congress, set())
    for st, dists in by_state.items():
        numbered = [d for d in dists if d > 0]
        if st in general:
            # Whole delegation at large: keep only the statewide shape.
            if 0 not in dists:
                dists[0] = shapely.union_all(list(dists.values()))
                log.append(f"{congress}: {st} at-large shape built from its district outlines")
            for d in numbered:
                del dists[d]
        elif numbered and st not in at_large and 0 in dists:
            del dists[0]                # outline stored for other Congresses
        elif numbered and st in at_large and 0 not in dists:
            dists[0] = shapely.union_all([dists[d] for d in numbered])
            log.append(f"{congress}: {st} at-large shape built from its district outlines")
    for st in at_large:
        assert 0 in by_state.get(st, {}), f"{congress}: {st} has no at-large shape"

    prepared, status = {}, defaultdict(list)
    for st in sorted(by_state):
        dists = by_state[st]
        numbered = sorted(d for d in dists if d > 0)
        geoms, how = prepare_coverage([dists[d] for d in numbered]) if numbered else ([], "ok")
        status[how].append(st)
        prepared[st] = {"d": numbered, "geoms": geoms, "status": how,
                        "at_large": dists.get(0)}
    for how in ("repaired", "fallback"):
        if status[how]:
            log.append(f"{congress}: coverage {how}: {', '.join(status[how])}")
    return prepared


def render(congress, prepared, tol, inv, log):
    """Simplify with tolerance `tol` (metres) and return GeoJSON features."""
    at_large = AT_LARGE.get(congress, {})
    features = []
    for st, item in prepared.items():
        out = dict(zip(item["d"], simplify(item["geoms"], item["status"], tol))) if item["d"] else {}
        if item["at_large"] is not None:
            out[0] = shapely.coverage_simplify(np.array([item["at_large"]], dtype=object), tol)[0]
        for d in sorted(out):       # 0 first: drawn beneath any numbered districts
            g = shapely.transform(out[d], lambda xy: np.column_stack(inv.transform(xy[:, 0], xy[:, 1])))
            g = polygonal(shapely.set_precision(g, 0.001))
            if g.is_empty:
                log.append(f"{congress}: dropped empty geometry {st}-{d}")
                continue
            props = {"st": st, "d": d}
            if d == 0 and at_large.get(st, 1) > 1:
                props["n"] = at_large[st]
            geom = mapping(g)
            features.append({"type": "Feature", "properties": props,
                             "geometry": {"type": geom["type"],
                                          "coordinates": rounded(geom["coordinates"])}})
    return features


def seat_count(congress, features):
    """Members elected under this map, counting n for multi-seat at-large shapes."""
    return sum(f["properties"].get("n", 1) for f in features)


def main():
    files = list_source_files()
    download(needed_files(files, SNAPSHOTS))
    OUT.mkdir(parents=True, exist_ok=True)
    fwd = pyproj.Transformer.from_crs(4269, 5070, always_xy=True)
    inv = pyproj.Transformer.from_crs(5070, 4326, always_xy=True)

    log, snapshots = [], []
    for congress, (years, title, summary) in SNAPSHOTS.items():
        prepared = prepare_snapshot(congress, files, fwd, log)
        for tol in TOLERANCES:
            features = render(congress, prepared, tol, inv, log)
            text = json.dumps({"type": "FeatureCollection", "features": features},
                              separators=(",", ":"))
            if len(text) <= MAX_BYTES:
                break
        if tol != TOLERANCES[0]:
            log.append(f"{congress}: tolerance raised to {tol / 1000:g} km to stay under "
                       f"{MAX_BYTES // 1000} KB")
        fname = f"c{congress:03d}.geojson"
        path = OUT / fname
        path.write_text(text)
        seats = HOUSE_SIZE.get(congress, 435)
        counted = seat_count(congress, features)
        states = len({f["properties"]["st"] for f in features})
        print(f"{fname}: {len(features)} features, {states} states, "
              f"{counted} seats counted / {seats} in House, "
              f"{path.stat().st_size / 1024:.0f} KB")
        snapshots.append({"congress": congress, "years": years, "file": fname,
                          "title": title, "summary": summary, "seats": seats})

    index = {
        "source": SOURCE,
        "snapshots": snapshots,
    }
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    for line in log:
        print("note:", line)
    check_annotations()


def check_annotations():
    """Check that every annotation points at a snapshot and, unless it is
    statewide (d = null), at a district with a geometry in that snapshot."""
    path = OUT / "annotations.json"
    if not path.exists():
        return
    notes = json.loads(path.read_text())
    present = {}
    problems = []
    ids = [a["id"] for a in notes]
    if len(ids) != len(set(ids)):
        problems.append("duplicate ids")
    for a in notes:
        c = a["congress"]
        if c not in SNAPSHOTS:
            problems.append(f"{a['id']}: Congress {c} is not a snapshot")
            continue
        if c not in present:
            fc = json.loads((OUT / f"c{c:03d}.geojson").read_text())
            present[c] = {(f["properties"]["st"], f["properties"]["d"]) for f in fc["features"]
                          if f["geometry"] and f["geometry"]["coordinates"]}
        states = {st for st, _ in present[c]}
        if a["st"] not in states:
            problems.append(f"{a['id']}: no {a['st']} in Congress {c}")
        elif a["d"] is not None and (a["st"], a["d"]) not in present[c]:
            problems.append(f"{a['id']}: no {a['st']}-{a['d']} in Congress {c}")
    for line in problems:
        print("annotation problem:", line)
    print(f"annotations: {len(notes)} checked, {len(problems)} problems")


SOURCE = (
    "District boundaries: Jeffrey B. Lewis, Brandon DeVine, Lincoln Pritcher, and "
    "Kenneth C. Martis, Digital Boundary Definitions of United States Congressional "
    "Districts, 1789-2012 (Version 2.0, with updates through the 119th Congress), "
    "https://cdmaps.polisci.ucla.edu and "
    "https://github.com/JeffreyBLewis/congressional-district-boundaries. "
    "Copyright (c) 2013-2018 Jeffrey B. Lewis; used under the MIT License. "
    "Simplified for web display (1.5-3 km tolerance); at-large seat counts "
    "from the Voteview member roster (https://voteview.com)."
)


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check_annotations()
    else:
        main()
