"""Block-level refinement: turn each state's chosen county-level plan into a legal plan.

build.py decides which counties stay whole. Inside the counties it had to
split, this stage applies the same keep-whole rule one level at a time:

    municipality  >  precinct (VTD)  >  census block

Every municipality and precinct starts whole, assigned to the district that
holds most of its people under the plan's power rule. While populations are
unequal, the rule releases one unit next to the worst district -- a precinct
before a municipality -- and its pieces then follow the power rule block by
block. A last pass moves single boundary blocks between neighbouring
districts, never breaking contiguity, until no move makes populations more
equal. Every district line therefore runs along a county, municipal,
precinct or census-block boundary: features on the ground.

Usage: python refine.py [STATE ...]     (default: all 50)
Writes data/build/refined/XX.pkl
"""

import os
TRACE = os.environ.get("TRACE")
import pickle
import sys
import time
from collections import deque
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache

import numpy as np
import pandas as pd
import pyogrio
import shapely
from pyproj import Transformer

from blocks import load_blocks
from district import assign, balance, polish
from geometry import counties as county_polys, parts, project, states_with_water
from load import RAW, block_groups
from states import BY_ABBR, STATES

BUILD = RAW.parent / "build"
OUT = BUILD / "refined"
TOL_REL = 0.003      # keep units whole until within 0.3%; boundary transfers do the rest


# ---------------------------------------------------------------- refinement

def group_shares(g, a, p, G, k):
    return np.bincount(g * k + a, p, G * k).reshape(G, k)


def border_unit(X, C, w, j, g, eligible):
    """Eligible unit nearest the border of district j (smallest power margin)."""
    m = eligible[g]
    if not m.any():
        return None
    S = X[m] @ (-2.0 * C.T) + (np.sum(C * C, axis=1) - w)
    two = np.argpartition(S, 1, axis=1)[:, :2]
    r = np.arange(len(S))
    s0, s1 = S[r, two[:, 0]], S[r, two[:, 1]]
    best = np.where(s0 <= s1, two[:, 0], two[:, 1])
    second = np.where(s0 <= s1, two[:, 1], two[:, 0])
    touch = (best == j) | (second == j)
    if not touch.any():
        return None
    gap = np.abs(s1 - s0)[touch]
    gg = g[m][touch]
    order = np.lexsort((gg, gap))
    return int(gg[order[0]])


def centroids(g, n, X, p):
    """Population-weighted centre of each unit (plain mean if it has no residents)."""
    wsum = np.bincount(g, p, n)
    cnt = np.maximum(np.bincount(g, None, n), 1)
    cx = np.where(wsum > 0, np.bincount(g, p * X[:, 0], n) / np.maximum(wsum, 1e-9), np.bincount(g, X[:, 0], n) / cnt)
    cy = np.where(wsum > 0, np.bincount(g, p * X[:, 1], n) / np.maximum(wsum, 1e-9), np.bincount(g, X[:, 1], n) / cnt)
    return np.column_stack([cx, cy])


