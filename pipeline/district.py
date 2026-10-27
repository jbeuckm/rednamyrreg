"""Balanced centroidal power-diagram districting.

A plan for a state with k seats is fully described by k centers c_j and k
weights w_j. A location x belongs to district

    argmin_j  |x - c_j|^2 - w_j

so every district is a convex polygon (a "power cell") clipped to the state.
The centers are the population centroids of their districts and the weights
are chosen so every district has the same population. This is the
population-weighted moment-of-inertia objective of Hess et al. (1965), solved
in the form described by Cohen-Addad, Klein & Young (2018).

For fixed centers, the weights are the dual variables of the transportation
problem "send each person to a center, each center receives exactly 1/k of the
population, minimise total squared distance". So the weights are a published
certificate: anyone can check that the assignment is optimal for those centers.
"""

import numpy as np


def seed_centers(X, p, k, theta):
    """Deterministic seeds by recursive population bisection.

    Split the population with a line at angle `theta` in the ratio
    floor(k/2):ceil(k/2), recurse on each side with the perpendicular angle,
    and return the population centroid of each leaf.
    """
    out = []

    def rec(idx, m, ang):
        if m == 1:
            out.append(np.average(X[idx], axis=0, weights=p[idx] + 1e-9))
            return
        m1 = m // 2
        u = np.array([np.cos(ang), np.sin(ang)])
        order = idx[np.argsort(X[idx] @ u, kind="stable")]
        cum = np.cumsum(p[order])
        cut = np.searchsorted(cum, cum[-1] * m1 / m)
        cut = min(max(cut, 1), len(order) - 1)
        rec(order[:cut], m1, ang + np.pi / 2)
        rec(order[cut:], m - m1, ang + np.pi / 2)

    rec(np.arange(len(X)), k, theta)
    return np.array(out)


def assign(X, C, w):
    """Power-diagram assignment: argmin_j |x-c_j|^2 - w_j (|x|^2 drops out)."""
    score = X @ (-2.0 * C.T) + (np.sum(C * C, axis=1) - w)
    return np.argmin(score, axis=1)


def balance(X, p, C, w, target, fixed_pop=None, fixed_mask=None,
            tol=0.0005, max_iter=600):
    """Find weights that equalise district populations (Rprop on the dual).

    Points in `fixed_mask` are already locked to a district (contiguity
    repairs) and contribute `fixed_pop` instead of moving with the weights.
    Returns the best weights found, the assignment, and district populations.
    """
    k = len(C)
    free = np.ones(len(X), bool) if fixed_mask is None else ~fixed_mask
    Xf, pf = X[free], p[free]
    base = np.zeros(k) if fixed_pop is None else fixed_pop
    w = w.copy()
    step = np.full(k, max(1.0, 1e-3 * np.median(np.sum((Xf - Xf.mean(0)) ** 2, 1))))
    prev = np.zeros(k)
    best, since = (np.inf, w.copy()), 0
    for _ in range(max_iter):
        a = assign(Xf, C, w)
        P = base + np.bincount(a, pf, k)
        g = (target - P) / target
        dev = np.abs(g).max()
        if dev < best[0]:
            best, since = (dev, w.copy()), 0
        since += 1
        if dev <= tol or since > 150:
            break
        s = np.sign(g)
        flip = s * prev < 0
        step = np.where(flip, step * 0.5, step * 1.2)
        w += s * step
        prev = np.where(flip, 0, s)
        w -= w.mean()
    w = best[1]
    a = assign(Xf, C, w)
    P = base + np.bincount(a, pf, k)
    return w, P


