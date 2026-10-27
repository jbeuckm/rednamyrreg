"""Compute candidate plans for every state, select one by the published rule, save results.

Usage: python build.py [STATE ...]     (default: all 50 states)

Writes one pickle per state to data/build/. Run export.py afterwards.
"""

import os
import pickle
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio
import shapely

from district import assign, keep_counties_whole, moment_of_inertia, rebalance, solve
from geometry import (counties, district_geoms, enacted_districts, find_fragments,
                      power_cells, project, states_shoreline, states_with_water)
from blocks import block_votes, load_blocks
from load import RAW, block_groups, state_projection
from states import BY_ABBR, BY_FIPS, STATES

OUT = RAW.parent / "build"
K = 24              # candidate plans per state: seed angles 0, 7.5, ..., 172.5 degrees
ALPHA = 0.05        # compactness gate: within 5% of the most compact candidate
MAXDEV = 0.003      # hard population tolerance at block-group resolution
# States whose law bars partisan data in drawing (IA, MT, NE, NM, CA) or makes
# choosing on it risky (FL's intent standard): selection there uses no election data.
NO_PARTISAN = {"IA", "MT", "NE", "NM", "CA", "FL"}
YEARS = ["16", "18", "20"]
ABBR_LOWER = {s[0]: s[1].lower() for s in STATES}


@lru_cache(maxsize=1)
def state_inputs(fips):
    bg = block_groups()
    d = bg[bg.STATEFP == fips]
    lon, lat = d.LONGITUDE.values, d.LATITUDE.values
    proj, fwd, inv = state_projection(lon, lat)
    X = np.column_stack(fwd.transform(lon, lat))
    p = d.POPULATION.values.astype(float)
    # Election results and voting-age population, allocated to census blocks.
    blk, _, _ = load_blocks(fips, BY_FIPS[fips][1])
    elec = block_votes(BY_FIPS[fips][1], blk)
    Xe = np.column_stack(fwd.transform(blk.lon.values, blk.lat.values))
    water = project(states_with_water()[fips], fwd)
    shore = project(states_shoreline()[fips], fwd)
    return dict(d=d, X=X, p=p, county=d.COUNTYFP.values.astype(int), proj=proj, fwd=fwd, inv=inv,
                elec=elec, Xe=Xe, ecounty=blk.county.values, water=water, shore=shore,
                lonlat=np.column_stack([lon, lat]))


def partisan(D, R):
    """Plan-level partisan measures. Sign convention: positive = favors Republicans."""
    tot = D + R
    s = np.divide(D, tot, out=np.full(len(D), 0.5), where=tot > 0)
    V = D.sum() / tot.sum()
    win = s > 0.5
    need = tot / 2
    wD = np.where(win, D - need, D)
    wR = np.where(win, R, R - need)
    return dict(
        V=V, seatsD=int(win.sum()), shares=s,
        eg=float((wD.sum() - wR.sum()) / tot.sum()),
        mm=float(s.mean() - np.median(s)),
        bias=float(0.5 - np.mean(s + (0.5 - V) > 0.5)),
    )


def count_splits(a, county, p):
    return int(sum(len(np.unique(a[(county == c) & (p > 0)])) > 1 for c in np.unique(county)))


def district_stats(a, k, inp):
    """Population, county splits, election and VAP totals for an assignment."""
    p, county, e = inp["p"], inp["county"], inp["elec"]
    target = p.sum() / k
    P = np.bincount(a, p, k)
    split = count_splits(a, county, p)
    ae = inp["ea"]
    tot = lambda col: np.bincount(ae, e[col].values, k)
    elections = {y: partisan(tot(f"adv_{y}"), tot(f"arv_{y}")) for y in YEARS
                 if e[f"adv_{y}"].sum() + e[f"arv_{y}"].sum() > 0}
    elections["comp"] = partisan(tot("ndv"), tot("nrv"))
    elections["pres20"] = partisan(tot("pre_20_dem_bid"), tot("pre_20_rep_tru"))
    vap = tot("vap")
    minority = 1 - np.divide(tot("vap_white"), vap, out=np.ones(k), where=vap > 0)
    black = np.divide(tot("vap_black"), vap, out=np.zeros(k), where=vap > 0)
    hisp = np.divide(tot("vap_hisp"), vap, out=np.zeros(k), where=vap > 0)
    return dict(pop=P, maxdev=float(np.abs(P - target).max() / target), county_splits=int(split),
                moi=moment_of_inertia(inp["X"], p, a, k), elections=elections,
                minority=minority, black=black, hisp=hisp)


