"""Loaders for census block-group population points and per-state projections."""

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


@lru_cache(maxsize=1)
def block_groups():
    """2020 Census block-group centers of population (one row per block group)."""
    df = pd.read_csv(RAW / "CenPop2020_Mean_BG.txt", dtype=str, encoding="utf-8-sig")
    df["POPULATION"] = df["POPULATION"].astype(int)
    df["LATITUDE"] = df["LATITUDE"].astype(float)
    df["LONGITUDE"] = df["LONGITUDE"].astype(float)
    df["GEOID"] = df.STATEFP + df.COUNTYFP + df.TRACTCE + df.BLKGRPCE
    return df


def state_projection(lon, lat):
    """Albers equal-area projection (km) fitted to a state's extent."""
    lo1, lo2 = np.percentile(lat, [10, 90])
    proj = (f"+proj=aea +lat_1={lo1:.3f} +lat_2={lo2:.3f} +lat_0={np.mean(lat):.3f} "
            f"+lon_0={np.mean(lon):.3f} +datum=WGS84 +units=km +no_defs")
    fwd = Transformer.from_crs("EPSG:4326", proj, always_xy=True)
    inv = Transformer.from_crs(proj, "EPSG:4326", always_xy=True)
    return proj, fwd, inv
