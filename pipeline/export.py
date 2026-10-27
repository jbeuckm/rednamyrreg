"""Turn data/build/{XX,refined/XX,scored/XX}.pkl into the website's data files.

Outputs (docs/data/)
  districts.geojson   formula plan, 435 districts (display geometry)
  enacted.geojson     119th-Congress districts
  states.geojson      state outlines
  summary.json        per-state metrics, validation checks, candidate ensembles
  plans/XX.json       certificate: projection, centers, weights, county rule, refinement log
  plans/XX.csv.gz     block assignment file: 2020 block GEOID -> district
"""

import gzip
from functools import lru_cache
import json
import pickle
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio
import shapely
import shapely.geometry
from pyproj import Transformer
from shapely.geometry import mapping

from build import ALPHA, K, MAXDEV, YEARS
from blocks import load_blocks
from geometry import project, states_shoreline
from load import RAW
from states import STATES

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "data" / "build"
OUT = ROOT / "docs" / "data"
TOL_KM = 0.35


def r(x, n=4):
    return None if x is None else round(float(x), n)


def to_lonlat(g, inv):
    g = shapely.transform(g, lambda xy: np.column_stack(inv.transform(xy[:, 0], xy[:, 1])))
    return shapely.set_precision(g, 0.001)


def simplify(geoms):
    try:
        return list(shapely.coverage_simplify(np.array(geoms, dtype=object), TOL_KM))
    except Exception:
        return [g.simplify(TOL_KM) for g in geoms]


def colors(geoms, buf=0.2):
    """Map colouring (Welsh-Powell) so neighbouring districts never share a fill.

    `buf` is the touch tolerance in the geometries' units (0.2 km by default).
    """
    tree = shapely.STRtree(geoms)
    nbrs = [set(tree.query(g.buffer(buf), predicate="intersects")) - {i} for i, g in enumerate(geoms)]
    col = [-1] * len(geoms)
    for i in sorted(range(len(geoms)), key=lambda i: (-len(nbrs[i]), i)):
        used = {col[j] for j in nbrs[i]}
        col[i] = next(c for c in range(12) if c not in used)
    return col


@lru_cache(maxsize=1)
def unit_names():
    """County, place and town (county subdivision) names keyed by FIPS codes."""
    meta, _, _, f = pyogrio.raw.read(str(RAW / "cb_2020_us_county_500k.zip"), read_geometry=False,
                                     columns=["GEOID", "NAMELSAD"])
    col = dict(zip(meta["fields"], f))
    counties = dict(zip(col["GEOID"], col["NAMELSAD"]))
    pl = pd.read_csv(RAW / "national_place2020.txt", sep="|", dtype=str)
    places = dict(zip(pl.STATEFP + "P" + pl.PLACEFP, pl.PLACENAME))
    cs = pd.read_csv(RAW / "national_cousub2020.txt", sep="|", dtype=str)
    towns = dict(zip(cs.STATEFP + "T" + cs.COUSUBFP, cs.COUSUBNAME))
    return counties, {**places, **towns}


def district_details(a, other, other_labels, b, p, fips, k, target, formula):
    """Plain-language facts for each district: whole and split counties
    (with the reason a split was needed), split municipalities, split
    precincts, and where its residents sit in the other plan."""
    counties, munis = unit_names()
    cty = b.cty3.values
    df = pd.DataFrame({"c": cty, "m": b.Mw.values, "v": b.V.values, "d": a, "o": other, "p": p})
    df = df[df.p > 0]
    cpop = df.groupby("c")["p"].sum()
    cnd = df.groupby("c")["d"].nunique()
    mnd = df[df.m != ""].groupby("m")["d"].nunique()
    vnd = df[~b.prec.str.startswith("bg").values[p > 0]].groupby("v")["d"].nunique()
    out = []
    for d in range(k):
        x = df[df.d == d]
        cin = x.groupby("c")["p"].sum().sort_values(ascending=False)
        whole = [counties.get(fips + c, c) for c in cin.index if cnd[c] == 1]
        split = []
        for c in cin.index:
            if cnd[c] > 1:
                share = cin[c] / cpop[c]
                why = ""
                if formula:
                    why = ("has more people than one district holds" if cpop[c] > target
                           else "split so every district has equal population")
                split.append([counties.get(fips + c, c), round(float(share), 3), why])
        ms = [munis.get(fips + m, m) for m in x[x.m != ""].m.unique() if mnd.get(m, 1) > 1]
        ps = int(sum(1 for v in x.v.unique() if vnd.get(v, 1) > 1))
        ov = x.groupby("o")["p"].sum().sort_values(ascending=False)
        overlap = [[other_labels[int(o)], round(float(s / x.p.sum()), 3)] for o, s in ov.head(4).items() if s / x.p.sum() >= 0.01]
        out.append(dict(whole=whole[:15], whole_n=len(whole), split=split, munis=sorted(ms)[:12], munis_n=len(ms),
                        precincts=ps, overlap=overlap))
    return out