def tiered_release(X, p, k, C, w, lock, A, B, is_city):
    """Keep municipalities, then precincts, whole; release one at a time.

    A whole unit takes part in the power rule as a single point at its
    population centre, so it lands wholly on one side of every line.
    Returns weights, the block assignment, the mask of blocks that follow
    the rule individually (released precincts), and the release log.
    """
    target = p.sum() / k
    F = lock < 0
    nA, nB = A.max() + 1, B.max() + 1
    popA = np.bincount(A[F], p[F], nA)
    popB = np.bincount(B[F], p[F], nB)
    cA = centroids(A[F], nA, X[F], p[F])
    cB = centroids(B[F], nB, X[F], p[F])
    city_whole = is_city & (popA <= target)
    b_whole = popB <= target
    BofA = np.zeros(nB, int)
    BofA[B[F]] = A[F]
    fixed_pop = np.bincount(lock[~F], p[~F], k)
    released = []
    even = lambda s: -np.sort(s, axis=1)[:, -2] / np.maximum(s.sum(1), 1)
    while True:
        cw = F & is_city[A] & city_whole[A]
        bw = F & ~cw & b_whole[B]
        fr = F & ~cw & ~bw
        uA, uB = np.unique(A[cw]), np.unique(B[bw])
        Xa = np.vstack([cA[uA], cB[uB], X[fr]])
        pa = np.concatenate([popA[uA], popB[uB], p[fr]])
        none = np.zeros(len(Xa), bool)
        w, _ = balance(Xa, pa, C, w, target, fixed_pop, none, tol=TOL_REL * 0.9, max_iter=1500)
        w = polish(Xa, pa, C, w, target, fixed_pop, none, max_moves=1500)
        aa = assign(Xa, C, w)
        lutA = np.full(nA, -1)
        lutA[uA] = aa[:len(uA)]
        lutB = np.full(nB, -1)
        lutB[uB] = aa[len(uA):len(uA) + len(uB)]
        lab = lock.copy()
        lab[cw] = lutA[A[cw]]
        lab[bw] = lutB[B[bw]]
        lab[fr] = aa[len(uA) + len(uB):]
        dev = np.bincount(lab, p, k) - target
        if np.abs(dev).max() <= TOL_REL * target:
            break
        a_pow = assign(X[F], C, w)
        sA = group_shares(A[F], a_pow, p[F], nA, k)
        sB = group_shares(B[F], a_pow, p[F], nB, k)
        eligB = b_whole & ~(is_city[BofA] & city_whole[BofA]) & (popB > 0)
        choice = None
        # Phase 1 opens municipalities into whole precincts; splitting a
        # precinct is left to the boundary transfers unless nothing else works.
        for j in np.argsort(-np.abs(dev)):
            candA = np.flatnonzero(city_whole & ((sA > 0).sum(1) > 1) & (sA[:, j] > 0))
            if len(candA):
                choice = ("A", int(candA[np.lexsort((candA, even(sA[candA])))[0]]))
                break
            u = border_unit(X[F], C, w, j, A[F], city_whole)
            if u is not None:
                choice = ("A", u)
                break
        if choice is None:
            for j in np.argsort(-np.abs(dev)):
                cand = np.flatnonzero(eligB & ((sB > 0).sum(1) > 1) & (sB[:, j] > 0))
                if len(cand):
                    choice = ("B", int(cand[np.lexsort((cand, even(sB[cand])))[0]]))
                    break
                u = border_unit(X[F], C, w, j, B[F], eligB)
                if u is not None:
                    choice = ("B", u)
                    break
        if choice is None:
            break
        released.append(choice)
        if choice[0] == "B":
            b_whole[choice[1]] = False
        else:
            city_whole[choice[1]] = False
    return w, lab, fr, released


# ---------------------------------------------------------------- boundary transfers

def transfer_balance(a, p, k, ei, ej, unit, muni, county):
    """Equalise populations with the fewest split precincts.

    Settle each district's surplus along a maximum-shared-boundary spanning
    tree of the district adjacency graph (leaves first). Across each tree
    edge, move whole precincts that touch the neighbour (preferring ones that
    split no municipality), then peel blocks off a single precinct, starting
    at the shared edge, for the remainder. `ei, ej` are block adjacency pairs.
    """
    target = p.sum() / k
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
    nb = {}
    for u, v in zip(ei, ej):
        nb.setdefault(u, []).append(v)
        nb.setdefault(v, []).append(u)
    seen = set()
    for root in range(k):
        if root in seen:
            continue
        order, par = [root], {root: None}
        seen.add(root)
        for x in order:
            for y in sorted(tree[x]):
                if y not in seen:
                    seen.add(y)
                    par[y] = x
                    order.append(y)
        sub = {x: dev[x] for x in order}
        for x in reversed(order[1:]):
            sub[par[x]] += sub[x]
        for x in reversed(order[1:]):
            s = sub[x]
            if abs(s) >= 0.5:
                src, dst = (x, par[x]) if s > 0 else (par[x], x)
                move_people(a, p, abs(s), src, dst, ei, ej, nb, unit, muni, county)
    return a


