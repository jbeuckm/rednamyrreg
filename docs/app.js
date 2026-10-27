/* Rednamyrreg site script. Reads docs/data/*.json and renders the map, panels and tables. */
(() => {
"use strict";

// ---------------------------------------------------------------- theme
const root = document.documentElement;
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch (e) {}
const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark"
  : matchMedia("(prefers-color-scheme: dark)").matches;
document.getElementById("themeBtn").addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  rerender();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => rerender());
const rerenderHooks = [];
function rerender() { rerenderHooks.forEach((f) => f()); }

// ---------------------------------------------------------------- formatting
const pct = (x, d = 1) => x == null ? "—" : (100 * x).toFixed(d) + "%";
const lean = (x, d = 1) => {            // x: D two-party share
  if (x == null) return "—";
  const m = (x - 0.5) * 200;
  return Math.abs(m) < 0.05 ? "Even" : (m > 0 ? "D+" : "R+") + Math.abs(m).toFixed(d);
};
const favor = (x, d = 1, unit = "%") => {  // positive = favors R
  if (x == null) return "—";
  const v = 100 * x;
  return Math.abs(v) < 0.05 ? "0" : (v > 0 ? "R+" : "D+") + Math.abs(v).toFixed(d) + unit;
};
const fmt = d3.format(",");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------- static content
const TIMELINE = [
  ["1787", "Constitution, Art. I §2", "House seats apportioned among states by population, with a census every ten years. Nothing about how states divide their seats.", false, ["const-art1"]],
  ["Mar. 26, 1812", "The “Gerry-mander”", "The Boston Gazette prints Elkanah Tisdale's salamander cartoon of a Massachusetts senate district signed by Gov. Elbridge Gerry, and the word is born.", true, ["smithsonian-gerry"]],
  ["1842", "Apportionment Act", "The first federal mandate for single-member, contiguous districts.", false, ["crs-apportion-acts"]],
  ["1872 · 1901 · 1911", "Equal population, then compactness", "Congress adds districts “as nearly as practicable” equal in population (1872) and “compact” (1901, repeated in 1911). None of it was ever enforced.", false, ["crs-apportion-acts"]],
  ["1929", "Reapportionment Act", "Fixes the House at 435 seats with automatic reapportionment and silently drops the districting standards. Wood v. Broom (1932) confirms they lapsed.", true, ["act-1929", "wood"]],
  ["1941", "Huntington–Hill", "The “equal proportions” formula becomes the permanent rule for dividing 435 seats among the states.", false, ["usc-2a", "census-hh"]],
  ["1946", "Colegrove v. Green", "The Supreme Court calls districting a “political thicket” and stays out. Some districts are 3–4× the size of others.", false, ["colegrove"]],
  ["1962–64", "Baker v. Carr · Wesberry v. Sanders · Reynolds v. Sims", "The reapportionment revolution. Malapportionment becomes justiciable, congressional districts must be equal in population, and “one person, one vote” is established.", true, ["baker", "wesberry", "reynolds"]],
  ["1965", "Voting Rights Act", "Section 2 bans discriminatory voting practices nationwide, and Section 5 requires preclearance in covered jurisdictions.", true, ["vra"]],
  ["1967", "2 U.S.C. §2c", "Single-member districts required again; at-large House elections banned in multi-seat states.", false, ["usc-2c"]],
  ["1983", "Karcher v. Daggett", "A 0.7% population difference between New Jersey districts is struck down. Equality is held to a strict standard.", false, ["karcher"]],
  ["1986", "Davis v. Bandemer · Thornburg v. Gingles", "Partisan gerrymandering held justiciable, but no standard emerges. Gingles sets the test for when the VRA requires majority-minority districts.", false, ["bandemer", "gingles"]],
  ["1993", "Shaw v. Reno", "Bizarrely shaped race-based districts can violate Equal Protection.", false, ["shaw"]],
  ["2004 · 2006", "Vieth v. Jubelirer · LULAC v. Perry", "No majority on a partisan standard. Texas's 2003 mid-decade redraw is mostly upheld.", false, ["vieth", "lulac"]],
  ["2010–11", "REDMAP and big data", "A targeted campaign for state legislatures gives one party the 2011 pen in key states, and line-drawing software makes precision gerrymanders cheap.", false, ["redmap"]],
  ["2013", "Shelby County v. Holder", "The preclearance coverage formula is struck down, effectively ending Section 5 review.", false, ["shelby"]],
  ["2015", "Arizona Legislature v. AIRC", "Voters may hand congressional districting to an independent commission.", false, ["airc"]],
  ["2019", "Rucho v. Common Cause", "5–4: partisan-gerrymandering claims are nonjusticiable in federal court. The fight moves to states.", true, ["rucho"]],
  ["2023", "Allen v. Milligan · Moore v. Harper", "Gingles reaffirmed, and Alabama must add a second Black-opportunity district. State courts may police congressional maps.", false, ["milligan", "moore"]],
  ["2024", "Alexander v. SC NAACP", "Presumption of legislative good faith. Challengers must disentangle race from party.", false, ["alexander"]],
  ["2025–26", "The mid-decade war", "Texas redraws at the President's urging, California answers with Prop 50, and seven more states follow. Nine states have new maps for November 2026.", true, ["ncsl-tracker", "ap-9states"]],
  ["Apr. 29, 2026", "Louisiana v. Callais", "6–3: Louisiana's second majority-Black district struck down. Section 2 now needs a “strong inference” of intentional discrimination.", true, ["callais", "crs-callais"]],
];

const PRINCIPLES = [
  ["Equality", "Equal population", "Every district holds the same number of people, to within one census unit.", "Checkable: sum the published assignment file by district."],
  ["Contiguity", "One piece", "Every district is connected. Water inside the state counts as connecting; islands are exempt.", "Checkable: a connectivity test on the published geometry."],
  ["Compactness", "Close to the center", "Minimize the average squared distance from each person to their district's population center (Hess et al., 1965).", "Provable: between split counties, each district is a convex polygon."],
  ["Counties", "Keep counties whole", "Split a county only when equal population or contiguity requires it, and then along the same straight-line rule.", "Checkable: every split county is listed and justified by the rule."],
  ["Blindness", "No politics at the drawing board", "The generator sees population and geography only: no votes, no party registration, no race, no incumbents' addresses.", "Provable by inspection: the inputs are public, and none of them encode party."],
  ["Determinism", "Same data, same map", "No randomness and no human choices. Seeds are fixed angles, and every parameter is fixed in advance.", "Provable: anyone rerunning the code gets an identical map."],
  ["Certificate", "Verify in seconds", "Publish centers and weights. Each address's district is a one-line calculation, and the weights are optimal dual variables.", "Provable by LP duality: at these centers, no population-preserving reassignment lowers total distance."],
  ["Symmetry", "Bounded, two-sided correction", "Election data may only choose among pre-certified plans that already pass every constraint, the county tier and the 5% compactness gate, and it picks the one with the least partisan bias.", "Provable: swapping party labels yields the same choice, and every option is compact."],
  ["Schedule", "Change by rule, never by request", "Rerun after each census. Between censuses, a published fairness ledger can trigger at most one switch to another certified plan.", "Checkable: the trigger is arithmetic on public election returns."],
];

// ---------------------------------------------------------------- citations
const REF_INDEX = new Map((window.REFS || []).map((r, i) => [r[0], i + 1]));
function cites(keys) {
  return keys.map((k) => `<a class="cite" data-ref="${k}"></a>`).join("");
}
function fillCites(root) {
  root.querySelectorAll("a.cite[data-ref]").forEach((el) => {
    const n = REF_INDEX.get(el.dataset.ref);
    if (!n) { el.remove(); return; }
    const ref = window.REFS[n - 1];
    el.textContent = `[${n}]`;
    el.href = `#ref-${ref[0]}`;
    el.title = ref[1].replace(/<[^>]+>/g, "");
  });
}
function renderRefs() {
  document.getElementById("refList").innerHTML = (window.REFS || []).map(([k, text, url]) =>
    `<li id="ref-${k}">${text} <a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, "").slice(0, 70)}${url.length > 78 ? "…" : ""}</a></li>`).join("");
}
new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) fillCites(n); })))
  .observe(document.body, { childList: true, subtree: true });