def plan_out(m, order):
    order = np.asarray(order)
    el = {key: dict(V=r(e["V"]), seatsD=e["seatsD"], eg=r(e["eg"]), mm=r(e["mm"]), bias=r(e["bias"]),
                    shares=[r(x) for x in np.asarray(e["shares"])[order]])
          for key, e in m["elections"].items()}
    pop = np.asarray(m["pop"])[order]
    return dict(
        pop=[int(x) for x in pop], dev=[r(x - m["target"], 1) for x in pop],
        range_people=m["range_people"], maxdev=r(m["maxdev"], 7),
        county_splits=m["county_splits"], counties=m["counties"],
        muni_splits=m["muni_splits"], munis=m["munis"],
        precinct_splits=m["precinct_splits"], precincts=m["precincts"],
        pieces=[int(x) for x in np.asarray(m["pieces"])[order]],
        pp=[r(x) for x in np.asarray(m["pp"])[order]], reock=[r(x) for x in np.asarray(m["reock"])[order]],
        minority=[r(x) for x in np.asarray(m["minority"])[order]],
        black=[r(x) for x in np.asarray(m["black"])[order]], hisp=[r(x) for x in np.asarray(m["hisp"])[order]],
        mm_districts=int((np.asarray(m["minority"]) > 0.5).sum()),
        elections=el,
        checks=[dict(id=c[0], label=c[1], status=c[2], detail=c[3]) for c in m["checks"]])


