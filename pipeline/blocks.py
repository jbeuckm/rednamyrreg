"""Census-block data shared by every stage: population, location, county,
municipality, precinct, and election results allocated to blocks."""

import zipfile
from functools import lru_cache

import numpy as np
import pandas as pd
import pyogrio

from load import RAW

# States where towns/townships (minor civil divisions) are the general-purpose
# local governments, so they stand in for municipalities outside cities.
STRONG_MCD = {"CT", "ME", "MA", "MI", "MN", "NH", "NJ", "NY", "PA", "RI", "VT", "WI"}
YEARS = ["16", "18", "20"]
VOTE_COLS = ["pre_20_dem_bid", "pre_20_rep_tru", "ndv", "nrv"] + \
    [f"{x}_{y}" for y in YEARS for x in ("adv", "arv")]
VAP_COLS = ["vap", "vap_white", "vap_black", "vap_hisp"]


@lru_cache(maxsize=1)
def incorporated_places():
    df = pd.read_csv(RAW / "national_place2020.txt", sep="|", dtype=str)
    df = df[df.TYPE == "INCORPORATED PLACE"]
    return set(df.STATEFP + df.PLACEFP)


def load_blocks(fips, abbr, geometry=False):
    """One row per 2020 census block, with unit keys for each tier.

    Returns (DataFrame, WKB array or None, has_vtd). Tier keys:
      A  municipality piece within a county, or a rural precinct
      B  precinct piece within A
      V  whole precinct (for split counts);  Mw  whole municipality
    """
    path = RAW / "blocks" / f"tl_2020_{fips}_tabblock20.zip"
    meta, _, geom, f = pyogrio.raw.read(
        str(path), read_geometry=geometry,
        columns=["GEOID20", "COUNTYFP20", "POP20", "INTPTLAT20", "INTPTLON20"])
    col = dict(zip(meta["fields"], f))      # pyogrio returns fields in file order
    b = pd.DataFrame({"GEOID": col["GEOID20"], "cty3": col["COUNTYFP20"],
                      "pop": col["POP20"].astype(float),
                      "lat": col["INTPTLAT20"].astype(float), "lon": col["INTPTLON20"].astype(float)})
    b["county"] = b.cty3.astype(int)
    zpath = RAW / "baf" / f"BlockAssign_ST{fips}_{abbr}.zip"
    if zipfile.is_zipfile(zpath):
        z = zipfile.ZipFile(zpath)

        def baf(kind):
            name = f"BlockAssign_ST{fips}_{abbr}_{kind}.txt"
            if name not in z.namelist():
                return None
            return pd.read_csv(z.open(name), sep="|", dtype=str).set_index("BLOCKID")

        vtd, place, mcd = baf("VTD"), baf("INCPLACE_CDP"), baf("MCD")
    else:
        print(f"  {abbr}: block assignment file unavailable; locating blocks in VTD/place/county-subdivision polygons")
        vtd, place, mcd = baf_from_polygons(fips, b)
    raw_vtd = vtd["DISTRICT"].reindex(b.GEOID).fillna("").values if vtd is not None else np.full(len(b), "")
    has_vtd = bool((raw_vtd != "").mean() > 0.5)
    bg = b.GEOID.str[5:12].values
    if has_vtd:
        prec = np.where(raw_vtd == "", "bg" + bg, raw_vtd)
    else:              # no Census VTDs here: block groups stand in for precincts
        prec = "bg" + bg
    b["vtd_geoid"] = np.where(raw_vtd != "", fips + b.cty3.values + raw_vtd, "")
    inc = incorporated_places()
    pl = place["PLACEFP"].reindex(b.GEOID).fillna("").values if place is not None else np.full(len(b), "")
    is_inc = pd.Series([fips + x for x in pl]).isin(inc).values & (pl != "")
    muni = np.where(is_inc, "P" + pl, "")
    if abbr in STRONG_MCD and mcd is not None:
        cs = mcd["COUSUBFP"].reindex(b.GEOID).fillna("").values
        muni = np.where((muni == "") & (cs != "") & (cs != "00000"), "T" + cs, muni)
    cty = b.cty3.values
    b["prec"], b["muni"] = prec, muni
    b["A"] = np.where(muni != "", cty + "|" + muni, cty + "|v" + prec)
    b["B"] = np.where(muni != "", cty + "|" + muni + "|v" + prec, cty + "|v" + prec)
    b["V"] = cty + "|v" + prec
    b["Mw"] = muni
    return b, (geom if geometry else None), has_vtd


def baf_from_polygons(fips, b):
    """Rebuild the Census block assignment tables by locating each block's
    interior point in the TIGER/Line VTD, place and county-subdivision polygons."""
    import shapely
    pts = shapely.points(b.lon.values, b.lat.values)
    out = []
    for path, cols in [(RAW / "vtd" / f"tl_2020_{fips}_vtd20.zip", {"VTDST20": "DISTRICT"}),
                       (RAW / "fallback" / f"tl_2020_{fips}_place.zip", {"PLACEFP": "PLACEFP"}),
                       (RAW / "fallback" / f"tl_2020_{fips}_cousub.zip", {"COUSUBFP": "COUSUBFP"})]:
        meta, _, geom, f = pyogrio.raw.read(str(path), columns=list(cols))
        vals = dict(zip(meta["fields"], f))[list(cols)[0]]
        tree = shapely.STRtree(shapely.from_wkb(geom))
        pi, gi = tree.query(pts, predicate="within")
        code = np.full(len(b), "", dtype=object)
        code[pi] = vals[gi]
        out.append(pd.DataFrame({list(cols.values())[0]: code}, index=b.GEOID.values))
    return out


def block_votes(abbr, b):
    """VEST/ALARM election and voting-age-population columns, allocated to blocks.

    Precinct (VTD) totals are spread over the precinct's blocks in proportion
    to population (equally if the precinct has no residents). The four states
    ALARM publishes at block level are joined directly.
    """
    ab = abbr.lower()
    cols = VOTE_COLS + VAP_COLS
    blk = RAW / "alarm" / f"{ab}_2020_block.csv"
    out = pd.DataFrame(0.0, index=np.arange(len(b)), columns=cols)
    if blk.exists():
        e = pd.read_csv(blk, usecols=["GEOID20"] + cols, dtype={"GEOID20": str}).fillna(0)
        e = e.set_index("GEOID20").reindex(b.GEOID).fillna(0)
        out[cols] = e[cols].values
        return out
    e = pd.read_csv(RAW / "alarm" / f"{ab}_2020_vtd.csv", usecols=["GEOID20"] + cols,
                    dtype={"GEOID20": str}).fillna(0).set_index("GEOID20")
    key = b.vtd_geoid.values
    has = key != ""
    vpop = b[has].groupby("vtd_geoid")["pop"].transform("sum").values
    vcnt = b[has].groupby("vtd_geoid")["pop"].transform("size").values
    share = np.where(vpop > 0, b["pop"].values[has] / np.maximum(vpop, 1), 1.0 / vcnt)
    vals = e.reindex(key[has]).fillna(0)[cols].values
    out.loc[has, cols] = vals * share[:, None]
    return out