def polish(X, p, C, w, target, fixed_pop, fixed_mask, max_moves=3000):
    """Exact final balancing, one block group at a time.

    Lowering w_j by the smallest "margin" among j's points evicts exactly that
    point to its second-best district; raising w_j by the smallest margin
    among outside points pulls exactly that point in. Each accepted move
    strictly reduces the sum of squared population deviations, so the loop
    terminates, and the result is still a power diagram.
    """
    k = len(C)
    free = ~fixed_mask
    Xf, pf = X[free], p[free]
    w = w.copy()
    # Only points near a border can move during a polish; hold the rest.
    S = Xf @ (-2.0 * C.T) + (np.sum(C * C, axis=1) - w)
    part = np.partition(S, 1, axis=1)
    gap = part[:, 1] - part[:, 0]
    near = gap <= np.quantile(gap, 0.25) if len(gap) > 400 else np.ones(len(gap), bool)
    a_far = np.argmin(S[~near], axis=1)
    fixed_pop = fixed_pop + np.bincount(a_far, pf[~near], k)
    Xf, pf = Xf[near], pf[near]
    for _ in range(max_moves):
        S = Xf @ (-2.0 * C.T) + (np.sum(C * C, axis=1) - w)
        a = np.argmin(S, axis=1)
        dev = fixed_pop + np.bincount(a, pf, k) - target
        moved = False
        for j in np.argsort(-np.abs(dev)):
            if dev[j] > 0:
                inj = np.flatnonzero(a == j)
                if len(inj) < 2:
                    continue
                Sj = S[inj].copy()
                Sj[:, j] = np.inf
                m = np.argmin(Sj, axis=1)
                margin = Sj[np.arange(len(inj)), m] - S[inj, j]
                t = np.argmin(margin)
                i, dst = inj[t], m[t]
                src = j
            elif dev[j] < 0:
                out = np.flatnonzero(a != j)
                if len(out) == 0:
                    continue
                margin = S[out, j] - S[out, a[out]]
                t = np.argmin(margin)
                i, src, dst = out[t], a[out[t]], j
            else:
                continue
            delta = (dev[src] - pf[i]) ** 2 + (dev[dst] + pf[i]) ** 2 - dev[src] ** 2 - dev[dst] ** 2
            if delta < 0:
                eps = 1e-6 * (1 + abs(margin[t]))
                if src == j and dev[j] > 0:
                    w[j] -= margin[t] + eps
                else:
                    w[j] += margin[t] + eps
                moved = True
                break
        if not moved:
            break
    return w


def solve(X, p, k, theta, fixed=None, init=None, max_outer=80, tol=0.0005):
    """Run balanced Lloyd iterations from the seed at angle `theta`.

    `fixed` optionally maps point index -> district (contiguity repairs);
    `init` optionally gives starting (centers, weights) instead of the seed.
    Returns centers C, weights w, full assignment a.
    """
    target = p.sum() / k
    C, w = (seed_centers(X, p, k, theta), np.zeros(k)) if init is None else init
    fixed_mask = np.zeros(len(X), bool)
    fixed_pop = np.zeros(k)
    fixed_lab = None
    if fixed:
        idx = np.fromiter(fixed.keys(), int)
        fixed_lab = np.fromiter(fixed.values(), int)
        fixed_mask[idx] = True
        fixed_pop = np.bincount(fixed_lab, p[idx], k)
    for it in range(max_outer):
        w, _ = balance(X, p, C, w, target, fixed_pop, fixed_mask,
                       tol=max(tol, 0.01 / (1 + it)), max_iter=150)
        a = full_assign(X, C, w, fixed_mask, fixed_lab)
        newC = np.array([np.average(X[a == j], axis=0, weights=p[a == j] + 1e-9)
                         if np.any(a == j) else C[j] for j in range(k)])
        shift = np.sqrt(np.sum((newC - C) ** 2, 1)).max()
        C = newC
        if shift < 0.05 and it > 5:  # km
            break
    w, _ = balance(X, p, C, w, target, fixed_pop, fixed_mask, tol=tol, max_iter=1500)
    w = polish(X, p, C, w, target, fixed_pop, fixed_mask)
    a = full_assign(X, C, w, fixed_mask, fixed_lab)
    return C, w, a


def full_assign(X, C, w, fixed_mask=None, fixed_lab=None):
    a = assign(X, C, w)
    if fixed_mask is not None and fixed_mask.any():
        a[fixed_mask] = fixed_lab
    return a