def move_people(a, p, amount, src, dst, ei, ej, nb, unit, muni, county):
    remaining = amount
    for _ in range(200):
        if remaining < 0.5:
            return
        front = ei[(a[ei] == src) & (a[ej] == dst)]
        front = np.unique(np.concatenate([front, ej[(a[ej] == src) & (a[ei] == dst)]]))
        if not len(front):
            return
        units = np.unique(unit[front])
        info = []
        for u in units:
            blocks = np.flatnonzero((unit == u) & (a == src))
            pu = p[blocks].sum()
            mu, cu = muni[blocks[0]], county[blocks[0]]
            new_cty = len(np.unique(a[county == cu])) == 1
            splits_muni = mu >= 0 and len(np.unique(a[muni == mu])) == 1
            info.append((u, blocks, pu, (new_cty, splits_muni)))
        whole = sorted([t for t in info if 0 < t[2] <= remaining], key=lambda t: (t[3], -t[2], t[0]))
        moved = False
        for u, blocks, pu, _ in whole:
            if locally_connected(None, src, a, nb, removed=set(blocks.tolist())):
                a[blocks] = dst
                remaining -= pu
                moved = True
                break
        if moved:
            continue
        big = [t for t in info if t[2] > remaining]
        if not big:
            return
        already = lambda t: len(np.unique(a[unit == t[0]])) > 1
        big.sort(key=lambda t: (t[3], not already(t), t[2], t[0]))
        for u, blocks, pu, _ in big:
            if peel(a, p, u, blocks, remaining, src, dst, nb, unit) is not None:
                return
        return


def peel(a, p, u, blocks, remaining, src, dst, nb, unit):
    """Move a contiguous chunk of precinct u, grown from its edge with dst,
    holding as close to `remaining` people as possible, if src stays connected."""
    if True:
        inside = set(blocks.tolist())
        start = [b for b in blocks if any(a[n] == dst for n in nb.get(b, []))]
        seq, seen, i = list(start), set(start), 0
        while i < len(seq):
            for n in nb.get(seq[i], []):
                if n in inside and n not in seen:
                    seen.add(n)
                    seq.append(n)
            i += 1
        cum = np.cumsum(p[seq])
        L = int(np.argmin(np.abs(cum - remaining))) + 1
        if not locally_connected(None, src, a, nb, removed=set(seq[:L])):
            return None
        a[seq[:L]] = dst
        remaining -= cum[L - 1]
        # Fine-tune within the same precinct: add a src block touching the
        # peeled area, or hand back a peeled block touching src.
        unitset = set(np.flatnonzero(unit == u).tolist())
        for _ in range(500):
            if abs(remaining) < 0.5:
                break
            best = (abs(remaining), None, None)
            for bk in unitset:
                if a[bk] == src and remaining > 0 and any(a[n] == dst for n in nb.get(bk, [])):
                    r2 = abs(remaining - p[bk])
                    if r2 < best[0] - 1e-9:
                        best = (r2, bk, dst)
                elif a[bk] == dst and remaining < 0 and any(a[n] == src for n in nb.get(bk, [])):
                    r2 = abs(remaining + p[bk])
                    if r2 < best[0] - 1e-9:
                        best = (r2, bk, src)
            if best[1] is None:
                break
            bk, to = best[1], best[2]
            frm = a[bk]
            if not locally_connected(bk, frm, a, nb):
                break
            remaining += p[bk] if to == src else -p[bk]
            a[bk] = to
        return remaining


# ---------------------------------------------------------------- geometry & contiguity

def adjacency(polys):
    """Rook adjacency (shared edge, not just a corner) among polygons."""
    tree = shapely.STRtree(polys)
    i, j = tree.query(polys, predicate="intersects")
    keep = i < j
    i, j = i[keep], j[keep]
    inter = shapely.intersection(polys[i], polys[j])
    edge = shapely.length(inter) > 1e-3       # at least 1 m of shared edge
    return i[edge], j[edge]


