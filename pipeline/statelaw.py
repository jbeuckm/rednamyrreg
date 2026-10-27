"""State-law modules: plans for states whose own law forbids what the general
rule does.

  Iowa (Const. art. III §37; Code §42.4) and West Virginia (Const. art. I §4):
      congressional districts are made of whole counties. Each district is
      kept as close to the ideal population as whole counties allow
      (Iowa: within 1%).
  Ohio (Const. art. XIX §2(B)): at least 65 counties whole, at most 18 split
      once and 5 split twice; Cleveland and Cincinnati unsplit; two districts
      may share at most one county under 400,000 people; each district's part
      of a county contiguous.

All three start from the formula's own county-level plan and change it only
as much as the law requires, so the plan stays the formula's plan wherever
the state allows.
"""

from collections import deque

import numpy as np
import pandas as pd

WHOLE_COUNTY = {"IA", "WV"}


# ---------------------------------------------------------------- unit graph

def unit_graph(unit, ei, ej):
    """Adjacency between units (e.g. counties) from block adjacency pairs."""
    u, v = unit[ei], unit[ej]
    m = u != v
    pairs = set(zip(np.minimum(u[m], v[m]).tolist(), np.maximum(u[m], v[m]).tolist()))
    nb = {}
    for x, y in pairs:
        nb.setdefault(x, set()).add(y)
        nb.setdefault(y, set()).add(x)
    return nb


def connected_without(units_of_d, removed, nb):
    """Is the set `units_of_d` minus `removed` still connected?"""
    rest = units_of_d - removed
    if not rest:
        return False            # never empty a district
    if len(rest) == 1:
        return True
    start = next(iter(rest))
    seen, q = {start}, deque([start])
    while q:
        x = q.popleft()
        for y in nb.get(x, ()):
            if y in rest and y not in seen:
                seen.add(y)
                q.append(y)
    return len(seen) == len(rest)


def unit_local_search(assign, upop, nb, k, locked=(), max_moves=20000):
    """Move single border units between neighbouring districts.

    Each step takes the move that most reduces the sum of squared population
    deviations, then the largest deviation, keeping every district connected
    and never moving a unit in `locked`. Deterministic; stops at a local optimum.
    """
    assign = dict(assign)
    target = sum(upop.values()) / k
    pop = np.zeros(k)
    members = {d: set() for d in range(k)}
    for u, d in assign.items():
        pop[d] += upop[u]
        members[d].add(u)
    locked = set(locked)
    for _ in range(max_moves):
        dev = pop - target
        best = None
        for u in sorted(assign):
            if u in locked:
                continue
            s = assign[u]
            for t in sorted({assign[x] for x in nb.get(u, ()) if x in assign} - {s}):
                p = upop[u]
                gain = dev[s] ** 2 + dev[t] ** 2 - (dev[s] - p) ** 2 - (dev[t] + p) ** 2
                if gain <= 1e-9:
                    continue
                key = (gain, -u, -t)
                if best is None or key > best[0]:
                    if connected_without(members[s], {u}, nb):
                        best = (key, u, s, t)
        if best is None:
            # No single move helps: try swapping one border unit each way
            # between two neighbouring districts.
            best2 = None
            border = {}
            for u in assign:
                if u in locked:
                    continue
                for t in {assign[x] for x in nb.get(u, ()) if x in assign} - {assign[u]}:
                    border.setdefault((assign[u], t), []).append(u)
            for (s, t), us in sorted(border.items()):
                if s > t or (t, s) not in border:
                    continue
                for u in us:
                    for v in border[(t, s)]:
                        pu, pv = upop[u], upop[v]
                        ns, nt = dev[s] - pu + pv, dev[t] + pu - pv
                        gain = dev[s] ** 2 + dev[t] ** 2 - ns ** 2 - nt ** 2
                        if gain <= 1e-9 or (best2 and gain <= best2[0][0]):
                            continue
                        ms = (members[s] - {u}) | {v}
                        mt = (members[t] - {v}) | {u}
                        if connected_without(ms, set(), nb) and connected_without(mt, set(), nb):
                            best2 = ((gain, -u, -v), u, v, s, t)
            if best2 is None:
                break
            _, u, v, s, t = best2
            assign[u], assign[v] = t, s
            members[s] = (members[s] - {u}) | {v}
            members[t] = (members[t] - {v}) | {u}
            pop[s] += upop[v] - upop[u]
            pop[t] += upop[u] - upop[v]
            continue
        _, u, s, t = best
        assign[u] = t
        members[s].discard(u)
        members[t].add(u)
        pop[s] -= upop[u]
        pop[t] += upop[u]
    return assign