function renderStatic() {
  const tl = document.getElementById("timeline");
  tl.innerHTML = TIMELINE.map(([when, what, why, key, refs]) =>
    `<li class="${key ? "key" : ""}"><div class="when">${when}</div><div class="what">${what}</div><div class="why">${why}${cites(refs || [])}</div></li>`).join("");
  document.getElementById("principleCards").innerHTML = PRINCIPLES.map(([tag, h, p, proof], i) =>
    `<div class="card"><div class="tag">${i + 1} · ${tag}</div><h4>${h}</h4><p>${p}</p><div class="proof">${proof}</div></div>`).join("");
  renderPack();
}

// Packing & cracking: 50 voters, 60% blue, 5 districts.
function renderPack() {
  const blue = (r, c) => c < 6;
  const plans = [
    { name: "Compact & proportional", res: "3 blue · 2 red", f: (r, c) => Math.floor(c / 2) },
    { name: "Compact, red cracked", res: "5 blue · 0 red", f: (r, c) => r },
    { name: "Packed & cracked", res: "2 blue · 3 red",
      f: (r, c) => c < 2 ? 0 : c < 4 ? 1 : c === 9 ? 4 : r < 2 ? 2 : r < 4 ? 3 : 4 },
  ];
  const el = document.getElementById("packDemo");
  const draw = () => {
    const s = 22, W = 10 * s, H = 5 * s;
    el.innerHTML = plans.map((p) => {
      let cells = "", borders = "";
      for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) {
        cells += `<circle cx="${c * s + s / 2}" cy="${r * s + s / 2}" r="${s * 0.3}" fill="${blue(r, c) ? css("--dem") : css("--rep")}"/>`;
        if (c < 9 && p.f(r, c) !== p.f(r, c + 1)) borders += `M${(c + 1) * s},${r * s}v${s}`;
        if (r < 4 && p.f(r, c) !== p.f(r + 1, c)) borders += `M${c * s},${(r + 1) * s}h${s}`;
      }
      return `<figure><svg viewBox="-2 -2 ${W + 4} ${H + 4}" role="img" aria-label="${p.name}: ${p.res}">
        <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${css("--ink")}" stroke-width="2"/>
        ${cells}<path d="${borders}" stroke="${css("--ink")}" stroke-width="2.5" fill="none" stroke-linecap="square"/></svg>
        <figcaption><b>${p.name}</b><br>Same voters (60% blue), five districts → <b>${p.res}</b></figcaption></figure>`;
    }).join("");
  };
  draw();
  rerenderHooks.push(draw);
}

// ---------------------------------------------------------------- data & state
const state = { plan: "ours", color: "id", sel: null, data: null };
const tip = document.getElementById("tooltip");

Promise.all([
  d3.json("data/summary.json"),
  d3.json("data/districts.geojson"),
  d3.json("data/enacted.geojson"),
  d3.json("data/states.geojson"),
]).then(([summary, ours, enacted, states]) => {
  const byAbbr = new Map(summary.states.map((s) => [s.abbr, s]));
  state.data = { summary, byAbbr, ours, enacted, states };
  document.getElementById("builtDate").textContent = summary.generated;
  renderHero();
  setupMap();
  renderFindings();
  renderTable();
  renderAdoption();
  const sel = document.getElementById("stateSel");
  summary.states.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((s) => {
    sel.insertAdjacentHTML("beforeend", `<option value="${s.abbr}">${s.name}</option>`);
  });
  sel.addEventListener("change", () => selectState(sel.value || null));
  const q = new URLSearchParams(location.search).get("state");
  if (q && byAbbr.has(q.toUpperCase())) {
    const dq = +new URLSearchParams(location.search).get("district");
    if (dq) state.selDistrict = dq - 1;
    selectState(q.toUpperCase(), !!dq);
  }
  const pq = new URLSearchParams(location.search);
  if (["enacted", "history"].includes(pq.get("plan"))) setPlan(pq.get("plan"));
  if (["lean", "minority"].includes(pq.get("color"))) document.querySelector(`[data-color="${pq.get("color")}"]`).click();
}).catch((err) => {
  document.getElementById("map").insertAdjacentHTML("beforeend", `<p style="padding:20px">Could not load map data: ${esc(err.message)}</p>`);
});

function nationals() {
  const S = state.data.summary.states;
  const sum = (f) => S.reduce((a, s) => a + f(s), 0);
  return {
    oursD: sum((s) => s.ours.elections.comp.seatsD),
    enD: sum((s) => s.enacted.elections.comp.seatsD),
    propD: sum((s) => s.seats * s.ours.elections.comp.V),
    oursSplits: sum((s) => s.ours.county_splits),
    enSplits: sum((s) => s.enacted.county_splits),
    oursMuni: sum((s) => s.ours.muni_splits),
    enMuni: sum((s) => s.enacted.muni_splits),
    oursPrec: sum((s) => s.ours.precinct_splits),
    enPrec: sum((s) => s.enacted.precinct_splits),
    maxRange: d3.max(S, (s) => s.ours.range_people),
    exact: S.filter((s) => s.ours.range_people <= 1).length,
    maxdev: d3.max(S, (s) => s.ours.maxdev),
    oursPP: d3.mean(S.flatMap((s) => s.ours.pp)),
    enPP: d3.mean(S.flatMap((s) => s.enacted.pp)),
    oursMM: sum((s) => s.ours.mm_districts),
    enMM: sum((s) => s.enacted.mm_districts),
    contiguous: S.filter((s) => d3.max(s.ours.pieces) === 1).length,
    oursBias: sum((s) => s.seats * (s.ours.elections.comp.bias || 0)),
    enBias: sum((s) => s.seats * (s.enacted.elections.comp.bias || 0)),
  };
}

function renderHero() {
  const n = nationals();
  const S = state.data.summary.states;
  const legal = S.filter((s) => !s.ours.checks.some((c) => c.status === "fail")).length;
  const tiles = [
    [`${legal}/50`, `states whose plan passes every federal and state legal check we run, including each state's own constitution and statutes`],
    [`0`, `partisan, racial or incumbent inputs while drawing. The rule is public, deterministic and checkable by anyone`],
    [`${n.contiguous}/50 · ≤ ${n.maxRange}`, `states with every district contiguous on true block geometry · largest population gap anywhere, in people`],
    [`${seatsFavor(n.oursBias).replace(" seats", "")} vs ${seatsFavor(n.enBias).replace(" seats", "")}`, `summed partisan bias, in seats, at a 50–50 vote: Neutral Lines vs today's maps (closer to 0 is fairer)`],
    [`${fmt(n.oursSplits)} vs ${fmt(n.enSplits)}`, `counties split, Neutral Lines vs today's maps. Towns: ${fmt(n.oursMuni)} vs ${fmt(n.enMuni)}; precincts: ${fmt(n.oursPrec)} vs ${fmt(n.enPrec)}`],
  ];
  document.getElementById("heroTiles").innerHTML = tiles.map(([v, l]) =>
    `<div class="tile"><div class="v num">${v}</div><div class="l">${l}</div></div>`).join("");
}

// ---------------------------------------------------------------- colors
function leanScale() {
  const rep = css("--rep"), mid = css("--mid"), dem = css("--dem");
  const lo = d3.interpolateLab(rep, mid), hi = d3.interpolateLab(mid, dem);
  return (s) => {
    const t = Math.max(0, Math.min(1, (s - 0.25) / 0.5));
    return t < 0.5 ? lo(t * 2) : hi((t - 0.5) * 2);
  };
}
function minorityScale() {
  const a = isDark() ? "#26233a" : "#ece9fb", b = isDark() ? "#c9c2ff" : "#2d1f8f";
  const f = d3.interpolateLab(a, b);
  return (x) => f(Math.max(0, Math.min(1, x)));
}
const ID_VARS = ["--id-1", "--id-2", "--id-3", "--id-4", "--id-5"];