def finish(a, p, k, free, ei, ej, nbrs, units, max_moves=3000, hard=()):
    """Move boundary blocks between neighbouring districts to exact equality.

    Stops when the largest and smallest districts differ by at most one
    person. Each step takes, among block moves that lower the sum of squared
    deviations, the one creating the fewest new splits of precincts and
    municipalities (`units`: list of per-block unit ids, -1 = none), then the
    largest gain. If no single move helps, the best two-step chain
    (u -> v, v -> w) is used. Blocks move only if `free` and if the source
    district stays locally connected around them.
    """
    n = len(free)
    target = p[:n].sum() / k
    dev = np.bincount(a, p, k) - target
    # Per unit and district: [blocks, people]. A move costs one for every new
    # split it creates and one for every precinct piece of 1-99 residents it
    # leaves behind (too small for a secret ballot).
    cnt = []
    for g in units:
        c = {}
        for x in np.flatnonzero(free & (g[:n] >= 0)):
            e = c.setdefault(g[x], {}).setdefault(a[x], [0, 0.0])
            e[0] += 1
            e[1] += p[x]
        cnt.append(c)
    sliver = lambda q: 1 <= q <= 99

    weight = [1, 1, 3]

    def dsplit(x, s, d):
        delta = 0
        for kind, (g, c) in enumerate(zip(units, cnt)):
            u = g[x] if x < n else -1
            if u < 0 or u not in c:
                continue
            cu = c[u]
            before = len(cu) > 1
            left = cu[s][0] - 1 if s in cu else 0
            after = len(cu) - (1 if left == 0 else 0) + (0 if d in cu else 1) > 1
            delta += weight[kind] * (int(after) - int(before))
            if kind == 0:
                ps, pd_ = cu[s][1] if s in cu else 0, cu[d][1] if d in cu else 0
                before_s = sum(sliver(v[1]) for v in cu.values()) if len(cu) > 1 else 0
                new = {k2: v[1] for k2, v in cu.items()}
                new[s] = ps - p[x]
                new[d] = pd_ + p[x]
                new = {k2: v for k2, v in new.items() if v > 0 or (k2 == s and left > 0) or k2 == d}
                after_s = sum(sliver(v) for v in new.values()) if len(new) > 1 else 0
                delta += after_s - before_s
        return delta

    def apply(x, s, d):
        for g, c in zip(units, cnt):
            u = g[x] if x < n else -1
            if u < 0 or u not in c:
                continue
            cu = c[u]
            cu[s][0] -= 1
            cu[s][1] -= p[x]
            if cu[s][0] == 0:
                del cu[s]
            e = cu.setdefault(d, [0, 0.0])
            e[0] += 1
            e[1] += p[x]
        a[x] = d
        dev[s] -= p[x]
        dev[d] += p[x]

    for _ in range(max_moves):
        if dev.max() - dev.min() <= 1 + 1e-9:
            break
        m = a[ei] != a[ej]
        blk = np.concatenate([ei[m], ej[m]])
        dst = np.concatenate([a[ej[m]], a[ei[m]]])
        sel = (blk < n) & (p[blk] > 0)
        sel[sel] = free[blk[sel]]
        blk, dst = blk[sel], dst[sel]
        if not len(blk):
            break
        key = np.unique(np.column_stack([blk, dst]), axis=0)
        blk, dst = key[:, 0], key[:, 1]
        src = a[blk]
        pb = p[blk]
        gain = dev[src] ** 2 + dev[dst] ** 2 - (dev[src] - pb) ** 2 - (dev[dst] + pb) ** 2
        good = np.flatnonzero(gain > 1e-9)
        if len(good) and hard:
            # Hard state-law constraint: a block may only join a district already
            # present in its unit (e.g. Ohio counties), so no new split appears.
            def allowed(t):
                x, d = blk[t], dst[t]
                for kind in hard:
                    g, c = units[kind], cnt[kind]
                    u = g[x] if x < n else -1
                    if u >= 0 and u in c and d not in c[u]:
                        return False
                return True
            good = np.array([t for t in good if allowed(t)], dtype=int)
        if len(good):
            ds = np.array([dsplit(blk[t], src[t], dst[t]) for t in good])
            done = False
            for t in good[np.lexsort((blk[good], -gain[good], ds))]:
                if locally_connected(blk[t], src[t], a, nbrs):
                    apply(blk[t], src[t], dst[t])
                    done = True
                    break
            if done:
                continue
        # Two-step chains: x moves u->v, y moves v->w.
        lim = 2 * np.abs(dev).max() + 1
        hot = set(np.argsort(-dev)[:3]) | set(np.argsort(dev)[:3])
        groups = {}
        for t in np.flatnonzero(pb <= lim):
            g = groups.setdefault((src[t], dst[t]), {})
            if len(g) < 12 or pb[t] in g:
                g.setdefault(pb[t], []).append(t)
        options = []
        base = (dev ** 2).sum()
        for (u, v), gx in groups.items():
            for (v2, w), gy in groups.items():
                if v2 != v or (u not in hot and w not in hot):
                    continue
                for px in gx:
                    for py in gy:
                        d = dev.copy()
                        d[u] -= px
                        d[v] += px - py
                        d[w] += py
                        g = base - (d ** 2).sum()
                        if g > 1e-9:
                            options.append((g, gx[px], gy[py], u, v, w))
        options.sort(key=lambda o: -o[0])
        if hard:
            options = []                    # chains could break the hard constraint
        done = False
        for g, xs, ys, u, v, w in options[:50]:
            pairs = [(tx, ty) for tx in xs for ty in ys if blk[tx] != blk[ty]]
            pairs.sort(key=lambda q: (dsplit(blk[q[0]], u, v) + dsplit(blk[q[1]], v, w), blk[q[0]], blk[q[1]]))
            for tx, ty in pairs:
                if locally_connected(blk[tx], u, a, nbrs) and locally_connected(blk[ty], v, a, nbrs):
                    apply(blk[tx], u, v)
                    apply(blk[ty], v, w)
                    done = True
                    break
            if done:
                break
        if not done:
            if TRACE:
                okc = sum(locally_connected(blk[t], src[t], a, nbrs) for t in good) if len(good) else 0
                print(f"    finish stuck: dev={np.round(dev, 1).tolist()} singles={len(good)} pass_guard={okc} chains={len(options)}")
            break
    return a