def repair_components(assign, nb, upop, k):
    """Give every cut-off piece of a district to the neighbour it touches most."""
    assign = dict(assign)
    for _ in range(50):
        changed = False
        for d in range(k):
            mem = {u for u, x in assign.items() if x == d}
            comps, seen = [], set()
            for s in sorted(mem):
                if s in seen:
                    continue
                comp, q = {s}, deque([s])
                seen.add(s)
                while q:
                    x = q.popleft()
                    for y in nb.get(x, ()):
                        if y in mem and y not in seen:
                            seen.add(y)
                            comp.add(y)
                            q.append(y)
                comps.append(comp)
            if len(comps) < 2:
                continue
            comps.sort(key=lambda c: -sum(upop[u] for u in c))
            for comp in comps[1:]:
                votes = {}
                for u in comp:
                    for y in nb.get(u, ()):
                        if y not in comp and assign[y] != d:
                            votes[assign[y]] = votes.get(assign[y], 0) + 1
                if votes:
                    to = max(votes, key=lambda q: (votes[q], -q))
                    for u in comp:
                        assign[u] = to
                    changed = True
        if not changed:
            break
    return assign


# ---------------------------------------------------------------- whole-county states

def polygon_graph(polys):
    """Rook adjacency (shared edge of at least 1 m) between polygons keyed by id."""
    import shapely
    keys = list(polys)
    geo = np.array([polys[c] for c in keys], dtype=object)
    tree = shapely.STRtree(geo)
    i, j = tree.query(geo, predicate="intersects")
    keep = i < j
    i, j = i[keep], j[keep]
    edge = shapely.length(shapely.intersection(geo[i], geo[j])) > 1e-3
    nb = {}
    for a, b in zip(i[edge], j[edge]):
        nb.setdefault(keys[a], set()).add(keys[b])
        nb.setdefault(keys[b], set()).add(keys[a])
    return nb


def whole_county_plan(county, p, k, bg_assigns, bg_county, nb, X=None):
    """Iowa / West Virginia: every county whole, districts as equal as possible.

    Each of the formula's candidate plans gives a starting point (each county
    to the district holding most of its block-group population); contiguity
    is repaired and border counties are moved or swapped to equalise
    population. The most equal result wins (ties: most compact, then the
    lowest candidate number), so the choice stays rule-based.
    """
    codes = np.unique(county)
    upop = {int(c): float(p[county == c].sum()) for c in codes}
    starts = []
    for bg_assign in bg_assigns:
        st = {}
        for c in codes:
            m = bg_county == c
            st[int(c)] = int(np.bincount(bg_assign[m], minlength=k).argmax()) if m.any() else 0
        starts.append(st)
    if X is not None:
        # The same power-diagram rule run on whole counties, at the 24 seed angles.
        from district import solve
        Xc = np.array([np.average(X[county == c], axis=0, weights=p[county == c] + 1e-9) for c in codes])
        pc = np.array([upop[int(c)] for c in codes])
        for s_ in range(24):
            _, _, ac = solve(Xc, pc, k, s_ * np.pi / 24)
            starts.append({int(c): int(d) for c, d in zip(codes, ac)})
    best = None
    for idx, start in enumerate(starts):
        if len(set(start.values())) < k:
            continue
        start = repair_components(start, nb, upop, k)
        plan = unit_local_search(start, upop, nb, k)
        lut = np.zeros(county.max() + 1, int)
        for c, d in plan.items():
            lut[c] = d
        a = lut[county]
        P = np.bincount(a, p, k)
        spread = 0.0
        if X is not None:
            for d in range(k):
                m = a == d
                cx = np.average(X[m], axis=0, weights=p[m] + 1e-9)
                spread += float(np.sum(p[m] * np.sum((X[m] - cx) ** 2, 1)))
        key = (P.max() - P.min(), spread, idx)
        if best is None or key < best[0]:
            best = (key, a)
    return best[1]


