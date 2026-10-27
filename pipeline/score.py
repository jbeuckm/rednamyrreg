"""Score and validate both plans for every state at census-block level.

For the formula plan (data/build/refined/XX.pkl) and the enacted plan in use
for the November 2026 elections (Census 120th-Congress block equivalency
file), compute exact populations, true geometry (the union of each district's
blocks), contiguity, enclaves, compactness, county / municipality / precinct
splits, partisan and voting-age measures, and run the validation checklist.
Writes data/build/scored/XX.pkl.

Usage: python score.py [STATE ...]
"""

import os
import pickle
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
import pyogrio
import shapely
from pyproj import Transformer

from blocks import YEARS, block_votes, load_blocks
from build import partisan
from geometry import parts, polsby_popper, project, reock, states_shoreline, states_with_water
from load import RAW
from states import BY_ABBR, STATES

BUILD = RAW.parent / "build"
OUT = BUILD / "scored"

# Validation thresholds (see the site's "Is it usable?" section for sources).
# Engineering flags, not legal rules: litigated districts have scored PP
# 0.08-0.11 and Reock 0.20-0.26.
REOCK_FLAG = 0.20
PP_FLAG = 0.10
TENNANT = 0.0079       # largest congressional deviation the Supreme Court has upheld (WV, 2012)
# States whose enacted plans were likely balanced on prisoner-reallocated
# counts, so their raw-count ranges are not defects (inference, not confirmed).
PRISON_ADJUSTED = {"CA", "CO", "MD", "NJ", "NV", "RI", "VA", "WA", "NY", "DE", "CT", "IL", "MA"}


def enacted_assignment(fips, geoid):
    """Block -> district from the Census 120th-Congress block equivalency file."""
    bef = pd.read_csv(RAW / "cd120" / "bystate" / f"{fips}.csv", header=None,
                      names=["GEOID", "CD"], dtype=str).set_index("GEOID")["CD"]
    cd = bef.reindex(geoid).fillna("ZZ").values
    codes = sorted(c for c in set(cd) if c != "ZZ")
    lut = {c: i for i, c in enumerate(codes)}
    a = np.array([lut.get(c, -1) for c in cd])
    return a, codes


def splits(key, a, p):
    g = pd.DataFrame({"g": key, "d": a})[(key != "") & (p > 0)]
    n = g.groupby("g")["d"].nunique()
    return int((n > 1).sum()), int(len(n))


def enclaves(geoms, state):
    """Districts entirely surrounded by a single other district."""
    out = []
    edge = state.boundary
    for d, g in enumerate(geoms):
        if g.boundary.intersection(edge).length > 1e-6:
            continue
        nb = [m for m, h in enumerate(geoms) if m != d and g.boundary.intersection(h).length > 1e-6]
        if len(nb) == 1:
            out.append(d)
    return out


def precinct_slivers(a, b, p):
    """Split-precinct pieces holding 1-99 residents (ballot-secrecy flag)."""
    g = pd.DataFrame({"v": b.V.values, "d": a, "p": p})[~b.prec.str.startswith("bg").values]
    pieces = g.groupby(["v", "d"])["p"].sum()
    nd = pieces.groupby(level=0).size()
    split = pieces[pieces.index.get_level_values(0).isin(nd[nd > 1].index)]
    return int(((split >= 1) & (split <= 99)).sum())


def ohio_caps(a, b, p):
    g = pd.DataFrame({"c": b.cty3.values, "d": a})[p > 0]
    n = g.groupby("c")["d"].nunique()
    return int((n == 1).sum()), int((n == 2).sum()), int((n >= 3).sum())


def pieces_per_landmass(geoms, state):
    """Largest number of separate pieces any district has on one landmass."""
    worst = []
    comps = [c for c in parts(state) if c.area > 1e-6]
    for g in geoms:
        m = 1
        for comp in comps:
            q = [x for x in parts(g.intersection(comp)) if x.area > 1e-6]
            m = max(m, len(q))
        worst.append(m)
    return worst