function featureStats(f) {
  const s = state.data.byAbbr.get(f.properties.st);
  const plan = state.plan === "ours" ? s.ours : s.enacted;
  const i = f.properties.d - 1;
  return { s, plan, i };
}

function fillFor(f, scales) {
  if (state.plan === "history") return css(ID_VARS[Math.min(f.properties.c || 0, 4)]);
  const { plan, i } = featureStats(f);
  if (state.color === "lean") return scales.lean(plan.elections.comp.shares[i]);
  if (state.color === "minority") return scales.min(plan.minority[i]);
  return css(ID_VARS[Math.min(f.properties.c || 0, 4)]);
}

// ---------------------------------------------------------------- map (MapLibre GL)
let map = null;
const BASEMAP = () => `https://tiles.openfreemap.org/styles/${isDark() ? "dark" : "positron"}`;
const US_BOUNDS = [[-125.0, 24.2], [-66.8, 49.6]];
const FILL_OPACITY = 0.62;

function bboxOf(geom) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0];
      if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
    } else c.forEach(walk);
  };
  walk(geom.coordinates);
  return [[x0, y0], [x1, y1]];
}

// Label at the area-weighted centre of the largest outer ring.
function labelPoint(f) {
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = null, bestA = -1;
  polys.forEach((poly) => {
    const r = poly[0];
    let A = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const cr = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      A += cr; cx += (r[j][0] + r[i][0]) * cr; cy += (r[j][1] + r[i][1]) * cr;
    }
    if (Math.abs(A) > bestA && A !== 0) { bestA = Math.abs(A); best = [cx / (3 * A), cy / (3 * A)]; }
  });
  return best;
}

function labelText(f) {
  return state.plan === "ours" ? String(f.properties.d)
    : state.plan === "history" ? (f.properties.d === 0 ? "AL" : String(f.properties.d))
    : (f.properties.label === "00" ? "AL" : String(+f.properties.label));
}

function setupMap() {
  map = new maplibregl.Map({
    container: "mapgl", style: BASEMAP(), bounds: US_BOUNDS,
    fitBoundsOptions: { padding: 20 }, dragRotate: false, pitchWithRotate: false,
    attributionControl: { compact: true }, cooperativeGestures: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  map.on("style.load", () => { addLayers(); drawDistricts(); });
  map.on("mousemove", "district-fill", (e) => {
    const f = e.features[0];
    map.getCanvas().style.cursor = "pointer";
    map.setFilter("hover-line", ["==", ["id"], f.id]);
    showTip(e.originalEvent, f);
  });
  map.on("mouseleave", "district-fill", () => {
    map.getCanvas().style.cursor = "";
    map.setFilter("hover-line", ["==", ["id"], -1]);
    tip.style.display = "none";
  });
  map.on("click", "district-fill", (e) => {
    const f = e.features[0];
    if (state.plan === "history") {
      const c = hist.snaps[hist.i].congress;
      const ann = hist.anns.find((x) => x.congress === c && x.st === f.properties.st && x.d === f.properties.d);
      if (ann) return focusAnnotation(ann);
    }
    state.selDistrict = state.plan === "history" ? null : f.properties.d - 1;
    if (state.sel === f.properties.st) { renderPanel(); drawHighlight(); } else selectState(f.properties.st, true);
  });
  document.getElementById("resetBtn").addEventListener("click", () => selectState(null));
  document.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => setPlan(b.dataset.plan)));
  setupHistoryControls();
  document.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
    state.color = b.dataset.color;
    document.querySelectorAll("[data-color]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    recolor(); renderLegend();
  }));
  renderLegend();
  renderPanel();
  // A full style reload (no diff) fires style.load, which re-adds our layers in the new theme's colors.
  // A diffed swap would silently drop them and never fire style.load.
  rerenderHooks.push(() => { if (map) map.setStyle(BASEMAP(), { diff: false }); renderLegend(); renderPanel(); });
}