def locally_connected(i, d, a, nbrs, limit=400000, removed=None):
    """Would district d stay connected if block i left it?

    Breadth-first searches start from each of i's neighbours in d at once
    and merge when they meet. If one group of searches runs out of blocks
    before meeting the rest, removing i would cut d in two. This is exact
    (up to `limit` steps); the smaller side is always explored first.
    """
    gone = removed if removed is not None else {i}
    border = [x for g in gone for x in nbrs.get(g, [])] if removed is not None else nbrs.get(i, [])
    same = list(dict.fromkeys(x for x in border if a[x] == d and x not in gone))
    if not same:
        return removed is not None
    if len(same) == 1:
        return True
    m = len(same)
    parent = list(range(m))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    owner = {g: -1 for g in gone}
    for t, s0 in enumerate(same):
        owner[s0] = t
    queues = [deque([s0]) for s0 in same]
    groups, steps = m, 0
    while groups > 1:
        alive = {}
        for t in range(m):
            root = find(t)
            alive[root] = alive.get(root, False) or bool(queues[t])
        if not all(alive.values()):
            return False
        for t in range(m):
            q = queues[t]
            if not q:
                continue
            u = q.popleft()
            steps += 1
            for v in nbrs.get(u, []):
                if a[v] != d:
                    continue
                o = owner.get(v)
                if o is None:
                    owner[v] = t
                    q.append(v)
                elif o >= 0:
                    ra, rb = find(t), find(o)
                    if ra != rb:
                        parent[ra] = rb
                        groups -= 1
        if steps > limit:
            return True
    return True


def graph_fragments(a, nodes, nbrs, weight):
    """Pieces cut off from their district's main body, on the adjacency graph.

    Landmasses are the connected components of the whole graph (islands are
    allowed to differ). Within each landmass a district keeps its heaviest
    component (whole counties weigh most); every other component is a
    fragment, returned with the district most of its outside neighbours use.
    """
    land = {}
    for s in nodes:
        if s in land:
            continue
        land[s] = s
        stack = [s]
        while stack:
            u = stack.pop()
            for v in nbrs.get(u, []):
                if v not in land:
                    land[v] = s
                    stack.append(v)
    comp, out = {}, []
    groups = {}
    for s in nodes:
        if s in comp:
            continue
        comp[s] = s
        members, stack = [s], [s]
        while stack:
            u = stack.pop()
            for v in nbrs.get(u, []):
                if v not in comp and a[v] == a[s]:
                    comp[v] = s
                    members.append(v)
                    stack.append(v)
        groups.setdefault((a[s], land[s]), []).append(members)
    for (d, _), comps in groups.items():
        if len(comps) < 2:
            continue
        comps.sort(key=lambda m: -sum(weight[x] for x in m))
        for m in comps[1:]:
            ms = set(m)
            votes = {}
            for u in m:
                for v in nbrs.get(u, []):
                    if v not in ms and a[v] != d:
                        votes[a[v]] = votes.get(a[v], 0) + 1
            if votes:
                out.append((m, max(votes, key=lambda q: (votes[q], -q))))
    return out