def plan_assign(Xq, cq, C, w, whole, fragments):
    """Assign arbitrary points (with county codes cq) under a plan's rules."""
    a = assign(Xq, C, w)
    for c, d in whole.items():
        a[cq == c] = d
    for poly, d in fragments:
        a[shapely.contains_xy(poly, Xq[:, 0], Xq[:, 1])] = d
    return a


def candidate(args):
    fips, s = args
    k = BY_FIPS[fips][3]
    inp = state_inputs(fips)
    X, p, water, county = inp["X"], inp["p"], inp["water"], inp["county"]
    cpolys = counties(fips, inp["fwd"], water=True)
    theta = s * np.pi / K
    t0 = time.time()
    C, w, a0 = solve(X, p, k, theta)
    pure = dict(moi=moment_of_inertia(X, p, a0, k), splits=count_splits(a0, county, p))
    bounds = np.array(water.bounds) + [-50, -50, 50, 50]
    # `rel` = counties released to the straight-line rule. Each call below
    # warm-starts from it, so a county is only ever released once per pass.
    rel, frags, extra = set(), [], np.full(len(X), -1)
    for _ in range(40):
        w, a, lab, released = keep_counties_whole(X, p, county, C, w, a0, extra, rel)
        rel = set(released)
        whole = {c: int(lab[county == c][0]) for c in np.unique(county) if c not in rel}
        geoms = district_geoms(cpolys, whole, power_cells(C, w, bounds), frags)
        new = find_fragments(geoms, water, X, p, a)
        if not new:
            break
        # A populated fragment means a whole county cut a district in two:
        # release the whole counties around it back to the straight-line rule.
        bad = set()
        for poly, _ in new:
            inside = shapely.contains_xy(poly, X[:, 0], X[:, 1])
            if p[inside].sum() > 0:
                halo = poly.buffer(0.5)
                bad |= {c for c in whole if cpolys[c].intersects(halo)}
        if bad:
            rel |= bad
            continue
        # Otherwise only slivers remain (state shape, islands): hand them to a neighbour.
        frags += new
        for poly, dd in new:
            extra[shapely.contains_xy(poly, X[:, 0], X[:, 1])] = dd
    # Re-whole pass: try restoring each released county that is still split,
    # lowest FIPS first; keep the change only if the plan stays balanced and
    # contiguous and splits fewer counties.
    target = p.sum() / k
    for c in sorted(rel):
        if len(np.unique(a[(county == c) & (p > 0)])) < 2:
            continue
        w2, a2, lab2, rel2 = keep_counties_whole(X, p, county, C, w, a0, extra, rel - {c})
        if c in rel2 or count_splits(a2, county, p) >= count_splits(a, county, p):
            continue
        whole2 = {q: int(lab2[county == q][0]) for q in np.unique(county) if q not in rel2}
        g2 = district_geoms(cpolys, whole2, power_cells(C, w2, bounds), frags)
        ok = np.abs(np.bincount(a2, p, k) - target).max() / target <= 0.003
        if ok and not find_fragments(g2, water, X, p, a2):
            rel, w, a, whole = set(rel2), w2, a2, whole2
    lab = np.full(len(X), -1)
    for c, d in whole.items():
        lab[county == c] = d
    w, a = rebalance(X, p, C, w, np.where(extra >= 0, extra, lab))
    geoms = district_geoms(cpolys, whole, power_cells(C, w, bounds), frags)
    contiguous = not find_fragments(geoms, water, X, p, a)
    a = plan_assign(X, county, C, w, whole, frags)
    inp["ea"] = plan_assign(inp["Xe"], inp["ecounty"], C, w, whole, frags)
    st = district_stats(a, k, inp)
    return dict(seed=s, theta=theta, C=C, w=w, a=a, whole=whole, released=sorted(rel),
                fragments=[(f.wkb, d) for f, d in frags], contiguous=contiguous, pure=pure,
                secs=time.time() - t0, **st)