function addLayers() {
  const empty = { type: "FeatureCollection", features: [] };
  // Draw our layers beneath the basemap's place labels so town names stay readable.
  const firstSymbol = (map.getStyle().layers || []).find((l) => l.type === "symbol")?.id;
  const add = (layer, before = firstSymbol) => { if (!map.getLayer(layer.id)) map.addLayer(layer, before); };
  for (const id of ["districts", "labels", "hl"]) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty });
  if (!map.getSource("states")) map.addSource("states", { type: "geojson", data: state.data.states });
  add({ id: "district-fill", type: "fill", source: "districts",
        paint: { "fill-color": ["get", "fill"], "fill-opacity": FILL_OPACITY } });
  add({ id: "district-line", type: "line", source: "districts",
        paint: { "line-color": css("--surface"), "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1.4] } });
  add({ id: "state-line", type: "line", source: "states",
        paint: { "line-color": css("--ink-2"), "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 8, 2] } });
  add({ id: "state-sel", type: "line", source: "states", filter: ["==", ["get", "st"], ""],
        paint: { "line-color": css("--ink"), "line-width": 2.6 } });
  add({ id: "hover-line", type: "line", source: "districts", filter: ["==", ["id"], -1],
        paint: { "line-color": css("--ink"), "line-width": 2 } });
  add({ id: "hl-line", type: "line", source: "hl", paint: { "line-color": css("--accent"), "line-width": 3.5 } });
  add({ id: "dlabels", type: "symbol", source: "labels", layout: {
          "text-field": ["get", "t"], "text-size": 13, "text-font": ["Noto Sans Bold"], "text-allow-overlap": false },
        paint: { "text-color": css("--ink"), "text-halo-color": css("--surface"), "text-halo-width": 2 } }, undefined);
}

function scales() { return { lean: leanScale(), min: minorityScale() }; }

function currentFeatures() {
  if (state.plan === "history") return hist.cache.get(hist.snaps[hist.i].congress).features;
  return (state.plan === "ours" ? state.data.ours : state.data.enacted).features;
}

function drawDistricts() {
  if (!map || !map.getSource("districts")) return;
  const sc = scales();
  const feats = currentFeatures().map((f, i) => ({ type: "Feature", id: i, geometry: f.geometry,
    properties: { ...f.properties, fill: fillFor(f, sc) } }));
  map.getSource("districts").setData({ type: "FeatureCollection", features: feats });
  drawLabels();
  drawHighlight();
  map.setFilter("state-sel", ["==", ["get", "st"], state.sel || ""]);
}

function recolor() { drawDistricts(); }

function drawLabels() {
  if (!map || !map.getSource("labels")) return;
  const feats = !state.sel ? [] : currentFeatures().filter((f) => f.properties.st === state.sel)
    .map((f) => ({ f, c: labelPoint(f) })).filter((x) => x.c)
    .map(({ f, c }) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { t: labelText(f) } }));
  map.getSource("labels").setData({ type: "FeatureCollection", features: feats });
}

function showTip(e, f) {
  if (state.plan === "history") return showHistTip(e, f);
  const { s, plan, i } = featureStats(f);
  const el = plan.elections;
  const name = state.plan === "ours" ? `District ${f.properties.d}` :
    (f.properties.label === "00" ? "At-large district" : `District ${+f.properties.label} (enacted)`);
  const rows = [
    ["Population", fmt(plan.pop[i])],
    ["Lean, 2016–20 statewide", lean(el.comp.shares[i])],
    ["Lean, 2020 president", lean(el.pres20.shares[i])],
    ["Minority share of adults", pct(plan.minority[i], 0)],
    ["Polsby–Popper", plan.pp[i].toFixed(2)],
    ["Reock", plan.reock[i].toFixed(2)],
  ];
  tip.innerHTML = `<b>${esc(s.name)} · ${name}</b>` +
    rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join("") +
    `<div class="note" style="margin-top:4px">Click for why it looks like this</div>`;
  tip.style.display = "block";
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  const y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
  tip.style.left = x + "px"; tip.style.top = y + "px";
}

function selectState(abbr, keepDistrict) {
  if (!keepDistrict) state.selDistrict = null;
  state.sel = abbr;
  try {
    const u = new URL(location.href);
    if (abbr) u.searchParams.set("state", abbr); else u.searchParams.delete("state");
    if (!abbr || !keepDistrict) u.searchParams.delete("district");
    history.replaceState(null, "", u);
  } catch (e) {}
  document.getElementById("stateSel").value = abbr || "";
  document.getElementById("resetBtn").style.display = abbr ? "block" : "none";
  const feat = abbr && state.data.states.features.find((f) => f.properties.st === abbr);
  if (map) {
    if (map.getLayer("state-sel")) map.setFilter("state-sel", ["==", ["get", "st"], abbr || ""]);
    map.fitBounds(feat ? bboxOf(feat.geometry) : US_BOUNDS, { padding: 30, maxZoom: 9, duration: 700 });
  }
  drawLabels();
  drawHighlight();
  renderPanel();
}

function renderLegend() {
  const el = document.getElementById("legend");
  if (state.plan === "history") {
    el.innerHTML = `<span>Historical district boundaries: Lewis, DeVine, Pritcher &amp; Martis, UCLA. Fill colors only separate neighbors. Outlined in purple: the district in the current story.</span>`;
    return;
  }
  if (state.color === "id") {
    el.innerHTML = `<span>Fill colors only separate neighbors and carry no meaning. Hover any district for its numbers.</span>`;
    return;
  }
  const f = state.color === "lean" ? leanScale() : minorityScale();
  const xs = d3.range(0, 1.0001, 0.05);
  const stops = xs.map((t) => `${state.color === "lean" ? f(0.25 + t * 0.5) : f(t)} ${t * 100}%`).join(",");
  const ticks = state.color === "lean" ? ["R+50", "R+25", "Even", "D+25", "D+50"] : ["0%", "25%", "50%", "75%", "100%"];
  const title = state.color === "lean" ? "Two-party lean, 2016–20 statewide races" : "Non-white or Hispanic share of voting-age population";
  el.innerHTML = `<span>${title}</span><div><div class="ramp" style="background:linear-gradient(90deg,${stops})"></div>
    <div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div></div>`;
}


// ---------------------------------------------------------------- history mode
const hist = { snaps: null, anns: null, source: "", i: 0, cache: new Map(), focus: null, timer: null, tour: -1 };

function loadHistory() {
  if (hist.snaps) return Promise.resolve();
  return Promise.all([d3.json("data/history/index.json"), d3.json("data/history/annotations.json")])
    .then(([idx, anns]) => {
      hist.snaps = idx.snapshots;
      hist.source = idx.source;
      hist.anns = anns.slice().sort((x, y) => x.congress - y.congress || x.id.localeCompare(y.id));
      const r = document.getElementById("histRange");
      r.max = hist.snaps.length - 1;
      hist.i = hist.snaps.length - 1;
    });
}

function loadSnap(i) {
  const s = hist.snaps[i];
  if (hist.cache.has(s.congress)) return Promise.resolve();
  return d3.json("data/history/" + s.file).then((g) => { hist.cache.set(s.congress, g); });
}

function setPlan(plan) {
  stopPlay();
  const go = () => {
    state.plan = plan;
    document.querySelectorAll("[data-plan]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.plan === plan));
    document.getElementById("histbar").hidden = plan !== "history";
    document.querySelectorAll("[data-color]").forEach((x) => {
      x.disabled = plan === "history" && x.dataset.color !== "id";
    });
    if (plan === "history" && state.color !== "id") document.querySelector('[data-color="id"]').click();
    drawDistricts(); renderPanel(); renderLegend();
  };
  if (plan !== "history") return go();
  loadHistory().then(() => loadSnap(hist.i)).then(() => { updateHistLabel(); go(); })
    .catch((err) => alert("Could not load the historical maps: " + err.message));
}

function setSnap(i, keepFocus) {
  hist.i = Math.max(0, Math.min(hist.snaps.length - 1, i));
  if (!keepFocus) hist.focus = null;
  updateHistLabel();
  return loadSnap(hist.i).then(() => (hist.i > 0 ? loadSnap(hist.i - 1) : null)).then(() => { drawDistricts(); renderPanel(); });
}

function updateHistLabel() {
  const s = hist.snaps[hist.i];
  document.getElementById("histRange").value = hist.i;
  document.getElementById("histLabel").textContent = `${s.years} · ${ordinal(s.congress)} Congress`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function stopPlay() {
  if (hist.timer) { clearInterval(hist.timer); hist.timer = null; }
  const b = document.getElementById("histPlay");
  if (b) b.textContent = "Play";
}

function setupHistoryControls() {
  document.getElementById("histRange").addEventListener("input", (e) => { stopPlay(); setSnap(+e.target.value); });
  document.getElementById("histPrev").addEventListener("click", () => { stopPlay(); setSnap(hist.i - 1); });
  document.getElementById("histNext").addEventListener("click", () => { stopPlay(); setSnap(hist.i + 1); });
  document.getElementById("histPlay").addEventListener("click", (e) => {
    if (hist.timer) return stopPlay();
    e.target.textContent = "Pause";
    if (hist.i >= hist.snaps.length - 1) setSnap(0);
    hist.timer = setInterval(() => {
      if (hist.i >= hist.snaps.length - 1) return stopPlay();
      setSnap(hist.i + 1);
    }, 2600);
  });
  document.getElementById("tourBtn").addEventListener("click", () => {
    stopPlay();
    hist.tour = (hist.tour + 1) % hist.anns.length;
    focusAnnotation(hist.anns[hist.tour]);
  });
}

function focusAnnotation(ann) {
  hist.tour = hist.anns.indexOf(ann);
  const i = hist.snaps.findIndex((s) => s.congress === ann.congress);
  hist.focus = ann;
  setSnap(i, true).then(() => {
    selectState(ann.st);
    document.getElementById("tourBtn").textContent = "Next story →";
  });
}

function drawHighlight() {
  if (!map || !map.getSource("hl")) return;
  let feats = [];
  if (state.plan === "history") {
    const ann = hist.focus;
    if (ann && ann.d != null) feats = currentFeatures().filter((f) => f.properties.st === ann.st && f.properties.d === ann.d);
  } else if (state.sel && state.selDistrict != null) {
    feats = currentFeatures().filter((f) => f.properties.st === state.sel && f.properties.d === state.selDistrict + 1);
  }
  map.getSource("hl").setData({ type: "FeatureCollection", features: feats });
}

function showHistTip(e, f) {
  const s = hist.snaps[hist.i];
  const name = state.data.byAbbr.get(f.properties.st)?.name || f.properties.st;
  const d = f.properties.d === 0 ? (f.properties.n > 1 ? `${f.properties.n} at-large seats` : "At-large seat") : `District ${f.properties.d}`;
  const ann = hist.anns.find((a) => a.congress === s.congress && a.st === f.properties.st && a.d === f.properties.d);
  tip.innerHTML = `<b>${esc(name)} · ${d}</b><div class="row"><span>${ordinal(s.congress)} Congress</span><span>${esc(s.years)}</span></div>` +
    (ann ? `<div class="note" style="margin-top:4px">★ ${esc(ann.title)}: click for the story</div>` : "");
  tip.style.display = "block";
  tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
  tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + "px";
}

function seatCounts(fc) {
  const c = {};
  fc.features.forEach((f) => { c[f.properties.st] = (c[f.properties.st] || 0) + (f.properties.d > 0 ? 1 : (f.properties.n || 1)); });
  return c;
}

function changesHtml() {
  if (hist.i === 0) return `<p class="note">The earliest map shown: the House had ${hist.snaps[0].seats} seats, and several states still elected members statewide.</p>`;
  const s = hist.snaps[hist.i], prev = hist.snaps[hist.i - 1];
  const cur = hist.cache.get(s.congress), old = hist.cache.get(prev.congress);
  if (!cur || !old) return "";
  const a0 = seatCounts(old), a1 = seatCounts(cur);
  const y0 = parseInt(prev.years), y1 = parseInt(s.years);
  const censuses = [];
  for (let y = Math.ceil((y0 - 3) / 10) * 10; y + 3 <= y1; y += 10) if (y + 3 > y0) censuses.push(y);
  const gains = [], losses = [], admitted = [];
  Object.keys(a1).sort().forEach((st) => {
    if (!(st in a0)) admitted.push(`${st} (${a1[st]})`);
    else if (a1[st] > a0[st]) gains.push(`${st} +${a1[st] - a0[st]}`);
    else if (a1[st] < a0[st]) losses.push(`${st} −${a0[st] - a1[st]}`);
  });
  const sel = state.sel && (a1[state.sel] != null || a0[state.sel] != null)
    ? `<li><b>${esc(state.data.byAbbr.get(state.sel)?.name || state.sel)}</b>: ${a0[state.sel] ?? 0} → ${a1[state.sel] ?? 0} seats.</li>` : "";
  const why = censuses.length ? `Reapportionment after the ${censuses.join(" and ")} census${censuses.length > 1 ? "es" : ""}` : "No census in between";
  return `<div class="panel-h">What changed since the ${esc(prev.years)} map</div><ul class="why">
    <li><b>House size:</b> ${prev.seats} → ${s.seats} seats. ${why}${censuses.length ? cites(["usc-2a", "census-hh"]) : ""}.</li>
    ${gains.length ? `<li><b>Gained seats:</b> ${gains.join(", ")}.</li>` : ""}
    ${losses.length ? `<li><b>Lost seats:</b> ${losses.join(", ")}.</li>` : ""}
    ${admitted.length ? `<li><b>Newly admitted or first districted:</b> ${admitted.join(", ")}.</li>` : ""}
    ${sel}
    <li>Lines also change within states whenever a legislature, commission or court redraws. The stories below explain the notable ones, each with its source.</li></ul>`;
}

function renderHistPanel(el) {
  const s = hist.snaps[hist.i];
  const here = hist.anns.filter((a) => a.congress === s.congress);
  const f = hist.focus;
  const stateStories = state.sel ? hist.anns.filter((a) => a.st === state.sel) : [];
  el.innerHTML = `<h3>${esc(s.years)}</h3>
    <div class="sub">${ordinal(s.congress)} Congress · ${s.seats} seats · ${esc(s.title)}</div>
    <p style="font-size:.92rem">${esc(s.summary)}</p>
    ${f ? `<div class="annfocus"><b>${esc(f.title)}</b><br>${esc(f.text)}<br><a class="note" href="${esc(f.source)}" target="_blank" rel="noopener">Source</a></div>` : ""}
    ${here.length ? `<div class="panel-h">Notable in this map</div>` + here.map((a) =>
      `<button type="button" class="ann ${a === f ? "on" : ""}" data-ann="${esc(a.id)}"><span class="st">${a.st}${a.d != null ? "-" + (a.d || "AL") : ""}</span><br>${esc(a.title)}</button>`).join("") : ""}
    ${changesHtml()}
    ${stateStories.length ? `<div class="panel-h">${esc(state.data.byAbbr.get(state.sel)?.name || state.sel)} across the eras</div>` + stateStories.map((a) =>
      `<button type="button" class="ann ${a === f ? "on" : ""}" data-ann="${esc(a.id)}"><span class="st">${hist.snaps.find((x) => x.congress === a.congress)?.years || ""}</span><br>${esc(a.title)}</button>`).join("") : ""}
    <div class="panel-h">All stories</div>
    <p class="note">${hist.anns.length} annotated districts from ${hist.snaps[0].years.slice(0, 4)} to today. Use <b>Guided tour</b> to step through them in order, or move the slider to compare eras.</p>
    <p class="note">${esc(hist.source)}</p>`;
  el.querySelectorAll("[data-ann]").forEach((b) => b.addEventListener("click", () =>
    focusAnnotation(hist.anns.find((a) => a.id === b.dataset.ann))));
}

// ---------------------------------------------------------------- side panel
function renderPanel() {
  const el = document.getElementById("panel");
  if (!state.data) return;
  if (state.plan === "history") return renderHistPanel(el);
  if (!state.sel) {
    const n = nationals();
    el.innerHTML = `<h3>United States</h3>
      <div class="sub">435 seats · ${state.plan === "ours" ? "formula plan" : "enacted 2026 map"} shown</div>
      <table class="cmp"><thead><tr><th></th><th>Formula</th><th>Enacted</th></tr></thead><tbody>
      <tr><td>Democratic-leaning seats<sup>*</sup></td><td>${n.oursD}</td><td>${n.enD}</td></tr>
      <tr><td>Republican-leaning seats<sup>*</sup></td><td>${435 - n.oursD}</td><td>${435 - n.enD}</td></tr>
      <tr><td>Sum of state seat bias at 50–50</td><td>${seatsFavor(n.oursBias)}</td><td>${seatsFavor(n.enBias)}</td></tr>
      <tr><td>County splits</td><td>${fmt(n.oursSplits)}</td><td>${fmt(n.enSplits)}</td></tr>
      <tr><td>Avg. Polsby–Popper</td><td>${n.oursPP.toFixed(3)}</td><td>${n.enPP.toFixed(3)}</td></tr>
      <tr><td>Majority-minority districts</td><td>${n.oursMM}</td><td>${n.enMM}</td></tr>
      </tbody></table>
      <p class="note">* Seats whose 2016–20 statewide composite vote leans each way. The state-weighted composite vote would give Democrats about ${n.propD.toFixed(0)} seats under strict proportionality. These figures describe lean, not election results.</p>
      <p class="note">Pick a state on the map or from the menu for its scorecard, candidate plans and downloads.</p>`;
    return;
  }
  const s = state.data.byAbbr.get(state.sel);
  const O = s.ours, E = s.enacted;
  const avg = (a) => d3.mean(a).toFixed(3);
  const years = ["16", "18", "20"].filter((y) => O.elections[y]);
  const origin = ORIGIN[s.abbr] || ORIGIN_DEFAULT;
  const formula = state.plan === "ours";
  const di = state.selDistrict;
  el.innerHTML = `<h3>${esc(s.name)}</h3>
    <div class="sub">${s.seats} seat${s.seats > 1 ? "s" : ""} · ${fmt(s.pop)} people · statewide 2016–20 lean ${lean(O.elections.comp.V)}</div>
    ${di != null && (formula ? O : E).pop[di] != null ? districtWhy(s, formula ? O : E, di, formula) :
      `<p class="note">Click a district on the map to see why its lines are where they are.</p>`}
    <p class="note"><b>Today's map:</b> ${origin[0]}${cites(origin[1])}</p>
    <p><a class="btn" href="state.html?st=${s.abbr}">The case for Neutral Lines in ${esc(s.name)}: legality and how to adopt it →</a></p>
    <table class="cmp"><thead><tr><th></th><th>Formula</th><th>Enacted</th></tr></thead><tbody>
      <tr><td>D-leaning seats (2016–20)</td><td>${O.elections.comp.seatsD}</td><td>${E.elections.comp.seatsD}</td></tr>
      <tr><td>D-leaning seats (Pres. 2020)</td><td>${O.elections.pres20.seatsD}</td><td>${E.elections.pres20.seatsD}</td></tr>
      <tr><td>Partisan bias at 50–50</td><td>${favor(O.elections.comp.bias, 0, "% seats")}</td><td>${favor(E.elections.comp.bias, 0, "% seats")}</td></tr>
      <tr><td>Efficiency gap</td><td>${favor(O.elections.comp.eg)}</td><td>${favor(E.elections.comp.eg)}</td></tr>
      <tr><td>Mean–median gap</td><td>${favor(O.elections.comp.mm)}</td><td>${favor(E.elections.comp.mm)}</td></tr>
      <tr><td>Counties split (of ${O.counties})</td><td>${O.county_splits}</td><td>${E.county_splits}</td></tr>
      <tr><td>Municipalities split (of ${O.munis})</td><td>${O.muni_splits}</td><td>${E.muni_splits}</td></tr>
      <tr><td>Precincts split${s.has_vtd ? ` (of ${O.precincts})` : ""}</td><td>${s.has_vtd ? O.precinct_splits : "n/a"}</td><td>${s.has_vtd ? E.precinct_splits : "n/a"}</td></tr>
      <tr><td>Avg. Polsby–Popper</td><td>${avg(O.pp)}</td><td>${avg(E.pp)}</td></tr>
      <tr><td>Avg. Reock</td><td>${avg(O.reock)}</td><td>${avg(E.reock)}</td></tr>
      <tr><td>Majority-minority districts</td><td>${O.mm_districts}</td><td>${E.mm_districts}</td></tr>
      <tr><td>Population range (people)</td><td>${fmt(O.range_people)}</td><td>${fmt(E.range_people)}</td></tr>
    </tbody></table>
    ${s.seats > 1 ? `<div class="panel-h">District lean, sorted</div><div class="chart" id="stripChart"></div>` : ""}
    ${s.ensemble.length > 1 ? `<div class="panel-h">Candidate plans (${s.candidates} distinct, ${s.gate} eligible)</div>
      <div class="chart" id="ensChart"></div>
      <p class="note">Each dot is one of the formula's deterministic candidate plans. Filled dots are eligible: they meet the population and contiguity constraints, the county tier and the 5% compactness gate. Of those, the one with partisan bias closest to zero is selected (ringed). Hover a dot for its details.</p>` : ""}
    ${s.seats > 1 ? `<div class="panel-h">Fairness ledger · partisan bias by election year</div>
    <table class="cmp"><thead><tr><th>Year</th><th>Formula</th><th>Enacted</th></tr></thead><tbody>
      ${years.map((y) => `<tr><td>20${y}</td><td>${favor(O.elections[y].bias, 0, "% seats")}</td><td>${favor(E.elections[y].bias, 0, "% seats")}</td></tr>`).join("")}
    </tbody></table>` : ""}
    <div class="panel-h">Validation checklist (formula plan)</div>
    <ul class="checks">${O.checks.map(checkItem).join("")}</ul>
    <div class="panel-h">Verify it yourself</div>
    <p class="note"><a href="data/plans/${s.abbr}.json" download>Certificate (centers, weights, county rule, refinement log)</a> · <a href="data/plans/${s.abbr}.csv.gz" download>Census-block assignment file (.csv.gz)</a><br>
    Selected candidate #${s.chosen_seed} (seed angle ${(7.5 * s.chosen_seed).toFixed(1)}°). ${s.partisan_step
      ? "Chosen by the symmetric partisan-bias rule among eligible plans."
      : "State law bars partisan data here, so the most compact eligible plan was chosen; no election data were used."}
    ${s.prison_adjusted ? " This state counts prisoners at home addresses, so its enacted map was balanced on adjusted counts; its raw-count range is not a defect." : ""} Without the county rule, straight lines alone would split ${s.pure_splits} counties.</p>`;
  if (s.seats > 1) drawStrip(s);
  if (s.ensemble.length > 1) drawEnsemble(s);
}

const ORIGIN = window.ORIGIN, ORIGIN_DEFAULT = window.ORIGIN_DEFAULT;

function districtWhy(s, plan, i, formula) {
  const det = plan.detail && plan.detail[i];
  if (!det) return "";
  const pctf = (x) => (100 * x).toFixed(x < 0.1 ? 1 : 0) + "%";
  const name = formula ? `District ${i + 1}` : `District ${s.enacted_labels[i] === "00" ? "AL" : +s.enacted_labels[i]}`;
  const other = formula ? "today's (2026) District" : "Neutral Lines District";
  const lines = [];
  lines.push(`<b>${fmt(plan.pop[i])}</b> people${formula ? `, ${plan.dev[i] >= 0 ? "+" : ""}${plan.dev[i]} from the exact ideal` : ""}.`);
  if (det.whole_n) lines.push(`<b>Whole counties (${det.whole_n})</b>: ${det.whole.map(esc).join(", ")}${det.whole_n > det.whole.length ? ", …" : ""}.`);
  if (det.split.length) lines.push(`<b>Shares of split counties</b>: ` + det.split.map(([n, sh, why]) =>
    `${esc(n)} (${pctf(sh)} of its people${why ? "; " + why : ""})`).join("; ") + ".");
  if (det.munis_n) lines.push(`<b>Municipalities divided at this district's edge (${det.munis_n})</b>: ${det.munis.map(esc).join(", ")}${det.munis_n > det.munis.length ? ", …" : ""}${formula ? ". Each was opened only after keeping it whole left districts unequal." : "."}`);
  if (det.precincts) lines.push(`<b>Split precincts</b>: ${det.precincts}${formula ? ", where boundary blocks were moved to reach exact equality." : "."}`);
  if (det.overlap.length) lines.push(`<b>Where its residents are ${formula ? "today" : "under Neutral Lines"}</b>: ` +
    det.overlap.map(([l, sh]) => `${pctf(sh)} in ${other} ${l}`).join(", ") + ".");
  return `<div class="annfocus"><b>Why ${name} looks like this</b><ul class="why">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
    ${formula ? `<span class="note">Rule: counties whole first, then municipalities, then precincts, then single blocks; every split above was needed for equal population or contiguity, and lines elsewhere sit where the compactness formula puts them.</span>` : ""}</div>`;
}

const CHECK = {
  pass: ["✓", "Pass"], justified: ["≈", "Justified"], review: ["!", "Review"], fail: ["✕", "Fail"],
};
function checkItem(c) {
  const [icon, word] = CHECK[c.status] || ["?", c.status];
  return `<li class="check ${c.status}"><span class="ic" aria-hidden="true">${icon}</span><span><b>${esc(c.label)}</b> <span class="st">${word}</span><br><span class="note">${esc(c.detail)}</span></span></li>`;
}

function seatsFavor(x) {
  if (Math.abs(x) < 0.05) return "0";
  return (x > 0 ? "R+" : "D+") + Math.abs(x).toFixed(1) + " seats";
}

function drawStrip(s) {
  const el = document.getElementById("stripChart");
  const w = 320, h = 92, m = { l: 62, r: 10, t: 6, b: 22 };
  const x = d3.scaleLinear().domain([0, 1]).range([m.l, w - m.r]);
  const rows = [["Formula", s.ours.elections.comp.shares], ["Enacted", s.enacted.elections.comp.shares]];
  const y = (i) => m.t + 16 + i * 30;
  const sc = leanScale();
  let g = `<line x1="${x(0.5)}" x2="${x(0.5)}" y1="${m.t}" y2="${h - m.b}" stroke="${css("--axis")}" stroke-dasharray="3 3"/>`;
  rows.forEach(([name, sh], i) => {
    g += `<text class="lab" x="${m.l - 8}" y="${y(i)}" text-anchor="end" dominant-baseline="central">${name}</text>`;
    g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(i)}" y2="${y(i)}" stroke="${css("--grid")}"/>`;
    sh.slice().sort((a, b) => a - b).forEach((v) => {
      g += `<circle cx="${x(v)}" cy="${y(i)}" r="5" fill="${sc(v)}" stroke="${css("--surface")}" stroke-width="2"><title>${name}: ${lean(v)}</title></circle>`;
    });
  });
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    g += `<text class="lab" x="${x(t)}" y="${h - 6}" text-anchor="middle" style="fill:${css("--muted")};font-size:10px">${t === 0.5 ? "50%" : (t * 100) + "% D"}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Democratic share of each district, formula vs enacted">${g}</svg>`;
}

function drawEnsemble(s) {
  const el = document.getElementById("ensChart");
  const pts = s.ensemble;
  const w = 320, h = 190, m = { l: 46, r: 12, t: 10, b: 34 };
  const xmin = Math.min(0.995, d3.min(pts, (d) => d.moi) * 0.995);
  const xmax = Math.max(1.08, d3.max(pts, (d) => d.moi) * 1.01);
  const x = d3.scaleLinear().domain([xmin, xmax]).range([m.l, w - m.r]);
  const yext = d3.max(pts, (d) => Math.abs(d.bias)) || 0.1;
  const y = d3.scaleLinear().domain([-yext * 1.15, yext * 1.15]).range([h - m.b, m.t]);
  const ink = css("--ink"), muted = css("--muted");
  let g = "";
  y.ticks(4).forEach((t) => {
    g += `<line class="gridline" x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${css("--grid")}"/>`;
    g += `<text x="${m.l - 6}" y="${y(t)}" text-anchor="end" dominant-baseline="central" style="fill:${muted};font-size:10px">${favor(t, 0, "")}</text>`;
  });
  x.ticks(4).forEach((t) => {
    g += `<text x="${x(t)}" y="${h - m.b + 14}" text-anchor="middle" style="fill:${muted};font-size:10px">${t.toFixed(2)}×</text>`;
  });
  g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="${css("--axis")}"/>`;
  g += `<text x="${(m.l + w - m.r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:${muted};font-size:10px">Spread vs. most compact eligible plan</text>`;
  g += `<text transform="translate(10,${(m.t + h - m.b) / 2}) rotate(-90)" text-anchor="middle" style="fill:${muted};font-size:10px">Partisan bias (seats)</text>`;
  pts.slice().sort((a, b) => a.chosen - b.chosen).forEach((d) => {
    g += `<circle cx="${x(d.moi)}" cy="${y(d.bias)}" r="${d.chosen ? 6 : 4.5}" fill="${d.gated ? css("--accent") : css("--surface")}" stroke="${d.gated ? css("--surface") : muted}" stroke-width="${d.gated ? 2 : 1.5}">
      <title>Candidate #${d.seed}: ${d.moi.toFixed(3)}× spread, bias ${favor(d.bias, 0, "% seats")}, ${d.seatsD} D-leaning seats, ${d.splits} county splits${d.chosen ? " (selected)" : ""}</title></circle>`;
    if (d.chosen) g += `<circle cx="${x(d.moi)}" cy="${y(d.bias)}" r="10" fill="none" stroke="${ink}" stroke-width="2"/>
      <text x="${x(d.moi) + 13}" y="${y(d.bias)}" dominant-baseline="central" style="fill:${ink};font-size:10.5px;font-weight:600">selected</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Candidate plans: compactness vs partisan bias">${g}</svg>`;
}


// ---------------------------------------------------------------- adoption outlook
const PATHS = {
  // Citizen-initiated constitutional amendment (Ballotpedia); MS de facto suspended, IL limited.
  ica: ["AZ", "AR", "CA", "CO", "FL", "MA", "MI", "MO", "MT", "NE", "NV", "ND", "OH", "OK", "OR", "SD"],
  // Initiated statute only (no constitutional initiative)
  ist: ["AK", "ID", "ME", "UT", "WA", "WY"],
  // Existing commission with a role in congressional maps
  com: ["AZ", "CA", "CO", "HI", "ID", "MI", "MT", "NJ", "NY", "VA", "WA", "OH", "UT"],
};

function outlook(s) {
  const path = PATHS.ica.includes(s.abbr) ? [3, "Citizen amendment"]
    : PATHS.ist.includes(s.abbr) ? [2, "Citizen statute"]
    : PATHS.com.includes(s.abbr) ? [2, "Commission"]
    : [0, "Legislature only"];
  const shift = s.ours.elections.comp.seatsD - s.enacted.elections.comp.seatsD;
  const shock = [3, 2, 1][Math.abs(shift)] ?? 0;
  const clean = s.ours.checks.every((c) => c.status === "pass" || c.status === "justified") ? 1 : 0;
  const score = path[0] + shock + clean;
  return { path: path[1], shift, score, clean, level: score >= 6 ? "High" : score >= 4 ? "Medium" : "Low" };
}

function renderAdoption() {
  const S = state.data.summary.states.filter((s) => s.seats > 1).map((s) => ({ s, o: outlook(s) }))
    .sort((x, y) => y.o.score - x.o.score || x.s.name.localeCompare(y.s.name));
  const shiftTxt = (v) => v === 0 ? "none" : (v > 0 ? `+${v} D` : `+${-v} R`);
  document.getElementById("adoptTable").innerHTML = `<thead><tr><th>State</th><th class="n">Seats</th><th>Path</th>
    <th class="n">Seat shift vs 2026 map</th><th class="n">Checklist clean</th><th class="n">Score</th><th>Outlook</th></tr></thead><tbody>` +
    S.map(({ s, o }) => `<tr data-st="${s.abbr}"><td><a href="state.html?st=${s.abbr}">${esc(s.name)}</a></td><td class="n">${s.seats}</td><td>${o.path}</td>
      <td class="n">${shiftTxt(o.shift)}</td><td class="n">${o.clean ? "yes" : "no"}</td><td class="n">${o.score}</td>
      <td><span class="mini ${o.level === "High" ? "pass" : o.level === "Medium" ? "justified" : "review"}" aria-hidden="true">${o.level[0]}</span> ${o.level}</td></tr>`).join("") + "</tbody>";
  document.getElementById("adoptTable").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-st]");
    if (tr && !e.target.closest("a")) { selectState(tr.dataset.st); document.getElementById("map-section").scrollIntoView(); }
  });

  // Compact: pair states whose seat shifts offset (greedy, largest first).
  const dSide = S.filter((x) => x.o.shift > 0).sort((a, b) => b.o.shift - a.o.shift);
  const rSide = S.filter((x) => x.o.shift < 0).sort((a, b) => a.o.shift - b.o.shift);
  const totD = d3.sum(dSide, (x) => x.o.shift), totR = -d3.sum(rSide, (x) => x.o.shift);
  const pairs = [];
  let i = 0, j = 0, bd = 0, br = 0;
  const groupD = [], groupR = [];
  while (i < dSide.length || j < rSide.length) {
    if ((bd <= br && i < dSide.length) || j >= rSide.length) { groupD.push(dSide[i]); bd += dSide[i].o.shift; i++; }
    else { groupR.push(rSide[j]); br += -rSide[j].o.shift; j++; }
    if (bd === br && bd > 0) { pairs.push([groupD.splice(0), groupR.splice(0), bd]); bd = br = 0; }
  }
  const names = (g) => g.map((x) => x.s.abbr).join(" + ");
  document.getElementById("compact").innerHTML = `
    <p>On the 2016–20 composite, the formula would move <b>${totD}</b> seat(s) toward Democrats in states whose current maps lean Republican, and <b>${totR}</b> toward Republicans in states whose maps lean Democratic. Balanced blocs (each side's shift equal) that could join together:</p>
    <ul>${pairs.map(([gd, gr, n]) => `<li><b>${names(gd)}</b> ⇄ <b>${names(gr)}</b> (${n} seat${n > 1 ? "s" : ""} each way)</li>`).join("") || "<li>No exact offsets in the current data.</li>"}</ul>
    ${(groupD.length || groupR.length) ? `<p class="note">Unmatched remainder: ${names(groupD) || "none"} / ${names(groupR) || "none"}.</p>` : ""}
    <p class="note">States with no seat shift (${S.filter((x) => x.o.shift === 0).map((x) => x.s.abbr).join(", ")}) can join at any time without changing the balance.</p>`;
}