def main(only=None):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "plans").mkdir(exist_ok=True)
    feats, efeats, sfeats, states = [], [], [], []
    for fips, abbr, name, k in STATES:
        if only and abbr not in only:
            continue
        res = pickle.load(open(BUILD / f"{abbr}.pkl", "rb"))
        ref = pickle.load(open(BUILD / "refined" / f"{abbr}.pkl", "rb"))
        sc = pickle.load(open(BUILD / "scored" / f"{abbr}.pkl", "rb"))
        inv = Transformer.from_crs(res["proj"], "EPSG:4326", always_xy=True)
        fwd = Transformer.from_crs("EPSG:4326", res["proj"], always_xy=True)
        c = res["cands"][res["chosen"]]
        order = np.argsort(-c["C"][:, 1], kind="stable")      # number districts north to south
        rank = np.empty(k, int)
        rank[order] = np.arange(k)

        O, E = sc["ours"], sc["enacted"]
        geoms = [O["shore_geoms"][j] for j in order]
        col = colors(geoms)
        for j, g in enumerate(simplify(geoms)):
            feats.append(dict(type="Feature", geometry=mapping(to_lonlat(g, inv)),
                              properties=dict(st=abbr, d=j + 1, c=col[j])))
        eg = E["shore_geoms"]
        ecol = colors(eg)
        for j, g in enumerate(simplify(eg)):
            efeats.append(dict(type="Feature", geometry=mapping(to_lonlat(g, inv)),
                               properties=dict(st=abbr, d=j + 1, c=ecol[j], label=E["labels"][j])))
        shore = project(states_shoreline()[fips], fwd)
        sfeats.append(dict(type="Feature", properties=dict(st=abbr, name=name),
                           geometry=mapping(to_lonlat(shore.simplify(TOL_KM * 2), inv))))

        ens = []
        if k > 1:
            best = min(res["cands"][i]["moi"] for i in res["gate"])
            for i in res["uniq"]:
                x = res["cands"][i]
                el = x["elections"]
                ens.append(dict(
                    seed=x["seed"], moi=r(x["moi"] / best, 5), splits=x["county_splits"],
                    contiguous=bool(x["contiguous"]), maxdev=r(x["maxdev"], 5),
                    gated=i in res["gate"], chosen=i == res["chosen"],
                    bias=r(np.mean([el[y]["bias"] for y in YEARS if y in el])),
                    mm=r(np.mean([el[y]["mm"] for y in YEARS if y in el])),
                    eg=r(el["comp"]["eg"]), seatsD=el["comp"]["seatsD"]))

        lon, lat = inv.transform(c["C"][order, 0], c["C"][order, 1])
        cert = dict(
            state=abbr, seats=k, projection=res["proj"], seed=c["seed"],
            theta_degrees=r(np.degrees(c["theta"]), 2),
            rule=("Counties in county_rule are whole. Elsewhere: municipalities, then precincts, "
                  "then census blocks, each whole unless released (refinement_log), assigned by "
                  "argmin_j |x - c_j|^2 - w_j at the unit's population centre (projection km), "
                  "then boundary transfers. The block assignment file is authoritative."),
            centers=[[r(x, 5), r(y, 5)] for x, y in zip(lon, lat)],
            centers_km=[[r(x, 3), r(y, 3)] for x, y in c["C"][order]],
            weights_km2_county_stage=[r(x, 3) for x in np.asarray(c["w"])[order]],
            county_rule={f"{fips}{cty:03d}": int(rank[d]) + 1 for cty, d in sorted(c["whole"].items())},
            split_counties=[f"{fips}{cty:03d}" for cty in c["released"]],
            refinement_log=[f"{t}{u}" for t, u in ref["released"]],
        )
        (OUT / "plans" / f"{abbr}.json").write_text(json.dumps(cert))
        a = rank[sc["assign"]] + 1
        with gzip.open(OUT / "plans" / f"{abbr}.csv.gz", "wt") as f:
            f.write("GEOID20,district\n")
            f.writelines(f"{g},{d}\n" for g, d in zip(sc["GEOID"], a))

        blk, _, _ = load_blocks(fips, abbr)
        pb = blk["pop"].values
        target = pb.sum() / k
        ours_a = rank[sc["assign"]]
        en_a = np.where(sc["enacted_assign"] < 0, 0, sc["enacted_assign"])
        elabels = [("AL" if l == "00" else str(int(l))) for l in E["labels"]]
        O_det = district_details(ours_a, en_a, elabels, blk, pb, fips, k, target, True)
        E_det = district_details(en_a, ours_a, [str(i + 1) for i in range(k)], blk, pb, fips, len(E["labels"]), target, False)
        states.append(dict(
            abbr=abbr, name=name, fips=fips, seats=k, pop=int(np.sum(O["pop"])),
            has_vtd=bool(sc["has_vtd"]), chosen_seed=c["seed"], candidates=len(res["uniq"]),
            gate=len(res["gate"]), pure_splits=c["pure"]["splits"],
            partisan_step=bool(res.get("partisan_step", True)),
            prison_adjusted=bool(E.get("prison_adjusted", False)),
            ours=dict(plan_out(O, order), detail=O_det),
            enacted=dict(plan_out(E, np.arange(len(E["labels"]))), detail=E_det),
            enacted_labels=E["labels"], ensemble=ens))
        print(abbr, flush=True)

    summary = dict(generated=str(date.today()),
                   params=dict(K=K, alpha=ALPHA, maxdev=MAXDEV, years=YEARS, simplify_km=TOL_KM),
                   states=states)
    (OUT / "summary.json").write_text(json.dumps(summary, separators=(",", ":")))
    for fname, fs in [("districts", feats), ("enacted", efeats), ("states", sfeats)]:
        (OUT / f"{fname}.geojson").write_text(
            json.dumps(dict(type="FeatureCollection", features=fs), separators=(",", ":")))


def color_history():
    """Add neighbour-distinct fill indices to the historical maps (docs/data/history)."""
    for path in sorted((OUT / "history").glob("c*.geojson")):
        fc = json.loads(path.read_text())
        geoms = [shapely.make_valid(shapely.geometry.shape(f["geometry"])) for f in fc["features"]]
        idx = [i for i, f in enumerate(fc["features"]) if f["properties"]["d"] != 0]
        col = colors([geoms[i] for i in idx], buf=0.002) if idx else []
        for f in fc["features"]:
            f["properties"]["c"] = 0
        for i, c in zip(idx, col):
            fc["features"][i]["properties"]["c"] = c
        path.write_text(json.dumps(fc, separators=(",", ":")))
        print(path.name, max(col) + 1 if col else 0, "colours")


if __name__ == "__main__":
    if sys.argv[1:2] == ["--history"]:
        color_history()
    else:
        main(set(sys.argv[1:]))
