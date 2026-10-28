# Rednamyrreg: fair congressional districts by formula

*Rednamyrreg* is "gerrymander" spelled backwards. The public proposal is called **Neutral Lines**.

## The rules, in plain words

1. **Same size.** Every district has the same number of people. Everyone counts.
2. **One piece.** Every district is one connected piece.
3. **Blindfolded.** The map never looks at how people vote, what race they are, or where politicians live.
4. **Don't cut places apart.** Cut as few counties as possible. If a county has to be cut, keep its cities and towns whole. If a town has to be cut, keep its voting precincts whole.
5. **Keep people close to the middle.** If two maps cut the same number of counties, pick the one where people live closest to the middle of their district.
6. **Once every 10 years.** Make a new map only after each census. Anyone can check the math, and if someone finds a better map under these rules, theirs wins.

The exact version of each rule is in [The rule](#the-rule) below.

## Mission

**Find the fairest congressional districts that the largest possible share of Americans can agree to, and that a state could actually adopt, administer and defend in court.**

Each part of that mission rules something out:

- **"Fairest" means fair in a way that can be proved, not merely claimed.** No map can guarantee fair outcomes for every arrangement of voters: Alexeev & Mixon (2018) proved that equal population, compactness and a bounded efficiency gap cannot always hold together. So fairness rests on the *process*:
  - the rule is written before anyone sees the data;
  - it is one rule for every state, with no adjustable settings;
  - it is blind to party, race and incumbents, both while drawing and while choosing between maps;
  - it gives one answer: the plan that splits the fewest counties, then is the most compact, so nobody picks the outcome;
  - it is deterministic, so anyone can rerun it and get the same result;
  - it publishes a certificate that anyone can check.
- **"Agreement among all Americans" means designing for the other side's trust.** Voters of every party must be able to accept a map whose seat count they dislike. That requires process arguments over outcome arguments, local integrity (keep my county, town and precinct whole), and a rule with no dial anyone could turn toward a side. Partisan fairness is measured and published, never used to choose. Adopted nationally, the rule changes every state at once, so no one disarms alone.
- **"A viable, practical candidate" means passing every legal and administrative test a real plan faces.** The bar includes:
  - equal population to the person, on whole census blocks;
  - contiguity on true geometry;
  - lines along county, municipal, precinct or block boundaries;
  - few split precincts and no tiny ballot-secrecy fragments;
  - a plan published as a standard block assignment file that election offices can load.

## Focus

1. **Compute** a complete 435-district plan from 2020 Census blocks with one published rule (`pipeline/`).
2. **Validate** it, and the maps actually in use for November 2026, with the same automated legal and practical checklist, and test whether the rule could be tuned to favor a party.
3. **Critique** the 2025–26 redraws and the reform proposals now in play, judging each for legality, compliance and its ability to build consensus. That includes our own approach. See [ASSESSMENT.md](ASSESSMENT.md).
4. **Plan adoption**: name and framing, initiative, commission, court and federal paths, and the two-sided compact. The full plan is on the site.
5. **Publish everything**, including where our plan does worse than an enacted map, because credibility with skeptics is the scarcest resource in redistricting.

## What's here

This repository holds:

1. **A website** in `docs/`, served by GitHub Pages. It covers:
   - the history of U.S. congressional districting, from 1812 to the 2025–26 mid-decade redraws and *Louisiana v. Callais*;
   - nine principles for redistricting whose properties can be proved or checked;
   - a checklist of the legal and practical objections a plan must survive;
   - an interactive map with three modes: the formula's 435 districts, the districts in use for the November 2026 elections, and an annotated history of congressional maps since 1813.
2. **The pipeline** in `pipeline/`, which builds every district from 2020 Census blocks.

The site has three pages:
- `index.html`: the interactive map, built on MapLibre GL with OpenFreeMap / OpenStreetMap basemaps. It shows the formula plan, the 2026 maps and the history, with per-district explanations.
- `fairness.html`: the plan from every perspective, the tuning test, federal legality state by state, and the assessment.
- `state.html?st=XX`: one page per state. Each has every district explained, the federal legal analysis, the state rules a national standard would replace, and the process to adopt the plan there before a federal law, with links to the official sources.

## The rule

For each state with *k* seats, a place *x* belongs to district

```
argmin_j  |x - c_j|^2 - w_j
```

The centers *c_j* are the population centers of their districts, and the weights *w_j* make populations equal. The rule then applies in tiers:

1. **Counties stay whole** unless a split is needed for equal population or contiguity.
2. **Inside split counties, municipalities stay whole, then precincts.** A municipality is a city, town, or (in the 12 states where they govern) township. Each whole unit is placed by the same rule at its population center.
3. **Boundary transfers settle the last few hundred people.** They run along a spanning tree of district borders: whole precincts move first, then blocks are peeled off one precinct per border.
4. **Single-block moves finish to the person.** A move is allowed only if it keeps districts contiguous and avoids new splits or tiny precinct pieces.

**Choosing the plan.** Each candidate starts from a seed angle on an even grid over 0–180°. A candidate is valid if it is contiguous and every district is within 0.3% at the county stage. The plan is the valid candidate that splits the **fewest counties**, then has the **smallest moment of inertia**; ties go to the smaller angle. The grid starts at 24 angles and doubles (48, 96, …) until a doubling finds no better plan. Most states stop at 48 angles; Wisconsin's search, the longest, ended at 1,536. The code stops at 3,072 as a safety limit, which no state reaches. No election, race or incumbent data are read at any step. Election data are loaded afterwards, only to audit the result.

**One national rule.** The same rule runs in all 50 states, with no state-specific modules. It is meant to be adopted by Congress under Art. I §4, replacing each state's own congressional criteria. `score.py` still reports how each plan measures against the main current state rules (Iowa and West Virginia whole counties, Ohio Art. XIX), so readers can see what a national standard would replace.

**Checked against every idea of fairness.** We surveyed what Americans, both parties, civil-rights and reform groups, courts, researchers and other democracies mean by a fair map (`fairness.html#ideas`). Where an idea could be met without adding a setting someone could tune, it became part of the rule:

- **Who counts:** every resident, with people in prison counted at their last home address, from a national Census Bureau tabulation the act would require. The 2020 demonstration uses raw counts everywhere, because that file does not exist yet.
- **Fixed national definitions:** counties; municipalities (incorporated places, plus towns in the twelve town-government states); the Census Bureau's voting districts as precincts; blocks. Districts connect along shared block edges, and water inside a state connects.
- **A public check of the data:** census counts and boundary files are published for correction before the rule runs. Corrections change data, never lines.
- **Once per census:** no mid-decade redraws except by court order.
- **Voting Rights Act remedies by formula:** if a court finds a Section 2 violation, the districts its judgment requires are fixed and the rule redraws the rest of the state.

Ideas that need judgment or election data (competitiveness, proportionality, partisan symmetry, minority opportunity, typicality among neutral maps) are measured and published, never used to draw. Some ideas contradict each other outright, and the site says which way the rule goes and why.

## Reproduce

```sh
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
pipeline/download.sh             # ~10 GB of Census + VEST/ALARM data into data/raw/
cd pipeline
../.venv/bin/python build.py     # county-level search and selection -> data/build/XX.pkl
../.venv/bin/python refine.py    # municipality / precinct / block refinement -> data/build/refined/
../.venv/bin/python score.py     # block-level scoring + validation of both plans -> data/build/scored/
../.venv/bin/python export.py    # site data -> docs/data/
../.venv/bin/python -I history.py && ../.venv/bin/python export.py --history   # historical maps
```

Every step also accepts state codes, such as `refine.py NC PA`. `WORKERS=n` sets the number of parallel processes (default 4 for `build.py`, 3 for `refine.py` and `score.py`). `build.py` reuses candidates already saved in `data/build/`, so a rerun only computes new angles.

The 120th-Congress block equivalency file (`cd120.zip`) is not fetched by `download.sh`. Download it from the Census Bureau's [mapping files page](https://www.census.gov/geographies/mapping-files/2027/dec/rdo/120-congressional-district-bef.html) into `data/raw/cd120/`, then split it by state into `data/raw/cd120/bystate/`.

## Outputs (`docs/data/`)

| File | Contents |
|---|---|
| `districts.geojson` | The formula's 435 districts (simplified for display) |
| `enacted.geojson` | Districts in use for November 2026 (Census 120th-Congress block equivalency file) |
| `summary.json` | Per-state metrics for both plans, the validation checklist and the candidate ensemble |
| `plans/XX.csv.gz` | **Block assignment file**: 2020 block GEOID → district (the authoritative plan) |
| `plans/XX.json` | Certificate: objective, search trace, projection, centers, weights, whole counties, split counties, refinement log |
| `history/` | 15 historical maps (13th–119th Congress) and 34 annotated districts |
| `process/` | For each state: who has authority, legal basis, criteria, mid-decade rules, every adoption path (with signature counts and deadlines), the best window, and official links |

## Validation

`score.py` runs the same checks on the formula plan and on the enacted 2026 plan:

- **Population:** range ≤ 1 person, or a "justified" deviation caused by the keep-whole rule, far below the 0.79% upheld in *Tennant*.
- **Contiguity:** shared edges only, with water inside the state allowed.
- **Enclaves:** no district surrounded by another.
- **Whole blocks:** every block assigned exactly once.
- **Compactness:** flags districts below the litigated range (PP < 0.10, Reock < 0.20) when they are also worse than the enacted map's least compact district.
- **Splits:** county, municipality and precinct splits compared with the enacted map.
- **Tiny precinct pieces:** split-precinct pieces with 1–99 residents (a ballot-secrecy concern).
- **Current state rules (reported, not enforced):** Iowa and West Virginia whole counties, Iowa's 1% limit, Ohio's Art. XIX caps.
- **Audit only (never used to draw):** partisan bias, efficiency gap, mean–median, competitive districts, responsiveness, majority-Black, -Hispanic, -Asian and majority-minority districts, core retention against the current map, and where the rule's plan falls among all the valid plans the search found.

## Data

- **U.S. Census Bureau, 2020:** census blocks with population (TABBLOCK20), block assignment files (VTD, place, county subdivision), block-group centers of population, state and county boundaries, and the 120th-Congress block equivalency file.
- **Election results:** Voting and Election Science Team (VEST) precinct results, joined to 2020 Census geography by the [ALARM Project](https://github.com/alarm-redist/census-2020) (CC BY-SA 4.0), and allocated to blocks by population.
- **Historical boundaries:** Jeffrey B. Lewis, Brandon DeVine, Lincoln Pritcher and Kenneth C. Martis, [congressional-district-boundaries](https://github.com/JeffreyBLewis/congressional-district-boundaries) (MIT License).

## Limits

- The plans use raw Census counts. The national rule counts prisoners at their last home address, which needs a national tabulation that does not exist yet.
- Communities of interest without legal boundaries are not protected.
- Partisan measures describe how districts leaned in the 2016–20 statewide races. They are not forecasts, and the rule never uses them.
- Compact, neutral maps lean Republican where Democrats cluster in cities. The rule does not correct for this, because any correction needs a fairness dial that could be tuned.