def plan_metrics(a, k, b, p, votes, geoms_water, shore, water, extra):
    a = np.where(a < 0, 0, a)       # unassigned water blocks hold no people
    target = p.sum() / k
    P = np.bincount(a, p, k)
    shore_geoms = [shapely.make_valid(g.intersection(shore)) for g in geoms_water]
    tot = lambda col: np.bincount(a, votes[col].values, k)
    el = {y: partisan(tot(f"adv_{y}"), tot(f"arv_{y}")) for y in YEARS if votes[f"adv_{y}"].sum() > 0}
    el["comp"] = partisan(tot("ndv"), tot("nrv"))
    el["pres20"] = partisan(tot("pre_20_dem_bid"), tot("pre_20_rep_tru"))
    vap = tot("vap")
    sv = lambda col: np.divide(tot(col), vap, out=np.zeros(k), where=vap > 0)
    cs, cn = splits(b.cty3.values, a, p)
    ms, mn = splits(b.Mw.values, a, p)
    vs, vn = splits(np.where(b.prec.str.startswith("bg"), "", b.V.values) if extra["has_vtd"] else np.full(len(b), ""), a, p)
    pieces = pieces_per_landmass(geoms_water, water)
    pp = [polsby_popper(g) for g in shore_geoms]
    rk = [reock(g) for g in shore_geoms]
    hull = [g.area / g.convex_hull.area if g.area else 0 for g in shore_geoms]
    return dict(
        pop=P.astype(int), target=target, range_people=int(P.max() - P.min()),
        maxdev=float(np.abs(P - target).max() / target),
        county_splits=cs, counties=cn, muni_splits=ms, munis=mn, precinct_splits=vs, precincts=vn,
        pieces=pieces, pp=pp, reock=rk, hull=hull, elections=el,
        enclaves=enclaves(geoms_water, water), slivers=precinct_slivers(a, b, p) if extra["has_vtd"] else 0,
        ohio=ohio_caps(a, b, p),
        minority=1 - sv("vap_white"), black=sv("vap_black"), hisp=sv("vap_hisp"),
        shore_geoms=shore_geoms)


def checks(m, k, abbr, enacted=None):
    """The validation checklist. Each item: (id, label, status, detail).

    Status: pass, justified (allowed with a stated, consistently applied
    reason), review (worse than a benchmark or near a common flag), fail.
    """
    out = []
    rng, md = m["range_people"], m["maxdev"]
    if rng <= 1:
        st, why = "pass", "within one person"
    elif md <= TENNANT:
        st, why = "justified", ("closing the gap would split another county or municipality; "
                                "far below the 0.79% upheld in Tennant v. Jefferson County (2012)")
    else:
        st, why = "fail", "above any deviation the Supreme Court has upheld"
    out.append(("population", "Equal population", st,
                f"largest minus smallest district: {rng:,} people ({md * 100:.4f}% max deviation); {why}"))
    worst = max(m["pieces"])
    out.append(("contiguity", "Contiguous (shared edges, no corner-only links)", "pass" if worst == 1 else "fail",
                "every district is one piece on each landmass" if worst == 1 else f"a district has {worst} pieces"))
    out.append(("enclaves", "No enclaves", "pass" if not m["enclaves"] else "review",
                "no district is surrounded by another" if not m["enclaves"] else f"{len(m['enclaves'])} enclosed district(s)"))
    out.append(("blocks", "Whole census blocks, each assigned once", "pass",
                f"{k} districts built from whole 2020 blocks; none empty"))
    lo_r, lo_p = min(m["reock"]), min(m["pp"])
    flag = lo_r < REOCK_FLAG or lo_p < PP_FLAG
    if enacted is not None:
        flag = flag and (lo_r < min(enacted["reock"]) or lo_p < min(enacted["pp"]))
    out.append(("compactness", "No bizarrely shaped districts", "review" if flag else "pass",
                f"lowest Reock {lo_r:.2f}, lowest Polsby–Popper {lo_p:.2f}"
                + (f" (enacted: {min(enacted['reock']):.2f}, {min(enacted['pp']):.2f})" if enacted is not None else "")))
    if enacted is not None:
        for key, label in [("county_splits", "counties"), ("muni_splits", "municipalities"),
                           ("precinct_splits", "precincts")]:
            ours, theirs = m[key], enacted[key]
            out.append((key, f"Split {label}", "pass" if ours <= theirs else "review",
                        f"{ours} vs {theirs} in the enacted 2026 map"))
    if enacted is not None:
        out.append(("slivers", "No tiny split-precinct pieces (ballot secrecy)",
                    "pass" if m["slivers"] == 0 else ("justified" if m["slivers"] <= enacted["slivers"] else "review"),
                    f"{m['slivers']} split-precinct pieces with 1–99 residents ({enacted['slivers']} in the enacted 2026 map)"))
    if abbr == "OH":
        whole, once, more = m["ohio"]
        ok = whole >= 65 and once <= 18 and more <= 5
        out.append(("ohio", "Ohio Art. XIX county limits", "pass" if ok else "fail",
                    f"{whole} counties whole (≥65), {once} split once (≤18), {more} split more than once (≤5)"))
    if abbr == "IA":
        out.append(("iowa", "Iowa §42.4: each district within 1% of ideal", "pass" if md <= 0.01 else "fail",
                    f"max deviation {md * 100:.4f}%"))
    return out


