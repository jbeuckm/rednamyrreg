/* "Fair from every side": perspectives, legality by state, and the assessment
   of the 2025-26 maps, computed from docs/data/summary.json. */
(() => {
"use strict";

const root = document.documentElement;
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch (e) {}
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
document.getElementById("themeBtn").addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = d3.format(",");
const pct = (x, d = 0) => (100 * x).toFixed(d) + "%";
const favor = (x, unit = "%") => {
  const v = 100 * x;
  return Math.abs(v) < 0.05 ? "0" : (v > 0 ? "R+" : "D+") + Math.abs(v).toFixed(1) + unit;
};
const seatsFavor = (x) => Math.abs(x) < 0.05 ? "0 seats" : (x > 0 ? "R+" : "D+") + Math.abs(x).toFixed(1) + " seats";

// ---- citations (same library as the main page)
const REF_INDEX = new Map((window.REFS || []).map((r, i) => [r[0], i + 1]));
const cites = (keys) => keys.map((k) => `<a class="cite" data-ref="${k}"></a>`).join("");
function fillCites(el) {
  el.querySelectorAll("a.cite[data-ref]").forEach((a) => {
    const n = REF_INDEX.get(a.dataset.ref);
    if (!n) { a.remove(); return; }
    const ref = window.REFS[n - 1];
    a.textContent = `[${n}]`;
    a.href = `#ref-${ref[0]}`;
    a.title = ref[1].replace(/<[^>]+>/g, "");
  });
}
document.getElementById("refList").innerHTML = (window.REFS || []).map(([k, text, url]) =>
  `<li id="ref-${k}">${text} <a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, "").slice(0, 70)}${url.length > 78 ? "…" : ""}</a></li>`).join("");

const CHECK = { pass: ["✓", "Pass"], justified: ["≈", "Justified"], review: ["!", "Review"], fail: ["✕", "Fail"] };
const mark = (c) => c ? `<span class="mini ${c.status}" title="${esc(c.label)}: ${esc(c.detail)}">${CHECK[c.status][0]}</span>` : "–";

// State-law notes that the automated checks don't capture on their own.
const NO_PARTISAN = ["IA", "MT", "NE", "NM", "CA", "FL"];
const STATE_LAW = {
  IA: ["Iowa Code §42.4 puts whole counties ahead of exact equality (up to 1%) and bars political data. The partisan step is off; an Iowa module (whole counties within 1%) is still needed.", ["iowa-424"]],
  OH: ["Ohio Art. XIX caps county splits (at most 18 split once and 5 split more than once) and requires a county larger than one district to contain a whole district. See the Ohio check.", ["oh-xix"]],
  CA: ["The partisan step is off (California law bars considering party).", ["ca-xxi"]],
  FL: ["The partisan step is off (Fair Districts tier 1 forbids intent to favor a party).", ["fl-iii20"]],
  MT: ["The partisan step is off (Montana bars previous election results).", ["levitt"]],
  NE: ["The partisan step is off (Nebraska bars political data).", ["ncsl-criteria"]],
  NM: ["The partisan step is off. The New Mexico committee may not split precincts; the formula still splits some, so a module is needed.", ["nm-13a7"]],
  MI: ["Michigan requires accepted measures of partisan fairness; the symmetry step fits, but the state's named measures should be reported.", ["mi-iv6"]],
  CO: ["Colorado requires competitiveness analysis, and precincts may not span districts (they would be re-precincted).", ["co-precinct", "ncsl-criteria"]],
  UT: ["Utah's Prop 4 requires partisan-symmetry testing; the selection step uses symmetry.", ["ut-2025"]],
  AZ: ["Arizona allows partisan data only to test maps after drawing, which is exactly the formula's two-phase design.", ["airc", "ncsl-criteria"]],
  WA: ["Washington keeps precincts whole where practicable and allows contiguity by ferry or bridge.", ["wa-rcw"]],
  PA: ["The Pennsylvania Supreme Court's standard: do not divide counties, cities, boroughs, townships or wards except as needed for equality.", ["pa-2018"]],
};

d3.json("data/summary.json").then((summary) => {
  const S = summary.states;
  const multi = S.filter((s) => s.seats > 1);
  const sum = (f, arr = S) => arr.reduce((a, s) => a + f(s), 0);
  const competitive = (plan) => sum((s) => s[plan].elections.comp.shares.filter((x) => Math.abs(x - 0.5) < 0.05).length);
  const mm = (plan, key) => sum((s) => (key ? s[plan][key] : s[plan].minority).filter((x) => x > 0.5).length);
  const N = {
    oursD: sum((s) => s.ours.elections.comp.seatsD), enD: sum((s) => s.enacted.elections.comp.seatsD),
    propD: sum((s) => s.seats * s.ours.elections.comp.V),
    oursBias: sum((s) => s.seats * s.ours.elections.comp.bias), enBias: sum((s) => s.seats * s.enacted.elections.comp.bias),
    compO: competitive("ours"), compE: competitive("enacted"),
    mmO: mm("ours"), mmE: mm("enacted"), bO: mm("ours", "black"), bE: mm("enacted", "black"),
    hO: mm("ours", "hisp"), hE: mm("enacted", "hisp"),
    cO: sum((s) => s.ours.county_splits), cE: sum((s) => s.enacted.county_splits),
    mO: sum((s) => s.ours.muni_splits), mE: sum((s) => s.enacted.muni_splits),
    pO: sum((s) => s.ours.precinct_splits), pE: sum((s) => s.enacted.precinct_splits),
    ppO: d3.mean(S.flatMap((s) => s.ours.pp)), ppE: d3.mean(S.flatMap((s) => s.enacted.pp)),
    exact: S.filter((s) => s.ours.range_people <= 1).length, maxRange: d3.max(S, (s) => s.ours.range_people),
    contig: S.filter((s) => d3.max(s.ours.pieces) === 1).length,
  };
  // How much of each new district comes from a single current district (population-weighted).
  let keep = 0, tot = 0;
  multi.forEach((s) => (s.ours.detail || []).forEach((d, i) => {
    if (d.overlap.length) { keep += d.overlap[0][1] * s.ours.pop[i]; tot += s.ours.pop[i]; }
  }));
  N.core = tot ? keep / tot : null;
  const shift = (s) => s.ours.elections.comp.seatsD - s.enacted.elections.comp.seatsD;
  const toD = multi.filter((s) => shift(s) > 0), toR = multi.filter((s) => shift(s) < 0);
  const nStates = S.length;
  const partial = nStates < 50 ? ` (${nStates} of 50 states computed so far)` : "";

  document.getElementById("fairTiles").innerHTML = [
    [`${N.oursD} / ${N.enD}`, `Democratic-leaning seats: formula / 2026 maps${partial} (strict proportionality ≈ ${N.propD.toFixed(0)})`],
    [`${seatsFavor(N.oursBias)}`, `summed partisan bias at a 50–50 vote, formula (2026 maps: ${seatsFavor(N.enBias)})`],
    [`${N.compO} / ${N.compE}`, `competitive districts (within 5 points of even): formula / 2026 maps`],
    [`${N.mmO} / ${N.mmE}`, `majority-minority districts: formula / 2026 maps`],
  ].map(([v, l]) => `<div class="tile"><div class="v num">${v}</div><div class="l">${l}</div></div>`).join("");

  const card = (title, concern, offer, cost, refs = []) => `<div class="card"><h4>${title}</h4>
    <p><b>Their concern.</b> ${concern}</p><p style="margin-top:6px"><b>What Neutral Lines offers.</b> ${offer}</p>
    <div class="proof"><b>What it costs them.</b> ${cost}${cites(refs)}</div></div>`;
  const names = (arr) => arr.map((s) => s.abbr).join(", ") || "none";
  document.getElementById("perspectiveCards").innerHTML = [
    card("Republican voters and officials",
      "Election data in the selection step could tilt maps; Democratic gerrymanders (e.g., Illinois, Maryland) must be undone too, and 2025–26 gains should not be surrendered alone.",
      `Drawing is blind to party. Compact maps reflect geography, which tends to help Republicans where Democrats cluster in cities. The selection step only chooses among already-compact plans and is switched off in ${NO_PARTISAN.join(", ")}. Adoption is paired across states, so the states where the formula moves seats toward Republicans (${names(toR)}) join alongside those where it moves seats the other way.`,
      `Relative to the 2026 maps, the formula moves seats toward Democrats in ${names(toD)}. Nationally it has ${Math.abs(N.oursD - N.enD)} ${N.oursD > N.enD ? "more" : "fewer"} Democratic-leaning seats than the 2026 maps. Some of those maps were drawn by legislatures for partisan advantage, others by commissions or courts.`, ["chen-rodden", "king-amicus"]),
    card("Democratic voters and officials",
      "Neutral compact maps systematically under-represent clustered urban voters; disarming while other states gerrymander; losing majority-minority districts.",
      `The symmetry step pushes toward equal treatment at a 50–50 vote (summed bias ${seatsFavor(N.oursBias)} under the formula vs ${seatsFavor(N.enBias)} for the 2026 maps), and mid-decade redraws end. Adoption is paired, so no state disarms alone.`,
      `Relative to the 2026 maps, seats move toward Republicans in ${names(toR)}, including some states whose current maps were drawn by commissions or courts. Compactness and geography still cost Democrats in some states (Chen & Rodden), and race-blind drawing yields ${N.mmO} majority-minority districts against ${N.mmE} today.`, ["chen-rodden", "sabato"]),
    card("Independent and third-party voters",
      "Safe seats for both parties; a process run by and for the two parties.",
      `No one draws the lines: the rule is fixed before the data and anyone can verify it. The formula yields ${N.compO} competitive districts against ${N.compE} in the 2026 maps.`,
      "Competitiveness is not an objective of the formula. It emerges from geography, and some states have few competitive seats either way.", ["airc"]),
    card("Black, Latino and Asian American communities",
      "Race-blind compact maps can divide or dilute communities, especially in the South, where voting is racially polarized; <i>Callais</i> has narrowed federal protection.",
      "Race is never an input, so the plan cannot be a racial gerrymander. Where a court finds Section 2 liability, the remedy stays formulaic: lock the court-ordered district and rerun the formula on the rest of the state.",
      `Majority-Black districts: ${N.bO} under the formula vs ${N.bE} today; majority-Hispanic: ${N.hO} vs ${N.hE}. That is the main cost of race-blind drawing, and it is reported here rather than hidden.`, ["callais", "crs-callais", "gingles", "milligan"]),
    card("Rural voters",
      "Rural counties are carved up to pad urban districts, and representatives are remote.",
      `Counties stay whole unless equality requires a split: ${fmt(N.cO)} county splits nationally vs ${fmt(N.cE)} in the 2026 maps. Compact districts keep representatives' areas contiguous and as small as population allows.`,
      "Sparse areas still need very large districts; no rule can change that.", ["ncsl-criteria"]),
    card("Urban and suburban voters",
      "Cities are split to dilute them or packed to waste votes.",
      `Municipalities are kept whole after counties: ${fmt(N.mO)} municipal splits vs ${fmt(N.mE)} today. Cities larger than a district are divided along precinct lines, not through neighborhoods.`,
      "Large cities still span several districts, and a city's districts may lean less heavily one way than a packed map would make them.", ["pa-2018"]),
    card("County, city and town officials",
      "Split jurisdictions mean several representatives and more work coordinating with them.",
      "County, then municipality, then precinct are kept whole, in that order, by rule, and every split is logged with its reason in the published certificate.",
      "A few splits are unavoidable for equal population. In Connecticut and Michigan, the enacted maps split fewer towns than the formula does.", ["levitt"]),
    card("Election administrators",
      "Split precincts multiply ballot styles and errors; tiny pieces threaten ballot secrecy; plans arrive late.",
      `Precincts stay whole whenever possible: ${fmt(N.pO)} split precincts vs ${fmt(N.pE)} today. The plan arrives as a standard block assignment file, and the rule can run the day census data are released.`,
      "Exact equality still requires splitting some precincts along each district border, and the checklist flags any piece with 1–99 residents.", ["nc-precincts", "ok-fiscal", "ma-galvin"]),
    card("Incumbents",
      "Their districts change, and they may be paired with colleagues.",
      N.core != null ? `On average ${pct(N.core)} of a new district's residents come from a single current district, so most constituencies carry over.` : "Constituency carry-over is computed from the block files.",
      "Incumbents' addresses are never considered, so some members will be paired. Several states' laws already require this neutrality.", ["ca-xxi", "iowa-424"]),
    card("Courts",
      "They need neutral, manageable standards; after <i>Rucho</i>, federal courts don't hear partisan claims.",
      `Every requirement is a published, automated check: population (${N.exact} of ${nStates} states within one person; widest gap ${N.maxRange} people), contiguity on true geometry (${N.contig} of ${nStates} states pass), and splits. Courts can use the plan as a neutral benchmark or remedial map.`,
      "Where the formula is worse than an enacted map on a criterion, the checklist says so, and opposing counsel will cite it.", ["rucho", "tennant", "moore"]),
  ].join("");

  // ---- legality table
  const get = (s, id) => s.ours.checks.find((c) => c.id === id);
  const lt = document.getElementById("legalTable");
  lt.innerHTML = `<thead><tr><th>State</th><th class="n">Seats</th><th>Population</th><th>Contiguity</th><th>Compactness</th>
    <th>Splits: county / municipality / precinct (formula vs 2026)</th><th>State-law fit</th><th>How today's map was made</th></tr></thead><tbody>` +
    S.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
      const law = STATE_LAW[s.abbr];
      const oh = get(s, "ohio"), ia = get(s, "iowa");
      const origin = window.ORIGIN[s.abbr] || window.ORIGIN_DEFAULT;
      const pop = get(s, "population");
      return `<tr data-st="${s.abbr}"><td>${esc(s.name)}</td><td class="n">${s.seats}</td>
        <td>${mark(pop)} ${s.ours.range_people} ppl</td><td>${mark(get(s, "contiguity"))}</td><td>${mark(get(s, "compactness"))}</td>
        <td>${s.ours.county_splits}/${s.ours.muni_splits}/${s.has_vtd ? s.ours.precinct_splits : "–"} vs ${s.enacted.county_splits}/${s.enacted.muni_splits}/${s.has_vtd ? s.enacted.precinct_splits : "–"}</td>
        <td>${oh ? mark(oh) + " " : ""}${ia ? mark(ia) + " " : ""}${law ? law[0] + cites(law[1]) : (s.partisan_step ? "No conflicting state rule found; partisan step on." : "Partisan step off.")}</td>
        <td class="note">${origin[0]}${cites(origin[1])}</td></tr>`;
    }).join("") + "</tbody>";
  lt.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-st]");
    if (tr && !e.target.closest("a")) location.href = `index.html?state=${tr.dataset.st}#map-section`;
  });

  // ---- 2026 redraws vs formula
  const REDRAWN = { TX: "L: settled for 2026 · C: weak · P: invites retaliation", CA: "L: strong for 2026 · C: mixed (popular vote, partisan aim) · P: sunsets 2030",
    FL: "L: pending appeal (Fair Districts) · C: weak", NC: "L: allowed by federal panel · C: weak", OH: "L: strong (Art. XIX process) · C: bipartisan vote · P: strong",
    UT: "L: strong for 2026 · C: mixed (enforces voter initiative)", AL: "L: strong after Callais · C: weak", LA: "L: strong after Callais · C: weak", TN: "L: injunction denied · C: weak" };
  const rows = Object.keys(REDRAWN).map((ab) => S.find((s) => s.abbr === ab)).filter(Boolean);
  document.getElementById("redrawTable").innerHTML = `<thead><tr><th>State</th><th class="n">D-leaning seats 2026 / formula</th>
    <th class="n">Bias at 50–50: 2026 / formula</th><th class="n">Efficiency gap: 2026 / formula</th><th class="n">County splits 2026 / formula</th><th>Assessment</th><th>How the 2026 map was made</th></tr></thead><tbody>` +
    rows.map((s) => {
      const E = s.enacted.elections.comp, O = s.ours.elections.comp;
      const o = window.ORIGIN[s.abbr] || window.ORIGIN_DEFAULT;
      return `<tr data-st="${s.abbr}"><td>${esc(s.name)}</td><td class="n">${E.seatsD} / ${O.seatsD}</td>
        <td class="n">${favor(E.bias, "%")} / ${favor(O.bias, "%")}</td><td class="n">${favor(E.eg)} / ${favor(O.eg)}</td>
        <td class="n">${s.enacted.county_splits} / ${s.ours.county_splits}</td><td>${REDRAWN[s.abbr]}</td><td class="note">${o[0]}${cites(o[1])}</td></tr>`;
    }).join("") + "</tbody>";
  document.getElementById("redrawTable").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-st]");
    if (tr && !e.target.closest("a")) location.href = `index.html?state=${tr.dataset.st}&plan=enacted#map-section`;
  });
  document.getElementById("redrawNotes").innerHTML = `<p class="note">Bias and efficiency gap: positive R means the map favors Republicans; computed on the 2016–20 statewide composite${cites(["eg", "king-amicus", "vest", "alarm"])}. "L/C/P" = legal, consensus, practical. Missouri, Virginia, Indiana, Maryland and New York did not change maps for 2026${cites(["mo-scotus", "va-2026", "in-2025", "md-2026", "ny-2026"])}.</p>
    <p>The 2025–26 maps are mostly <em>legal</em>: federal courts have withdrawn from partisan claims, and <i>Callais</i> narrowed racial claims. But by their authors' own descriptions most fail the consensus test: each was drawn to add seats for one side, and each provoked a response from the other${cites(["ncsl-tracker", "ap-9states", "sabato"])}.</p>`;
  fillCites(document.body);
}).catch((err) => {
  document.getElementById("perspectiveCards").innerHTML = `<p>Could not load data: ${esc(err.message)}</p>`;
});
fillCites(document.body);
})();