def select(cands, partisan_ok=True):
    """The published selection rule (see the site's Method section).

    1. Hard constraints: contiguous and every district within MAXDEV of equal.
    2. Counties before compactness: keep plans splitting at most
       min + max(2, 20%) counties.
    3. Compactness gate: within ALPHA of the most compact remaining plan.
    4. Fairness: smallest |partisan bias| (2016/18/20 average), then
       smallest |mean-median|, then most compact. Where state law bars
       partisan data (partisan_ok=False): most compact, then fewest splits.
    Returns (chosen index, gate set, distinct set).
    """
    uniq, seen = [], set()
    for i, c in enumerate(cands):
        key = tuple(np.round(np.sort(c["pop"]), 0)) + (round(c["moi"], 3),)
        if key not in seen:
            seen.add(key)
            uniq.append(i)
    valid = [i for i in uniq if cands[i]["contiguous"] and cands[i]["maxdev"] <= MAXDEV]
    if not valid:
        lo = min(cands[i]["maxdev"] for i in uniq)
        valid = [i for i in uniq if cands[i]["maxdev"] <= lo + 1e-9]
    fewest = min(cands[i]["county_splits"] for i in valid)
    tier = [i for i in valid if cands[i]["county_splits"] <= fewest + max(2, int(np.ceil(0.2 * fewest)))]
    best = min(cands[i]["moi"] for i in tier)
    gate = [i for i in tier if cands[i]["moi"] <= (1 + ALPHA) * best]

    def score(i):
        if not partisan_ok:
            return (cands[i]["moi"], cands[i]["county_splits"], cands[i]["seed"])
        el = cands[i]["elections"]
        bias = np.mean([el[y]["bias"] for y in YEARS if y in el])
        mm = np.mean([el[y]["mm"] for y in YEARS if y in el])
        return (round(abs(bias), 6), round(abs(mm), 4), cands[i]["moi"])

    return min(gate, key=score), gate, uniq


def run_state(abbr, cands=None):
    fips, _, name, k = BY_ABBR[abbr]
    t = time.time()
    inp = state_inputs(fips)
    if k == 1:
        a = np.zeros(len(inp["X"]), int)
        inp["ea"] = np.zeros(len(inp["elec"]), int)
        C = np.average(inp["X"], axis=0, weights=inp["p"])[None]
        cands = [dict(seed=0, theta=0.0, C=C, w=np.zeros(1), a=a, fragments=[], contiguous=True,
                      whole={}, released=[], pure=dict(moi=0.0, splits=0),
                      secs=0.0, **district_stats(a, 1, inp))]
        chosen, gate, uniq = 0, [0], [0]
    else:
        chosen, gate, uniq = select(cands, abbr not in NO_PARTISAN)
    res = dict(fips=fips, abbr=abbr, name=name, k=k, proj=inp["proj"], cands=cands,
               chosen=chosen, gate=gate, uniq=uniq, partisan_step=abbr not in NO_PARTISAN)
    with open(OUT / f"{abbr}.pkl", "wb") as f:
        pickle.dump(res, f)
    c = cands[chosen]
    print(f"{abbr} k={k} cands={len(uniq)} gate={len(gate)} chosen=#{c['seed']} "
          f"dev={c['maxdev']*100:.2f}% contig={c['contiguous']} splits={c['county_splits']} "
          f"(pure {c['pure']['splits']}) "
          f"D seats(comp)={c['elections']['comp']['seatsD']} "
          f"{time.time()-t:.0f}s", flush=True)


def reselect(abbrs):
    """Re-apply the selection rule to saved candidates (no recomputation)."""
    for ab in abbrs:
        path = OUT / f"{ab}.pkl"
        res = pickle.load(open(path, "rb"))
        if res["k"] > 1:
            res["chosen"], res["gate"], res["uniq"] = select(res["cands"], ab not in NO_PARTISAN)
        res["partisan_step"] = ab not in NO_PARTISAN
        pickle.dump(res, open(path, "wb"))
        print(ab, "chosen", res["cands"][res["chosen"]]["seed"], "partisan" if res["partisan_step"] else "no-partisan")


if __name__ == "__main__":
    if sys.argv[1:2] == ["--reselect"]:
        reselect(sys.argv[2:] or [s[1] for s in STATES])
        sys.exit()
    OUT.mkdir(parents=True, exist_ok=True)
    todo = sys.argv[1:] or [s[1] for s in sorted(STATES, key=lambda s: -s[3])]
    with ProcessPoolExecutor(max_workers=int(os.environ.get("WORKERS", 4))) as pool:
        # Queue every (state, seed) task up front, biggest states first, so
        # no worker idles while one state's slowest candidate finishes.
        futs = {ab: [pool.submit(candidate, (BY_ABBR[ab][0], s)) for s in range(K)]
                for ab in todo if BY_ABBR[ab][3] > 1}
        for ab in todo:
            run_state(ab, [f.result() for f in futs[ab]] if ab in futs else None)
