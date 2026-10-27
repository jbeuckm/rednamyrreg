#!/bin/sh
# Download every public input into data/raw/ (about 750 MB).
set -eu
cd "$(dirname "$0")/../data" && mkdir -p raw/alarm raw/vtd && cd raw

CENSUS=https://www2.census.gov/geo
curl -sSfLO $CENSUS/docs/reference/cenpop2020/blkgrp/CenPop2020_Mean_BG.txt
curl -sSfLO $CENSUS/tiger/TIGER2020/STATE/tl_2020_us_state.zip
curl -sSfLO $CENSUS/tiger/TIGER2020/COUNTY/tl_2020_us_county.zip
curl -sSfLO $CENSUS/tiger/GENZ2020/shp/cb_2020_us_state_500k.zip
curl -sSfLO $CENSUS/tiger/GENZ2020/shp/cb_2020_us_county_500k.zip
curl -sSfLO $CENSUS/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip

# VEST election results joined to 2020 Census geography by the ALARM Project.
for st in ak al ar az ca co ct de fl ga hi ia id il in ks ky la ma md me mi mn mo ms mt nc nd ne nh nj nm nv ny oh ok or pa ri sc sd tn tx ut va vt wa wi wv wy; do
  case $st in ca|hi|me|or) f=${st}_2020_block.csv;; *) f=${st}_2020_vtd.csv;; esac
  echo "https://raw.githubusercontent.com/alarm-redist/census-2020/main/census-vest-2020/$f alarm/$f"
done | xargs -P 6 -n 2 sh -c 'curl -sSfL "$0" -o "$1"'

# Voting-district interior points (for placing election results).
for f in 01 02 04 05 08 09 10 12 13 16 17 18 19 20 21 22 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 42 44 45 46 47 48 49 50 51 53 54 55 56; do
  echo "$CENSUS/tiger/TIGER2020PL/LAYER/VTD/2020/tl_2020_${f}_vtd20.zip vtd/tl_2020_${f}_vtd20.zip"
done | xargs -P 6 -n 2 sh -c 'curl -sSfL "$0" -o "$1"'

# Block level: polygons with 2020 population, official block -> VTD/place
# assignments, full-resolution 119th Congress districts, and place types.
mkdir -p blocks baf cd119
FIPS="01 02 04 05 06 08 09 10 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56"
for f in $FIPS; do
  echo "$CENSUS/tiger/TIGER2020/TABBLOCK20/tl_2020_${f}_tabblock20.zip blocks/tl_2020_${f}_tabblock20.zip"
  echo "$CENSUS/tiger/TIGER2024/CD/tl_2024_${f}_cd119.zip cd119/tl_2024_${f}_cd119.zip"
done | xargs -P 6 -n 2 sh -c 'curl -sSfL "$0" -o "$1"'
python3 - <<'PY' | xargs -P 6 -n 2 sh -c 'curl -sSfL "$0" -o "$1"'
import sys
sys.path.insert(0, "../../pipeline")
from states import STATES
for f, ab, _, _ in STATES:
    print(f"https://www2.census.gov/geo/docs/maps-data/data/baf2020/BlockAssign_ST{f}_{ab}.zip baf/BlockAssign_ST{f}_{ab}.zip")
PY
curl -sSfLO https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt
curl -sSfLO https://www2.census.gov/geo/docs/reference/codes2020/national_cousub2020.txt