// ---------------------------------------------------------------- results
function renderFindings() {
  const n = nationals();
  const S = state.data.summary.states.filter((s) => s.seats > 1);
  const absBias = (p) => d3.mean(S.filter((s) => s.seats >= 4), (s) => Math.abs(s[p].elections.comp.bias));
  const fewerSplits = S.filter((s) => s.ours.county_splits < s.enacted.county_splits).length;
  const moreCompact = S.filter((s) => d3.mean(s.ours.pp) > d3.mean(s.enacted.pp)).length;
  const lowerBias = S.filter((s) => s.seats >= 4 && Math.abs(s.ours.elections.comp.bias) < Math.abs(s.enacted.elections.comp.bias)).length;
  const higherBias = S.filter((s) => s.seats >= 4 && Math.abs(s.ours.elections.comp.bias) > Math.abs(s.enacted.elections.comp.bias)).length;
  const big = S.filter((s) => s.seats >= 4).length;
  document.getElementById("findings").innerHTML = `
    <p><b>Shape.</b> The formula's districts average a Polsby–Popper score of ${n.oursPP.toFixed(2)}, against ${n.enPP.toFixed(2)} for the enacted maps, and are more compact in ${moreCompact} of the ${S.length} multi-district states.</p>
    <p><b>Equal population.</b> Every plan is built from census blocks. In ${n.exact} of 50 states the largest and smallest districts differ by at most one person; the widest gap anywhere is ${n.maxRange} people, left by the rule's refusal to split an extra county or municipality just to move a handful of residents.</p>
    <p><b>Boundaries on the ground.</b> Every line follows a county, municipal, precinct or census-block boundary. Nationally the formula splits ${fmt(n.oursSplits)} counties (enacted maps: ${fmt(n.enSplits)}), ${fmt(n.oursMuni)} municipalities (${fmt(n.enMuni)}) and ${fmt(n.oursPrec)} precincts (${fmt(n.enPrec)}). It splits fewer counties in ${fewerSplits} of ${S.length} multi-district states.</p>
    <p><b>Partisan symmetry.</b> In the ${big} states with four or more seats, the average absolute partisan bias is ${pct(absBias("ours"))} of seats under the formula and ${pct(absBias("enacted"))} under the enacted maps. The formula is closer to symmetric in ${lowerBias} of them and further in ${higherBias}. Summed across all states, bias at a 50–50 vote is ${seatsFavor(n.oursBias)} for the formula and ${seatsFavor(n.enBias)} for the enacted maps.</p>
    <p><b>Seats.</b> On the 2016–20 statewide composite, the formula gives ${n.oursD} Democratic-leaning and ${435 - n.oursD} Republican-leaning districts. The enacted 2026 maps give ${n.enD} and ${435 - n.enD}, and strict state-by-state proportionality would give about ${n.propD.toFixed(0)} Democratic seats. The formula does not aim at proportionality, and the gap that remains largely reflects where voters live.</p>
    <p><b>Representation of minority communities.</b> The formula produces ${n.oursMM} majority-minority districts, against ${n.enMM} in the enacted maps. That is the honest cost of race-blind drawing, and it is why the method includes a formulaic remedy for any court-ordered Voting Rights Act district.</p>`;
}

