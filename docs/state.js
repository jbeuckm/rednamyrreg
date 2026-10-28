/* The case for Neutral Lines in one state: built from summary.json and the
   state adoption-process research (data/process/*.json). */
(() => {
"use strict";

const root = document.documentElement;
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch (e) {}
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
document.getElementById("themeBtn").addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
});

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = d3.format(",");
const pct = (x, d = 0) => (100 * x).toFixed(d) + "%";
const lean = (x) => { const m = (x - 0.5) * 200; return Math.abs(m) < 0.05 ? "Even" : (m > 0 ? "D+" : "R+") + Math.abs(m).toFixed(1); };
const seats = (x) => Math.abs(x) < 0.05 ? "no seats" : `${Math.abs(x).toFixed(1).replace(/\.0$/, "")} seat${Math.abs(x) >= 1.05 ? "s" : ""} toward ${x > 0 ? "Republicans" : "Democrats"}`;
const egTxt = (x) => Math.abs(x) < 0.0005 ? "0%" : `${(100 * Math.abs(x)).toFixed(1)}% favoring ${x > 0 ? "Republicans" : "Democrats"}`;
const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || url)}</a>`;

// citations
const REF_INDEX = new Map((window.REFS || []).map((r, i) => [r[0], i + 1]));
const cites = (keys) => (keys || []).map((k) => `<a class="cite" data-ref="${k}"></a>`).join("");
function fillCites(el) {
  el.querySelectorAll("a.cite[data-ref]").forEach((a) => {
    const n = REF_INDEX.get(a.dataset.ref);
    if (!n) { a.remove(); return; }
    const ref = window.REFS[n - 1];
    a.textContent = `[${n}]`; a.href = `#ref-${ref[0]}`; a.title = ref[1].replace(/<[^>]+>/g, "");
  });
}
document.getElementById("refList").innerHTML = (window.REFS || []).map(([k, text, url]) =>
  `<li id="ref-${k}">${text} ${link(url, url.replace(/^https?:\/\//, "").slice(0, 70))}</li>`).join("");

const REDRAWN = { TX: "Aug. 2025", CA: "Nov. 2025 (Prop 50)", NC: "Oct. 2025", OH: "Oct. 2025", UT: "Nov. 2025 (court)",
  FL: "May 2026", AL: "June 2026 (court order)", LA: "May 2026", TN: "May 2026" };
const CHECK = { pass: ["✓", "Pass"], justified: ["≈", "Justified"], review: ["!", "Review"], fail: ["✕", "Fail"] };

const ab = (new URLSearchParams(location.search).get("st") || "NC").toUpperCase();