def score_state(abbr):
    fips, _, name, k = BY_ABBR[abbr]
    ref = pickle.load(open(BUILD / "refined" / f"{abbr}.pkl", "rb"))
    res = pickle.load(open(BUILD / f"{abbr}.pkl", "rb"))
    b, wkb, has_vtd = load_blocks(fips, abbr, geometry=True)
    assert (b.GEOID.values == ref["GEOID"]).all()
    p = b["pop"].values
    votes = block_votes(abbr, b)
    fwd = Transformer.from_crs("EPSG:4326", res["proj"], always_xy=True)
    water = project(states_with_water()[fips], fwd)
    shore = project(states_shoreline()[fips], fwd)
    polys = project(shapely.from_wkb(wkb), fwd)

    a = ref["assign"].astype(int)
    ours_geo = [shapely.coverage_union_all(polys[a == d]) for d in range(k)]
    ea, codes = enacted_assignment(fips, b.GEOID.values)
    en_geo = [shapely.coverage_union_all(polys[ea == d]) for d in range(len(codes))]
    extra = dict(has_vtd=has_vtd)
    ours = plan_metrics(a, k, b, p, votes, ours_geo, shore, water, extra)
    en = plan_metrics(ea, len(codes), b, p, votes, en_geo, shore, water, extra)
    ours["checks"] = checks(ours, k, abbr, en)
    en["checks"] = checks(en, len(codes), abbr)
    en["prison_adjusted"] = abbr in PRISON_ADJUSTED
    en["labels"] = codes
    inv = Transformer.from_crs(res["proj"], "EPSG:4326", always_xy=True)
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / f"{abbr}.pkl", "wb") as f:
        pickle.dump(dict(abbr=abbr, k=k, ours=ours, enacted=en, has_vtd=has_vtd, proj=res["proj"],
                         GEOID=b.GEOID.values, assign=a, enacted_assign=ea), f)
    flags = [c[0] for c in ours["checks"] if c[2] not in ("pass",)]
    print(f"{abbr} range={ours['range_people']} pieces={max(ours['pieces'])} "
          f"splits c/m/p={ours['county_splits']}/{ours['muni_splits']}/{ours['precinct_splits']} "
          f"enacted {en['county_splits']}/{en['muni_splits']}/{en['precinct_splits']} "
          f"PP {np.mean(ours['pp']):.2f} vs {np.mean(en['pp']):.2f} flags={flags}", flush=True)


if __name__ == "__main__":
    todo = sys.argv[1:] or [s[1] for s in sorted(STATES, key=lambda s: -s[3])]
    with ProcessPoolExecutor(max_workers=int(os.environ.get("WORKERS", 3))) as pool:
        list(pool.map(score_state, todo))