function renderTable() {
  const S = state.data.summary.states;
  const cols = [
    ["State", (s) => s.name, (s) => s.name, false],
    ["Seats", (s) => s.seats, (s) => s.seats, true],
    ["Lean", (s) => s.ours.elections.comp.V, (s) => lean(s.ours.elections.comp.V), true],
    ["D seats F", (s) => s.ours.elections.comp.seatsD, (s) => s.ours.elections.comp.seatsD, true],
    ["D seats E", (s) => s.enacted.elections.comp.seatsD, (s) => s.enacted.elections.comp.seatsD, true],
    ["Prop.", (s) => s.seats * s.ours.elections.comp.V, (s) => (s.seats * s.ours.elections.comp.V).toFixed(1), true],
    ["Bias F", (s) => s.ours.elections.comp.bias, (s) => favor(s.ours.elections.comp.bias, 0, ""), true],
    ["Bias E", (s) => s.enacted.elections.comp.bias, (s) => favor(s.enacted.elections.comp.bias, 0, ""), true],
    ["Cty F", (s) => s.ours.county_splits, (s) => s.ours.county_splits, true],
    ["Cty E", (s) => s.enacted.county_splits, (s) => s.enacted.county_splits, true],
    ["Muni F", (s) => s.ours.muni_splits, (s) => s.ours.muni_splits, true],
    ["Muni E", (s) => s.enacted.muni_splits, (s) => s.enacted.muni_splits, true],
    ["Prec F", (s) => s.has_vtd ? s.ours.precinct_splits : -1, (s) => s.has_vtd ? s.ours.precinct_splits : "–", true],
    ["Prec E", (s) => s.has_vtd ? s.enacted.precinct_splits : -1, (s) => s.has_vtd ? s.enacted.precinct_splits : "–", true],
    ["PP F", (s) => d3.mean(s.ours.pp), (s) => d3.mean(s.ours.pp).toFixed(2), true],
    ["PP E", (s) => d3.mean(s.enacted.pp), (s) => d3.mean(s.enacted.pp).toFixed(2), true],
    ["MM F", (s) => s.ours.mm_districts, (s) => s.ours.mm_districts, true],
    ["MM E", (s) => s.enacted.mm_districts, (s) => s.enacted.mm_districts, true],
    ["Range", (s) => s.ours.range_people, (s) => s.ours.range_people, true],
    ["Checks", (s) => s.ours.checks.filter((c) => c.status === "pass").length,
      (s) => s.ours.checks.map((c) => `<span class="mini ${c.status}" title="${esc(c.label)}: ${esc(c.detail)}">${(CHECK[c.status] || ["?"])[0]}</span>`).join(""), false],
  ];
  const tips = {
    "Lean": "Statewide two-party lean, 2016–20 statewide races", "D seats F": "Democratic-leaning districts, formula",
    "D seats E": "Democratic-leaning districts, enacted 2026 map", "Prop.": "Seats × Democratic vote share",
    "Bias F": "Partisan bias at 50–50 (percent of seats), formula", "Bias E": "Partisan bias at 50–50, enacted",
    "Cty F": "Counties split, formula", "Cty E": "Counties split, enacted", "Muni F": "Municipalities split, formula",
    "Muni E": "Municipalities split, enacted", "Prec F": "Precincts (VTDs) split, formula", "Prec E": "Precincts split, enacted",
    "Checks": "Validation checklist for the formula plan (hover each mark)", "PP F": "Average Polsby–Popper, formula",
    "PP E": "Average Polsby–Popper, enacted", "MM F": "Majority-minority districts, formula",
    "MM E": "Majority-minority districts, enacted", "Range": "People between the largest and smallest district, formula plan (census blocks)",
  };
  let sortI = 1, dir = -1;
  const table = document.getElementById("statesTable");
  const draw = () => {
    const rows = S.slice().sort((a, b) => {
      const va = cols[sortI][1](a), vb = cols[sortI][1](b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir || a.name.localeCompare(b.name);
    });
    table.innerHTML = `<thead><tr>${cols.map((c, i) =>
      `<th class="${c[3] ? "n" : ""}" title="${tips[c[0]] || ""}" data-i="${i}" ${i === sortI ? `aria-sort="${dir > 0 ? "ascending" : "descending"}"` : ""}>${c[0]}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((s) => `<tr data-st="${s.abbr}">${cols.map((c) => `<td class="${c[3] ? "n" : ""}">${c[2](s)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  };
  table.addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (th) { const i = +th.dataset.i; dir = i === sortI ? -dir : (i === 0 ? 1 : -1); sortI = i; draw(); return; }
    const tr = e.target.closest("tr[data-st]");
    if (tr) { selectState(tr.dataset.st); document.getElementById("map-section").scrollIntoView(); }
  });
  draw();
}

renderStatic();
renderRefs();
fillCites(document.body);
})();