def fragments(geoms, state):
    """(district, piece) for every piece cut off from its district's main body on one landmass."""
    out = []
    for comp in parts(state):
        for d, g in enumerate(geoms):
            pieces = [q for q in parts(g.intersection(comp)) if q.area > 1e-9]
            if len(pieces) > 1:
                pieces.sort(key=lambda q: -q.area)
                out += [(d, q) for q in pieces[1:]]
    return out


# ---------------------------------------------------------------- main

def free_region(F, wkb, fwd, cpolys, whole, n):
    """Projected polygons and rook adjacency for the blocks of split counties.

    Blocks touching a whole county are linked to a 'ghost' node standing for
    that county (index n + position in `whole`), so moves can see its district.
    """
    polysF = project(shapely.from_wkb(wkb[F]), fwd)
    idxF = np.flatnonzero(F)
    i, j = adjacency(polysF)
    nbrs = {}
    for u, v in zip(idxF[i], idxF[j]):
        nbrs.setdefault(u, []).append(v)
        nbrs.setdefault(v, []).append(u)
    cgeo = [cpolys[cty] for cty, _ in whole]
    if cgeo:
        # Whole counties that share a border connect to each other directly.
        ct = shapely.STRtree(cgeo)
        ca, cb = ct.query(np.array(cgeo, dtype=object), predicate="intersects")
        keep = ca < cb
        ca, cb = ca[keep], cb[keep]
        edge = shapely.length(shapely.intersection(np.array(cgeo, dtype=object)[ca], np.array(cgeo, dtype=object)[cb])) > 1e-3
        for x, y in zip(ca[edge], cb[edge]):
            nbrs.setdefault(n + x, []).append(n + y)
            nbrs.setdefault(n + y, []).append(n + x)
        tree = shapely.STRtree(cgeo)
        bi, ci = tree.query(polysF, predicate="intersects")
        inter = shapely.intersection(polysF[bi], np.array(cgeo, dtype=object)[ci])
        ok = shapely.length(inter) > 1e-3
        for u, cc in zip(idxF[bi[ok]], ci[ok]):
            nbrs.setdefault(u, []).append(n + cc)
            nbrs.setdefault(n + cc, []).append(u)
    return polysF, idxF, i, j, nbrs


def border_counties(jw, a, whole, nbrs, n):
    """Whole counties on the border of district jw, with their contact counts:
    a county of jw that touches another district (block or county), or a
    county of another district that touches jw."""
    items = list(whole.items())
    label = lambda x: a[x] if x < n else items[x - n][1]
    contact = {}
    for u, vs in nbrs.items():
        for v in vs:
            if v < n:
                continue
            cty, dc = items[v - n]
            lu = label(u)
            if (dc == jw and lu != jw) or (dc != jw and lu == jw):
                contact[cty] = contact.get(cty, 0) + 1
    return contact