Promise.all([
  d3.json("data/summary.json"),
  d3.json("data/process/process_a.json").catch(() => ({})),
  d3.json("data/process/process_b.json").catch(() => ({})),
]).then(([summary, pa, pb]) => {
  const S = summary.states;
  const pick = document.getElementById("statePick");
  pick.innerHTML = S.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `<option value="${s.abbr}" ${s.abbr === ab ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  pick.addEventListener("change", () => { location.search = `?st=${pick.value}`; });
  const s = S.find((x) => x.abbr === ab);
  if (!s) { document.getElementById("title").textContent = "State not found"; return; }
  const proc = { ...pa, ...pb }[ab];
  render(s, proc);
  fillCites(document.body);
});

function facts(s) {
  const O = s.ours, E = s.enacted, Oc = O.elections.comp, Ec = E.elections.comp;
  const comp = (pl) => pl.elections.comp.shares.filter((x) => Math.abs(x - 0.5) < 0.05).length;
  let keep = 0, tot = 0;
  (O.detail || []).forEach((d, i) => { if (d.overlap.length) { keep += d.overlap[0][1] * O.pop[i]; tot += O.pop[i]; } });
  return {
    k: s.seats, V: Oc.V, dO: Oc.seatsD, dE: Ec.seatsD,
    bO: Oc.bias * s.seats, bE: Ec.bias * s.seats, egO: Oc.eg, egE: Ec.eg,
    cO: O.county_splits, cE: E.county_splits, mO: O.muni_splits, mE: E.muni_splits,
    pO: O.precinct_splits, pE: E.precinct_splits, ppO: d3.mean(O.pp), ppE: d3.mean(E.pp),
    rO: O.range_people, rE: E.range_people, mmO: O.mm_districts, mmE: E.mm_districts,
    compO: comp(O), compE: comp(E), core: tot ? keep / tot : null,
  };
}

function render(s, proc) {
  const f = facts(s);
  document.title = `${s.name}: The Case for Neutral Lines`;
  document.getElementById("eyebrow").textContent = `${s.name} · The case for Neutral Lines`;
  document.getElementById("title").textContent = s.seats === 1
    ? `${s.name} elects one representative at large.`
    : `${s.name}: fairer lines, kept local, drawn by a rule anyone can check.`;
  document.getElementById("mapLink").href = `index.html?state=${s.abbr}#map-section`;
  const origin = window.ORIGIN[s.abbr] || window.ORIGIN_DEFAULT;
  document.getElementById("lede").innerHTML = s.seats === 1
    ? `With a single seat, ${s.name} has no districts to draw. This page records the process that would apply if it gains a seat after the 2030 census.`
    : `${s.name} has ${s.seats} seats and leans ${lean(f.V)} in 2016–20 statewide races. Today's map: ${origin[0]}${cites(origin[1])} Neutral Lines redraws all ${s.seats} districts with the same national rule used in every state: whole counties, towns and precincts first, then the most compact plan, with no party, race or incumbent data at any step. The result is checked against federal law.`;
  const fails = s.ours.checks.filter((c) => c.status === "fail").length;
  document.getElementById("tiles").innerHTML = s.seats === 1 ? "" : [
    [fails ? `${fails} issue${fails > 1 ? "s" : ""}` : "Legal", fails ? "legal checks still failing" : "passes every federal legal and practical check we run"],
    [`${f.rO} vs ${fmt(f.rE)}`, "people between the largest and smallest district: Neutral Lines vs today"],
    [`${f.cO} vs ${f.cE}`, `counties split (towns ${f.mO} vs ${f.mE}${s.has_vtd ? `; precincts ${f.pO} vs ${f.pE}` : ""})`],
    [`${Math.abs(f.bO) < 0.05 ? "0" : (f.bO > 0 ? "R+" : "D+") + Math.abs(f.bO).toFixed(1)} vs ${Math.abs(f.bE) < 0.05 ? "0" : (f.bE > 0 ? "R+" : "D+") + Math.abs(f.bE).toFixed(1)}`, "seats of partisan tilt at an even vote: Neutral Lines vs today (0 is fair)"],
  ].map(([v, l]) => `<div class="tile"><div class="v num">${v}</div><div class="l">${l}</div></div>`).join("");

  if (s.seats > 1) renderChanges(s, f);
  renderCase(s, f);
  if (s.seats > 1) renderDistricts(s);
  renderLegal(s, proc);
  renderProcess(s, proc);
}

function renderChanges(s, f) {
  const row = (label, o, e, better) => `<tr><td>${label}</td><td>${o}</td><td>${e}</td><td>${better === null ? "" : better ? "✓ Neutral Lines" : "Today's map"}</td></tr>`;
  const dlt = (a, b, lower = true) => a === b ? null : (lower ? a < b : a > b);
  document.getElementById("cmpTable").innerHTML = `<thead><tr><th></th><th>Neutral Lines</th><th>Today's map</th><th>Better on this measure</th></tr></thead><tbody>
    ${row("Democratic-leaning / Republican-leaning seats", `${f.dO} / ${f.k - f.dO}`, `${f.dE} / ${f.k - f.dE}`, null)}
    ${row("Seats proportional to the statewide vote", (f.k * f.V).toFixed(1) + " D", "", null)}
    ${row("Partisan tilt at an even vote", seats(f.bO), seats(f.bE), dlt(Math.abs(f.bO), Math.abs(f.bE)))}
    ${row("Efficiency gap (wasted votes)", egTxt(f.egO), egTxt(f.egE), dlt(Math.abs(f.egO), Math.abs(f.egE)))}
    ${row("Competitive districts (within 5 points)", f.compO, f.compE, dlt(f.compO, f.compE, false))}
    ${row("Population gap, largest minus smallest", `${fmt(f.rO)} people`, `${fmt(f.rE)} people`, dlt(f.rO, f.rE))}
    ${row("Counties split", f.cO, f.cE, dlt(f.cO, f.cE))}
    ${row("Cities and towns split", f.mO, f.mE, dlt(f.mO, f.mE))}
    ${s.has_vtd ? row("Precincts split", f.pO, f.pE, dlt(f.pO, f.pE)) : ""}
    ${row("Average compactness (Polsby–Popper)", f.ppO.toFixed(2), f.ppE.toFixed(2), Math.abs(f.ppO - f.ppE) < 0.01 ? null : f.ppO > f.ppE)}
    ${row("Majority-minority districts", f.mmO, f.mmE, null)}
  </tbody>`;
  document.getElementById("cmpNote").innerHTML = `Partisan figures use the average of every 2016–20 statewide race${cites(["vest", "alarm"])}; tilt is the seat advantage one party would get if the statewide vote were tied${cites(["king-amicus"])}; the efficiency gap counts wasted votes${cites(["eg"])}.${s.prison_adjusted ? ` ${s.name} counts prisoners at their home addresses before redistricting, so today's map was balanced on adjusted counts; its raw-count gap is not a defect.` : ""}`;
}

function renderCase(s, f) {
  const el = document.getElementById("argument");
  if (s.seats === 1) { el.innerHTML = `<p>No districts are drawn in ${s.name} while it has one seat. If it gains a seat, the same rule would apply, along with the state process below.</p>`; return; }
  const pts = [];
  const tiltCut = Math.abs(f.bE) - Math.abs(f.bO);
  const egCut = Math.abs(f.egE) - Math.abs(f.egO);
  if (tiltCut > 0.4 || egCut > 0.03) {
    const who = f.bE > 0 || (Math.abs(f.bE) < 0.05 && f.egE > 0) ? "Republicans" : "Democrats";
    pts.push([tiltCut + egCut * 10, `<h3>It is fairer to voters of both parties</h3><p>At an even statewide vote, today's map would hand ${who} an advantage of about ${seats(f.bE).replace(/ toward.*/, "")}, and its efficiency gap (the imbalance in wasted votes) is ${egTxt(f.egE)}. Neutral Lines brings the tilt to ${seats(f.bO)} and the efficiency gap to ${egTxt(f.egO)}, not by aiming at a result but because it never looks at party while drawing${cites(["king-amicus", "eg"])}.</p>`]);
  }
  pts.push([REDRAWN[s.abbr] ? 6 : 2, `<h3>Nobody chose this map, so nobody can redraw it for advantage</h3><p>The rule is written into law before the census data arrive and is the same in every state. It reads only population and legal boundaries, and of every plan its search found, this is the one that splits the fewest counties and is the most compact. There is no step where anyone, or any party's data, picks among maps. Anyone can rerun it and get the same map.${REDRAWN[s.abbr] ? ` ${s.name} redrew its map in ${REDRAWN[s.abbr]}, mid-decade. Neutral Lines ends that cycle: there is nothing left to redraw until the next census${cites(["ncsl-tracker"])}.` : ""}</p>`]);
  const fewer = [];
  if (f.cO < f.cE) fewer.push(`${f.cE - f.cO} fewer counties`);
  if (f.mO < f.mE) fewer.push(`${f.mE - f.mO} fewer cities and towns`);
  if (s.has_vtd && f.pO < f.pE) fewer.push(`${f.pE - f.pO} fewer precincts`);
  if (fewer.length) pts.push([fewer.length * 2, `<h3>It keeps communities whole</h3><p>Neutral Lines splits ${fewer.join(", ")} than today's map. Counties are kept whole first, then municipalities, then precincts, and every line runs along a county, municipal, precinct or census-block boundary: a road, river or legal border${cites(["census-glossary"])}. Fewer split precincts also means fewer ballot styles and fewer errors at the polls${cites(["nc-precincts", "ok-fiscal"])}.</p>`]);
  if (f.rO + 50 < f.rE) pts.push([3, `<h3>It is more equal: every vote weighs the same</h3><p>Today's districts differ by up to ${fmt(f.rE)} people; Neutral Lines' by ${fmt(f.rO)}${cites(["wesberry", "karcher"])}.</p>`]);
  if (f.compO > f.compE) pts.push([f.compO - f.compE, `<h3>More competitive elections</h3><p>${f.compO} districts are within 5 points of even, against ${f.compE} today, so more voters live in places where their vote can swing the result.</p>`]);
  if (f.ppO > f.ppE + 0.02) pts.push([2, `<h3>Districts you can describe</h3><p>Average compactness rises from ${f.ppE.toFixed(2)} to ${f.ppO.toFixed(2)} (Polsby–Popper): fewer tentacles and fewer districts linking distant towns.</p>`]);
  if (f.mmO >= f.mmE && f.mmE > 0) pts.push([2, `<h3>Minority communities keep their representation</h3><p>The rule is race-blind, and it still yields ${f.mmO} majority-minority districts, against ${f.mmE} today${cites(["callais"])}.</p>`]);
  if (f.core != null && f.core >= 0.6) pts.push([1, `<h3>Low disruption</h3><p>On average ${pct(f.core)} of a new district's residents come from a single current district, so most constituencies carry over.</p>`]);
  pts.sort((a, b) => b[0] - a[0]);
  // Honest counterpoints, with answers.
  const cons = [];
  if (Math.abs(f.bO) > Math.abs(f.bE) + 0.4) cons.push(`<li><b>"It tilts more than today's map."</b> Here, geography alone produces a lean of ${seats(f.bO)}: one party's voters are packed into a few areas${cites(["chen-rodden"])}. Neutral Lines doesn't correct that, because a correction needs a fairness dial, and any dial can be turned toward one side. A national act changes every state at once, and before then the Neutral Lines Compact pairs states so that neither party disarms alone.</li>`);
  if (f.cO > f.cE) cons.push(`<li><b>"It splits more counties."</b> ${f.cO} against ${f.cE}. The extra splits buy exact population equality and compact shapes. The rule is the same everywhere, so it does not trade those for ${s.name}'s particular preferences.</li>`);
  if (f.mO > f.mE) cons.push(`<li><b>"It splits more towns."</b> ${f.mO} against ${f.mE}. Towns are kept whole after counties; where today's map does better, it is because human drawers traded other criteria for it. The rule keeps the order fixed (counties, then towns, then precincts) rather than trading case by case.</li>`);
  if (f.mmO < f.mmE) cons.push(`<li><b>"It reduces majority-minority districts."</b> ${f.mmO} against ${f.mmE}. The rule never uses race, so it cannot be a racial gerrymander${cites(["shaw", "alexander"])}. Where a court finds a Voting Rights Act violation, the remedy stays formulaic: lock the court-ordered district and rerun the rule on the rest${cites(["callais", "gingles"])}.</li>`);
  const shift = f.dO - f.dE;
  const sides = shift === 0
    ? `<p><b>For both parties:</b> the seat balance is unchanged (${f.dO} Democratic-leaning, ${f.k - f.dO} Republican-leaning), so ${s.name} can adopt Neutral Lines without changing who is likely to win, only how the lines are made.</p>`
    : `<p><b>What it means for each party:</b> on 2016–20 statewide results, Neutral Lines has ${Math.abs(shift)} ${shift > 0 ? "more" : "fewer"} Democratic-leaning seat${Math.abs(shift) > 1 ? "s" : ""} than today's map. ${shift > 0 ? "Republicans" : "Democrats"} give up that advantage here, and under the Neutral Lines Compact ${s.name} adopts only alongside states where the shift runs the other way. ${shift > 0 ? "Democrats" : "Republicans"} get a fairer map here and the same in the partner states.</p>`;
  el.innerHTML = pts.map((p) => p[1]).join("") + sides +
    (cons.length ? `<h3>What opponents will say, and the answer</h3><ul class="why">${cons.join("")}</ul>` : "");
}

function renderDistricts(s) {
  const O = s.ours;
  const fmtPct = (x) => (100 * x).toFixed(x < 0.1 ? 1 : 0) + "%";
  document.getElementById("districtCards").innerHTML = (O.detail || []).map((d, i) => {
    const lines = [];
    lines.push(`<b>${fmt(O.pop[i])}</b> people · lean ${lean(O.elections.comp.shares[i])} · compactness ${O.pp[i].toFixed(2)}`);
    if (d.whole_n) lines.push(`<b>Whole counties (${d.whole_n}):</b> ${d.whole.map(esc).join(", ")}${d.whole_n > d.whole.length ? ", …" : ""}`);
    if (d.split.length) lines.push(`<b>Part of:</b> ` + d.split.map(([n, sh, why]) => `${esc(n)} (${fmtPct(sh)}${why ? "; " + why : ""})`).join("; "));
    if (d.munis_n) lines.push(`<b>Divides ${d.munis_n} municipalit${d.munis_n > 1 ? "ies" : "y"} at its edge:</b> ${d.munis.map(esc).join(", ")}${d.munis_n > d.munis.length ? ", …" : ""}`);
    if (d.precincts) lines.push(`<b>Split precincts:</b> ${d.precincts}`);
    if (d.overlap.length) lines.push(`<b>Its residents today:</b> ` + d.overlap.map(([l, sh]) => `${fmtPct(sh)} in District ${l}`).join(", "));
    return `<div class="card"><h4><a href="index.html?state=${s.abbr}&district=${i + 1}#map-section">District ${i + 1} →</a></h4><ul class="why">${lines.map((l) => `<li>${l}</li>`).join("")}</ul></div>`;
  }).join("");
}

function renderLegal(s, proc) {
  const sup = window.SUPERSEDED[s.abbr];
  const pop = s.ours.checks.find((c) => c.id === "population");
  const law = s.ours.state_law || [];
  document.getElementById("legalText").innerHTML = `
    <h3>Federal law</h3>
    <ul class="why">
      <li><b>Equal population</b> (U.S. Const. art. I §2): ${pop ? esc(pop.detail) : "single district"}${cites(["wesberry", "karcher", "tennant"])}.</li>
      <li><b>Single-member districts made of whole census blocks</b> (2 U.S.C. §2c): every block is assigned exactly once, and the plan is published as a standard block file${cites(["usc-2c", "census-cd120"])}.</li>
      <li><b>Voting Rights Act and Equal Protection:</b> race is never an input, so race cannot predominate${cites(["shaw", "alexander"])}. After <i>Louisiana v. Callais</i> (2026), Section 2 requires a strong inference of intentional discrimination, which a rule fixed in law before the data arrive does not support${cites(["callais", "crs-callais"])}. Where a court still orders a district, the remedy stays formulaic: lock that district and rerun the rule on the rest.</li>
      <li><b>Power to adopt it nationally:</b> Article I §4 lets Congress "make or alter" state rules for House elections, the power behind 2 U.S.C. §2c${cites(["const-art1", "usc-2c"])}.</li>
    </ul>
    <h3>${esc(s.name)} law today, and what a national standard changes</h3>
    <p>${proc && proc.criteria ? esc(proc.criteria) : "See the state's process below."}</p>
    ${sup ? `<p><b>What the national rule would replace:</b> ${sup[0]}${cites(sup[1])}</p>` : `<p>A national Neutral Lines Act would replace these criteria for ${esc(s.name)}'s congressional districts only; state legislative maps are unaffected.</p>`}
    ${law.length ? `<p class="note">How the national plan measures against ${esc(s.name)}'s current rules (reported, not enforced):</p>
      <ul class="checks">${law.map((c) => { const [icon, word] = CHECK[c.status] || ["?", c.status];
        return `<li class="check ${c.status}"><span class="ic" aria-hidden="true">${icon}</span><span><b>${esc(c.label)}</b> <span class="st">${c.status === "pass" ? "Consistent" : "Would be superseded"}</span><br><span class="note">${esc(c.detail)}</span></span></li>`; }).join("")}</ul>` : ""}
    <h3>Automated checks on this plan</h3>`;
  document.getElementById("checkList").innerHTML = s.ours.checks.map((c) => {
    const [icon, word] = CHECK[c.status] || ["?", c.status];
    return `<li class="check ${c.status}"><span class="ic" aria-hidden="true">${icon}</span><span><b>${esc(c.label)}</b> <span class="st">${word}</span><br><span class="note">${esc(c.detail)}</span></span></li>`;
  }).join("");
}

function renderProcess(s, proc) {
  const el = document.getElementById("processText");
  if (!proc) { el.innerHTML = `<p class="note">The adoption process for ${esc(s.name)} is still being compiled.</p>`; return; }
  const links = (arr) => (arr || []).map((l) => link(l.url, l.label || l.cite)).join(" · ");
  el.innerHTML = `
    <div class="callout"><b>The national route:</b> a federal Neutral Lines Act under Art. I §4 would apply the rule in ${esc(s.name)} and every other state at once, so no state moves alone. Until Congress acts, these are the routes inside ${esc(s.name)}.</div>
    <p><b>Who decides today:</b> ${esc(proc.authority)}</p>
    ${(proc.legal_basis || []).length ? `<p class="note">Legal basis: ${(proc.legal_basis || []).map((l) => link(l.url, l.cite)).join(" · ")}</p>` : ""}
    <p><b>Mid-decade changes:</b> ${esc(proc.mid_decade)}</p>
    <h3>Paths to adoption</h3>
    <ol class="steps">${(proc.paths || []).map((p) => `<li><b>${esc(p.path)}.</b> ${esc(p.how)}${p.links && p.links.length ? `<br><span class="note">${links(p.links)}</span>` : ""}</li>`).join("")}</ol>
    <div class="callout"><b>Most realistic window:</b> ${esc(proc.best_window)}</div>
    ${proc.notes ? `<p class="note"><b>Notes:</b> ${esc(proc.notes)}</p>` : ""}
    <h3>Recommended state path, before a federal law</h3>
    <p>${recommend(s, proc)}</p>
    ${(proc.sources || []).length ? `<p class="note">Sources: ${links(proc.sources)}</p>` : ""}`;
}

function recommend(s, proc) {
  const paths = (proc.paths || []).map((p) => p.path.toLowerCase());
  const has = (w) => paths.some((p) => p.includes(w));
  if (s.seats === 1) return "No action is needed while the state has one seat. Adopt the rule by statute now so that it applies automatically if the state gains a seat.";
  if (has("initiated constitutional") || has("citizen-initiated constitutional")) return "Citizen-initiated constitutional amendment adopting the frozen Neutral Lines rule for the post-2030 maps, filed with the Neutral Lines Compact pairing clause, so that it takes effect when offsetting states join. Pair it with a commission or legislative resolution endorsing the rule as the required starting map.";
  if (has("citizen-initiated statute") || has("initiated statute")) return "Citizen-initiated statute adopting the rule (and the compact clause), backed by a legislative resolution; follow with a constitutional amendment if the legislature refers one.";
  if (has("commission")) return "Ask the commission to adopt the Neutral Lines plan as its required starting map, departing from it only with reasons on the record, and support a statute making that requirement permanent.";
  return "Legislation adopting the rule as the state's default map (and the compact clause), introduced with bipartisan sponsors. Offer the plan as a neutral benchmark in any redistricting litigation. Support federal legislation making Neutral Lines the default for states that redraw mid-decade.";
}
})();