def moment_of_inertia(X, p, a, k):
    """Population-weighted mean squared distance to district centroid (km^2)."""
    total = 0.0
    for j in range(k):
        m = a == j
        if not m.any():
            continue
        c = np.average(X[m], axis=0, weights=p[m] + 1e-9)
        total += np.sum(p[m] * np.sum((X[m] - c) ** 2, 1))
    return total / p.sum()


def rebalance(X, p, C, w, lab, tol=0.0005, exact=True):
    """Re-equalise populations with points where lab >= 0 locked to a district."""
    k = len(C)
    mask = lab >= 0
    fixed_pop = np.bincount(lab[mask], p[mask], k)
    target = p.sum() / k
    if mask.all():
        return w, lab.copy()
    w, _ = balance(X, p, C, w, target, fixed_pop, mask, tol=tol, max_iter=1500)
    w = polish(X, p, C, w, target, fixed_pop, mask, max_moves=3000 if exact else 400)
    a = assign(X, C, w)
    a[mask] = lab[mask]
    return w, a


def border_county(X, county, C, w, j, whole):
    """The whole county nearest the border of district j, or None."""
    S = X @ (-2.0 * C.T) + (np.sum(C * C, axis=1) - w)
    two = np.argpartition(S, 1, axis=1)[:, :2]
    r = np.arange(len(X))
    s0, s1 = S[r, two[:, 0]], S[r, two[:, 1]]
    best = np.where(s0 <= s1, two[:, 0], two[:, 1])
    second = np.where(s0 <= s1, two[:, 1], two[:, 0])
    gap = np.abs(s1 - s0)
    touch = (best == j) | (second == j)
    margins = {}
    for c in whole:
        m = touch & (county == c)
        if m.any():
            margins[c] = gap[m].min()
    return min(margins, key=lambda c: (margins[c], c)) if margins else None


def keep_counties_whole(X, p, county, C, w, a, extra=None, never=(), tol=0.003, exact=False):
    """County rule: keep every county whole unless a split is needed for equality.

    Start from the compact plan `a`. Each county goes, whole, to the district
    holding most of its people -- except counties larger than one district,
    which must be split. While any district misses equal population by more
    than `tol`, release one county back to the straight-line rule: among
    counties the compact plan split that touch the worst district, the most
    evenly divided one (ties: lowest FIPS code). Deterministic.
    `extra` (point -> district, -1 = none) locks contiguity repairs;
    counties in `never` are always released (see build.candidate).
    Returns (weights, assignment, sorted list of released county codes).
    """
    k = len(C)
    target = p.sum() / k
    codes = np.unique(county)
    whole, splitters = {}, {}
    for c in codes:
        m = county == c
        share = np.bincount(a[m], p[m], k)
        if share.sum() > target or c in never:
            continue
        whole[c] = int(np.argmax(share))
        if np.count_nonzero(share) > 1:
            splitters[c] = share
    while True:
        lab = np.full(len(X), -1)
        for c, d in whole.items():
            lab[county == c] = d
        if extra is not None:
            lab = np.where(extra >= 0, extra, lab)
        w, a2 = rebalance(X, p, C, w, lab, tol=tol * 0.9, exact=exact)
        dev = (np.bincount(a2, p, k) - target) / target
        if np.abs(dev).max() <= tol:
            break
        cands = [c for c in sorted(splitters) if c in whole]
        c = None
        for j in np.argsort(-np.abs(dev)):
            near = [q for q in cands if splitters[q][j] > 0]
            if near:
                evenness = lambda q: -np.sort(splitters[q])[-2] / splitters[q].sum()
                c = min(near, key=lambda q: (evenness(q), q))
                break
            # No split county touches district j: release the whole county
            # lying closest to j's border (smallest power-distance margin).
            c = border_county(X, county, C, w, j, whole)
            if c is not None:
                break
        if c is None:
            break
        del whole[c]
    released = sorted(set(codes) - set(whole))
    return w, a2, lab, released