def refine_state(abbr, drop=()):
    t0 = time.time()
    fips, _, name, k = BY_ABBR[abbr]
    res = pickle.load(open(BUILD / f"{abbr}.pkl", "rb"))
    c = res["cands"][res["chosen"]]
    b, wkb, has_vtd = load_blocks(fips, abbr, geometry=True)
    fwd = Transformer.from_crs("EPSG:4326", res["proj"], always_xy=True)
    X = np.column_stack(fwd.transform(b.lon.values, b.lat.values))
    p = b["pop"].values
    n = len(b)
    county = b.county.values
    water = project(states_with_water()[fips], fwd)
    released, frag_moves = [], 0

    if k == 1:
        a = np.zeros(n, int)
    else:
        C, w0 = c["C"], c["w"].copy()
        target = p.sum() / k
        whole = dict(c["whole"])
        for cty in drop:            # released by an earlier pass that could not balance
            del whole[cty]
            released.append(("C", int(cty)))
        frag_lock = np.full(n, -1)
        for f, d in c["fragments"]:
            frag_lock[shapely.contains_xy(shapely.from_wkb(f), X[:, 0], X[:, 1])] = d
        A, A_keys = pd.factorize(b.A)
        B, _ = pd.factorize(b.B)
        is_city = np.array([("|P" in s) or ("|T" in s) for s in A_keys])
        Bf = B
        Mf = np.where(is_city[A], A, -1)
        cpolys = county_polys(fips, fwd, water=True)
        cty64 = county.astype(np.int64)

        # Phase 1 and boundary transfers. If some district cannot be brought
        # within 100 people because its border runs along whole counties,
        # release the whole county nearest that district's border (one more
        # county split, made only because equality requires it) and redo.
        for attempt in range(12):
            lut = np.full(county.max() + 1, -1)
            for cty, d in whole.items():
                lut[cty] = d
            lock = np.where(frag_lock >= 0, frag_lock, lut[county])
            F = lock < 0
            w, a, _, rel = tiered_release(X, p, k, C, w0.copy(), lock, A, B, is_city)
            trace("phase1", a, b, p, k)
            polysF, idxF, i, j, nbrs = free_region(F, wkb, fwd, cpolys, list(whole.items()), n)
            # Enclaves left by placing whole units at their centres: hand each
            # cut-off piece to its surrounding district before balancing.
            items0 = list(whole.items())
            a_tmp = np.concatenate([a, [d for _, d in items0]])
            cpop0 = np.bincount(county, p, county.max() + 1)
            w0t = np.concatenate([p, [1e12 + cpop0[cty] for cty, _ in items0]])
            nodes0 = list(np.flatnonzero(F)) + [n + t for t in range(len(items0))]
            for _r in range(6):
                fr0 = graph_fragments(a_tmp, nodes0, nbrs, w0t)
                if not fr0:
                    break
                for m, to in fr0:
                    for x in m:
                        if x < n:
                            a_tmp[x] = to
                            frag_moves += 1
            a = a_tmp[:n].copy()
            for _sweep in range(2):
                a = transfer_balance(a, p, k, idxF[i], idxF[j], Bf, Mf, county)
            trace("transfers", a, b, p, k)
            dev = np.bincount(a, p, k) - target
            whole_used = dict(whole)
            if np.abs(dev).max() <= 100 or not whole:
                break
            jw = int(np.argmax(np.abs(dev)))
            contact = border_counties(jw, a, whole, nbrs, n)
            if not contact:
                break
            pick = max(contact, key=lambda q: (contact[q], -q))
            del whole[pick]
            released.append(("C", int(pick)))
        released += rel
        whole = whole_used          # the county set the adjacency graph was built for

        whole_items = list(whole.items())
        a_ext = np.concatenate([a, [d for _, d in whole_items]])
        p_ext = np.concatenate([p, np.zeros(len(whole_items))])
        eu = np.array([u for u, vs in nbrs.items() for v in vs if u < v], dtype=np.int64)
        ev = np.array([v for u, vs in nbrs.items() for v in vs if u < v], dtype=np.int64)
        nodes = list(idxF) + [n + t for t in range(len(whole_items))]
        cpop = np.bincount(county, p, county.max() + 1)
        weight = np.concatenate([p, [1e12 + cpop[cty] for cty, _ in whole_items]])
        for rnd in range(10):
            if rnd > 0 and np.abs(np.bincount(a_ext[:n], p, k) - target).max() > 100:
                # A contiguity repair moved many people: settle it along borders again.
                for _sweep in range(2):
                    a_ext[:n] = transfer_balance(a_ext[:n].copy(), p, k, idxF[i], idxF[j], Bf, Mf, county)
            a_ext = finish(a_ext, p_ext, k, F, eu, ev, nbrs, [Bf, Mf, cty64])
            a = a_ext[:n]
            trace("finish", a, b, p, k)
            fr = graph_fragments(a_ext, nodes, nbrs, weight)
            if TRACE:
                for m, to in fr:
                    print(f"    fragment blocks={len(m)} pop={sum(p_ext[x] for x in m):.0f} -> {to}")
            if not fr:
                break
            for m, to in fr:
                for x in m:
                    if x < n:
                        a_ext[x] = to
                        frag_moves += 1
        else:
            # Repairs ran out of rounds: one last guarded finish to rebalance.
            a_ext = finish(a_ext, p_ext, k, F, eu, ev, nbrs, [Bf, Mf, cty64])
        a = a_ext[:n]

        # Final check on the true geometry, exactly as score.py validates it:
        # the union of each district's blocks must be one piece per landmass,
        # and a corner-only touch counts as two pieces.
        polys_all = project(shapely.from_wkb(wkb), fwd)
        frozen = np.zeros(n, bool)
        rounds = 6
        for _g in range(rounds):
            geoms = [shapely.coverage_union_all(polys_all[a == d]) for d in range(k)]
            fr = fragments(geoms, water)
            if not fr:
                break
            for d, piece in fr:
                inside = np.flatnonzero(shapely.contains_xy(piece, X[:, 0], X[:, 1]) & (a == d))
                if not len(inside):
                    continue
                halo = piece.buffer(0.01)
                shared = [halo.intersection(g).area if m != d else -1 for m, g in enumerate(geoms)]
                a_ext[inside] = int(np.argmax(shared))
                frozen[inside] = True
                frag_moves += len(inside)
            if _g < rounds - 1:
                # Rebalance, but never move a repaired block back: contiguity
                # on the true geometry takes priority over the last few people.
                a_ext = finish(a_ext, p_ext, k, F & ~frozen, eu, ev, nbrs, [Bf, Mf, cty64])
            a = a_ext[:n]

    if k > 1 and len(drop) < 12:
        # A district still more than 100 people off is walled in by whole
        # counties: release the whole county with the longest border on the
        # district furthest off that has one, and refine the state again.
        dev = np.bincount(a, p, k) - p.sum() / k
        for jw in np.argsort(-np.abs(dev), kind="stable"):
            if abs(dev[jw]) <= 100:
                break
            contact = border_counties(jw, a_ext, whole, nbrs, n)
            if contact:
                pick = max(contact, key=lambda q: (contact[q], -q))
                print(f"  {abbr}: district {jw + 1} is {dev[jw]:+.0f} people off; releasing county {pick}", flush=True)
                return refine_state(abbr, drop + (pick,))

    out = dict(abbr=abbr, fips=fips, k=k, GEOID=b.GEOID.values, assign=a.astype(np.int16),
               released=released, frag_moves=frag_moves, has_vtd=has_vtd, secs=time.time() - t0)
    target = p.sum() / k
    P = np.bincount(a, p, k)

    def nsplit(key):
        g = pd.DataFrame({"g": key, "d": a})[(key != "") & (p > 0)]
        return int((g.groupby("g")["d"].nunique() > 1).sum())
    out["splits"] = dict(county=nsplit(b.cty3.values), muni=nsplit(b.Mw.values), precinct=nsplit(b.V.values))
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / f"{abbr}.pkl", "wb") as f:
        pickle.dump(out, f)
    print(f"{abbr} k={k} splits={out['splits']} range={P.max() - P.min():.0f} maxdev={np.abs(P - target).max():.1f} people "
          f"released={len(released)} fragmoves={frag_moves} {time.time() - t0:.0f}s", flush=True)