# ---------------------------------------------------------------- Ohio

OHIO_PROTECTED = {"P16000", "P15000"}     # Cleveland, Cincinnati: may not be split (§2(B)(4)(b))


def ohio_plan(b, p, k, a0, ei, ej, nbrs, finish, connected, X):
    """Ohio Const. art. XIX §2(B) on top of the formula.

    Phase A: counties are whole units, except counties larger than one
    district, whose precincts are units (Cleveland and Cincinnati whole).
    Border units move between districts to equalise population, never
    putting a large county in more than three districts.
    Phase B: settle the remaining imbalance along a spanning tree of district
    borders, splitting at most one other county per border (so two districts
    never share more than one county) by peeling blocks from the shared edge.
    A final block-level pass inside already-split counties finishes the job.
    """
    county = b.county.values
    target = p.sum() / k
    cpop = pd.Series(p).groupby(county).sum()
    big = set(cpop[cpop > target].index.tolist())
    muni = b.Mw.values
    key = np.where(np.isin(county, list(big)),
                   np.where(np.isin(muni, list(OHIO_PROTECTED)), "C" + b.cty3.values + "|" + muni,
                            "C" + b.cty3.values + "|" + b.V.values),
                   "C" + b.cty3.values)
    unit, ukeys = pd.factorize(key)
    upop = {u: float(v) for u, v in pd.Series(p).groupby(unit).sum().items()}
    ucounty = {u: int(c) for u, c in pd.Series(county).groupby(unit).first().items()}
    nb = unit_graph(unit, ei, ej)
    # start: each unit to the district holding most of its people in the formula plan
    tab = pd.DataFrame({"u": unit, "d": a0, "p": p}).groupby(["u", "d"])["p"].sum()
    start = {int(u): int(tab[u].idxmax()) for u in tab.index.get_level_values(0).unique()}
    start = repair_components(start, nb, upop, k)

    # Phase A with the "at most three districts per large county" limit.
    assign = dict(start)
    members = {d: set() for d in range(k)}
    pop = np.zeros(k)
    cd = {c: {} for c in big}            # large county -> {district: units}
    for u, d in assign.items():
        members[d].add(u)
        pop[d] += upop[u]
        if ucounty[u] in big:
            cd[ucounty[u]][d] = cd[ucounty[u]].get(d, 0) + 1
    border = lambda u: {assign[x] for x in nb.get(u, ()) if x in assign} - {assign[u]}
    # Unit population centres, for keeping districts compact while balancing.
    ux = pd.DataFrame({"u": unit, "x": X[:, 0] * p, "y": X[:, 1] * p, "p": p}).groupby("u").sum()
    upt = {u: (row.x / max(row.p, 1e-9), row.y / max(row.p, 1e-9)) for u, row in ux.iterrows()}
    for _ in range(6000):
        dev = pop - target
        cen = {}
        for d in range(k):
            w = sum(upop[u] for u in members[d]) or 1
            cen[d] = (sum(upt[u][0] * upop[u] for u in members[d]) / w, sum(upt[u][1] * upop[u] for u in members[d]) / w)
        best = None
        for u in sorted(assign):
            s_ = assign[u]
            for t in sorted(border(u)):
                pu = upop[u]
                gain = dev[s_] ** 2 + dev[t] ** 2 - (dev[s_] - pu) ** 2 - (dev[t] + pu) ** 2
                if gain <= 1e-9:
                    continue
                # Among improving moves, prefer the one that hurts compactness least.
                (x, y) = upt[u]
                dI = pu * ((x - cen[t][0]) ** 2 + (y - cen[t][1]) ** 2 - (x - cen[s_][0]) ** 2 - (y - cen[s_][1]) ** 2)
                if best and gain <= best[0][0]:
                    continue
                c = ucounty[u]
                if c in big:
                    ds = set(cd[c]) | {t}
                    if cd[c].get(s_, 0) == 1:
                        ds.discard(s_)
                    if len(ds) > 3:
                        continue
                if not connected_without(members[s_], {u}, nb):
                    continue
                best = ((gain, -dI), u, s_, t)
        if best is None:
            break
        _, u, s_, t = best
        assign[u] = t
        members[s_].discard(u)
        members[t].add(u)
        pop[s_] -= upop[u]
        pop[t] += upop[u]
        c = ucounty[u]
        if c in big:
            cd[c][s_] -= 1
            if cd[c][s_] == 0:
                del cd[c][s_]
            cd[c][t] = cd[c].get(t, 0) + 1
    lut = np.zeros(len(ukeys), int)
    for u, d in assign.items():
        lut[u] = d
    a = lut[unit]

    if __import__("os").environ.get("TRACE"):
        print("  ohio phase A dev:", np.round(np.bincount(a, p, k) - target).astype(int).tolist())
    # Phase B: one split county per district border, along a spanning tree.
    nbb = {}
    for x, y in zip(ei, ej):
        nbb.setdefault(x, []).append(y)
        nbb.setdefault(y, []).append(x)
    dev = np.bincount(a, p, k) - target
    du, dv = a[ei], a[ej]
    m = du != dv
    pairs = np.sort(np.column_stack([du[m], dv[m]]), axis=1)
    keys, counts = np.unique(pairs, axis=0, return_counts=True)
    parent = list(range(k))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    tree = {d: [] for d in range(k)}
    for (x, y), _ in sorted(zip(map(tuple, keys), counts), key=lambda t: (-t[1], t[0])):
        if find(x) != find(y):
            parent[find(x)] = find(y)
            tree[x].append(y)
            tree[y].append(x)
    order, par = [0], {0: None}
    for x in order:
        for y in sorted(tree[x]):
            if y not in par:
                par[y] = x
                order.append(y)
    sub = {x: dev[x] for x in order}
    for x in reversed(order[1:]):
        sub[par[x]] += sub[x]
    used = set()
    for x in reversed(order[1:]):
        s_ = sub[x]
        if abs(s_) < 0.5:
            continue
        src, dst = (x, par[x]) if s_ > 0 else (par[x], x)
        amount = abs(s_)
        # candidate counties: whole, not large, in src, touching dst
        front = ei[(a[ei] == src) & (a[ej] == dst)]
        front = np.concatenate([front, ej[(a[ej] == src) & (a[ei] == dst)]])
        cands = sorted({int(c) for c in county[front]} - big - used,
                       key=lambda c: (cpop[c] < amount * 1.5, cpop[c], c))
        # Borders that run only through a large county: move precincts inside
        # it (already split, so no new split), never through Cleveland/Cincinnati.
        cands += [c for c in sorted({int(c) for c in county[front]} & big)]
        for c in cands:
            ok_blocks = (county == c) & (a == src)
            if c in big:
                ok_blocks &= ~np.isin(muni, list(OHIO_PROTECTED))
            inside = set(np.flatnonzero(ok_blocks).tolist())
            starts = [blk for blk in inside if any(a[n] == dst for n in nbb.get(blk, []))]
            seq, seen, i = list(starts), set(starts), 0
            while i < len(seq):
                for n in nbb.get(seq[i], []):
                    if n in inside and n not in seen:
                        seen.add(n)
                        seq.append(n)
                i += 1
            cum = np.cumsum(p[seq])
            if not len(cum) or cum[-1] < amount * 0.98:
                continue
            L = int(np.argmin(np.abs(cum - amount))) + 1
            trial = a.copy()
            trial[seq[:L]] = dst
            # Pockets of src left enclosed by the peel join dst if small.
            src_blocks = np.flatnonzero(trial == src)
            outside = src_blocks[county[src_blocks] != c]
            seed = int(outside[0]) if len(outside) else int(src_blocks[0])
            reach, q = {seed}, deque([seed])
            while q:
                x = q.popleft()
                for y in nbb.get(x, []):
                    if trial[y] == src and y not in reach:
                        reach.add(y)
                        q.append(y)
            pockets = np.array([x for x in src_blocks if x not in reach], dtype=int)
            if p[pockets].sum() <= 0.02 * amount + 50:
                trial[pockets] = dst
                a = trial
                if c not in big:
                    used.add(c)
                break
    # Final block moves only inside counties that are already split, never in
    # Cleveland or Cincinnati, so no new county splits are created.
    split_c = {int(c) for c, n in pd.DataFrame({"c": county, "d": a})[p > 0].groupby("c")["d"].nunique().items() if n > 1}
    free = np.isin(county, list(split_c)) & ~np.isin(muni, list(OHIO_PROTECTED))
    return a, free, sorted(split_c)