def split_mask(key, a):
    """Blocks whose unit (key >= 0) spans more than one district."""
    m = key >= 0
    d = pd.DataFrame({"g": key[m], "d": a[m]}).groupby("g")["d"].nunique()
    out = np.zeros(len(a), bool)
    out[m] = np.isin(key[m], d[d > 1].index.values)
    return out


def trace(stage, a, b, p, k):
    if not TRACE:
        return
    def nsplit(key):
        g = pd.DataFrame({"g": key, "d": a})[(key != "") & (p > 0)]
        return int((g.groupby("g")["d"].nunique() > 1).sum())
    dev = np.bincount(a, p, k) - p.sum() / k
    print(f"  [{stage}] muni={nsplit(b.Mw.values)} prec={nsplit(b.V.values)} maxdev={np.abs(dev).max():.1f}")


def district_geoms_blocks(a, F, polysF, idxF, cpolys, whole, k):
    bits = [[] for _ in range(k)]
    for cty, d in whole.items():
        bits[d].append(cpolys[cty])
    aF = a[idxF]
    for d in range(k):
        sel = polysF[aF == d]
        if len(sel):
            bits[d].append(shapely.union_all(sel))
    return [shapely.union_all(x) if x else shapely.Polygon() for x in bits]


if __name__ == "__main__":
    todo = sys.argv[1:] or [s[1] for s in sorted(STATES, key=lambda s: -s[3])]
    with ProcessPoolExecutor(max_workers=int(os.environ.get("WORKERS", 3))) as pool:
        list(pool.map(refine_state, todo))
