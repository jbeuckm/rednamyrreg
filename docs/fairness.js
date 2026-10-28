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

const SUPERSEDED = window.SUPERSEDED;

d3.json("data/summary.json").then((summary) => {
  const S = summary.states;
  const multi = S.filter((s) => s.seats > 1);
  const sum = (f, arr = S) => arr.reduce((a, s) => a + f(s), 0);
  const competitive = (plan) => sum((s) => s[plan].elections.comp.shares.filter((x) => Math.abs(x - 0.5) < 0.05).length);
  const mm = (plan, key) => sum((s) => ((key ? s[plan][key] : s[plan].minority) || []).filter((x) => x > 0.5).length);
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
    rkO: d3.mean(S.flatMap((s) => s.ours.reock)), rkE: d3.mean(S.flatMap((s) => s.enacted.reock)),
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

  // ---- every idea of fair: how the plan meets each one
  const resp = (sh) => (sh.filter((x) => x + 0.01 > 0.5).length - sh.filter((x) => x - 0.01 > 0.5).length) / 2;
  N.respO = sum((s) => resp(s.ours.elections.comp.shares)); N.respE = sum((s) => resp(s.enacted.elections.comp.shares));
  N.aO = mm("ours", "asian"); N.aE = mm("enacted", "asian");
  const withRet = multi.filter((s) => s.ours.retention != null);
  N.ret = withRet.length ? sum((s) => s.ours.retention * s.pop, withRet) / sum((s) => s.pop, withRet) : N.core;
  const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
  const TY = multi.filter((s) => s.typicality);
  const mid = (key) => TY.filter((s) => s.typicality[key].pct >= 0.1 && s.typicality[key].pct <= 0.9).length;
  N.tyRule = sum((s) => s.typicality.seats.rule, TY); N.tyMed = sum((s) => s.typicality.seats.median, TY);
  N.tyMidSeats = mid("seats"); N.tyMidMin = mid("minority"); N.tyN = TY.length;
  N.tyOut = TY.filter((s) => s.typicality.seats.pct < 0.1 || s.typicality.seats.pct > 0.9).map((s) => {
    const t = s.typicality.seats;
    return `${s.name} (${n1(t.rule)} Democratic-leaning seats against a median of ${n1(t.median)})`;
  });
  N.vD = sum((s) => s.seats * s.ours.elections.comp.V) / sum((s) => s.seats);
  const FIT = { met: "Meets", partial: "Partly", audit: "Measured, not targeted", conflict: "Conflicts" };
  const FIT_HELP = { met: "the rule guarantees it", partial: "met in part; the rest needs human judgment", audit: "cannot be targeted without election or race data, so it is measured after the fact and published", conflict: "contradicts another idea of fairness; the table says which way the plan goes" };
  const IDEAS = [
    ["Who draws the map", [
      ["Not drawn by the politicians who run in it", `Most Americans: 82% in NBC/SurveyMonkey's 2025 poll, including 71% of Republicans in Republican-run states; 50% to 19% for commissions over legislatures in YouGov's (Democrats 59–17, Republicans 41–27); 72% in Wisconsin, with Republicans at 63%${cites(["poll-nbc-2025", "poll-yougov-2025", "poll-marquette-2019"])}`, "met", "No one draws the map, not even a commission. Congress enacts the rule once; the code applies it."],
      ["No party data", `Iowa's statute; Cato; Americans' top-ranked priority in NORC's 2026 survey${cites(["iowa-424", "olson-cato", "norc-2026"])}`, "met", "No votes, registration or past results are read while drawing or while choosing between plans."],
      ["No help or harm to incumbents", `League of Women Voters; Iowa, California, Arizona and Idaho law${cites(["lwv-position", "iowa-424", "ca-xxi", "levitt"])}`, "met", "Incumbents' addresses are never read. Some members will be paired; that is the price of neutrality."],
      ["A few clear, ranked rules", `Brennan Center (criteria “must be explicitly ranked”); Cato (“too many criteria reintroduce discretion”)${cites(["brennan-criteria", "olson-cato"])}`, "met", "Four ranked rules (equal population, contiguity, whole counties then cities then precincts, compactness) and one objective. There is no setting to adjust."],
      ["Open and verifiable", `ACE: outcomes are seen as fair when the process is open; the 2014 civil-rights principles${cites(["ace", "principles-2014"])}`, "met", "Code, data, block files and a certificate for every state are public. Anyone who reruns the code gets the identical map."],
      ["The public has a say", `Civil-rights and reform groups; hearings in the UK, Canada and every state commission${cites(["principles-2014", "uk-pca", "canada-ebra"])}`, "partial", "<b>Added to the rule:</b> the input data (county, municipal and precinct boundaries and the population count) are published for public correction before the rule runs, and anyone may submit a better-scoring plan during the challenge window. What the public cannot do is move a line by testimony, because that would hand the pen back to whoever weighs the testimony."],
      ["Legislators should draw, because they answer to voters", `The Texas House sponsor in 2025, citing Rucho; some Democrats after 2025${cites(["tx-tribune-hunter", "hasen-2026"])}`, "conflict", "The plan goes the other way: elected officials are accountable for enacting the rule, not for drawing their own districts. This is a choice between two ideas, not a defect."],
    ]],
    ["One rule, applied when", [
      ["One rule for every state", `FairVote's Fair Representation Act; Rep. Kevin Kiley (R); Eric Holder (D): “national redistricting reform remains the best path”${cites(["fairvote-fra", "kiley-2025", "ndrc-2025"])}`, "met", "The same rule, with the same settings, draws all 435 districts. Adopted by Congress under Art. I §4, it changes every state at once, so no one disarms alone."],
      ["Once a decade, never mid-decade", `60% oppose mid-decade redraws (51% of Republicans); 41% disapproved of Texas's 2025 redraw vs 34% approving; the Venice Commission: no changes within a year of an election${cites(["poll-cc-2025", "tx-poll-2025", "venice", "hr5879"])}`, "met", "<b>Added to the rule:</b> one map per census, in force from the first election after the data are released until the next census. The rule is deterministic, so rerunning it mid-decade on the same data would give the same map anyway."],
      ["No dial anyone can turn", `Our own tuning test${cites(["alexeev-mixon"])}`, "met", `The earlier version of this plan, which picked maps by a fairness score, could be steered by 6–12 seats. The rule now has nothing to choose. See <a href="#tuning">Can it be tuned?</a>`],
      ["Counter-gerrymanders for “national balance”", `41% say retaliation is justified (58% of Democrats, 32% of Republicans); Common Cause's six conditions${cites(["poll-yougov-2025", "cc-conditions"])}`, "conflict", "The plan removes the reason for retaliation instead of balancing it: no state can gerrymander, so none needs to answer."],
    ]],
    ["Who counts", [
      ["Count everyone", `U.S. Const. art. I §2; <i>Evenwel v. Abbott</i> upheld total population${cites(["const-art1", "evenwel"])}`, "met", "Districts are equal in total population, the base the Constitution uses for apportionment."],
      ["Count prisoners at home, not in the prison town", `The 2014 civil-rights principles; 10 states already do for congressional maps${cites(["principles-2014", "brennan-prison", "ppi-prisoners"])}`, "partial", "<b>Added to the rule:</b> incarcerated people are counted at their last home address, nationwide, using a Census Bureau tabulation the act would require. Until that national file exists the demonstration uses raw 2020 counts in every state, so it does not yet meet this."],
      ["Count citizens only", `President Trump (2025)${cites(["npr-census-2025"])}`, "conflict", "The plan counts everyone, as the Constitution does for apportionment and as every state does today. A citizens-only base would also need data the census does not collect block by block."],
    ]],
    ["Geography and communities", [
      ["Equal population", `Universal; required by <i>Wesberry</i> and <i>Karcher</i>${cites(["wesberry", "karcher"])}`, "met", `${N.exact} of ${nStates} states are within one person; the widest gap is ${N.maxRange} people, kept to avoid splitting another county or city.`],
      ["One connected piece", `Universal; 33 states require it by law${cites(["crs-criteria-2026"])}`, "met", `${N.contig} of ${nStates} states pass a connectivity test on the true block geometry. <b>Added to the rule:</b> one national definition: districts connect along shared block edges, and water inside a state connects.`],
      ["Compact, not contorted", `29 states; a contorted map raised perceived gerrymandering from 54% to 62% in an experiment, equally across parties${cites(["crs-criteria-2026", "williamson-justwan", "kkk"])}`, "met", `The rule picks the plan with the smallest moment of inertia among those with the fewest county splits, so people live as close to their district's center as the county rule allows. On outline-based scores the result is ${N.ppO >= N.ppE && N.rkO >= N.rkE ? "also at least as compact as the 2026 maps" : "close to the 2026 maps, because its lines follow jagged county, town and precinct edges"}: average Polsby–Popper ${N.ppO.toFixed(2)} vs ${N.ppE.toFixed(2)}, Reock ${N.rkO.toFixed(2)} vs ${N.rkE.toFixed(2)}.`],
      ["Keep counties and cities whole", `30 states for counties; Iowa; urban voters in Kansas City and Salt Lake County who saw their cities divided${cites(["crs-criteria-2026", "iowa-424", "kc-2026"])}`, "met", `${fmt(N.cO)} county splits vs ${fmt(N.cE)} in the 2026 maps; ${fmt(N.mO)} municipal splits vs ${fmt(N.mE)}. <b>Added to the rule:</b> one national definition of a municipality: incorporated places, plus towns in the twelve states where towns are the local government.`],
      ["Keep precincts whole", `Election administrators${cites(["nc-precincts", "ma-galvin"])}`, "met", `${fmt(N.pO)} split precincts vs ${fmt(N.pE)}. The precinct file is fixed nationally: the Census Bureau's voting districts for that census.`],
      ["Rural and urban voices", `Rural Coloradans against pairing with Boulder; city voters against pie-slicing${cites(["bgov-rural", "kc-2026"])}`, "met", "Whole counties keep rural areas together, and compactness keeps cities from being pie-sliced into rural districts."],
      ["Keep communities of interest together", `20 states; Brennan Center's #3; the 2014 civil-rights principles${cites(["crs-criteria-2026", "brennan-criteria", "principles-2014", "mggg-coi"])}`, "partial", "Counties, cities, towns and precincts are communities with legal boundaries, and the rule keeps them whole in that order. Self-defined communities (neighborhoods, school districts, ethnic and economic communities) are protected only when they fall inside one of those units, because choosing among them takes human judgment."],
      ["Follow natural features and keep travel manageable", `Canada, Australia, the UK and New Zealand${cites(["canada-ebra", "aec", "uk-pca"])}`, "partial", "Population-weighted compactness keeps people near their district's center, which tracks travel distance. Lines follow county, city, precinct or block edges, which are roads, rivers or legal lines. Mountains and travel times are not used."],
      ["Districts people can describe in words", `Cato${cites(["olson-cato"])}`, "met", "Each district is listed by the whole counties and cities it contains, on every state page."],
      ["Keep today's districts (continuity)", `Australia, Canada, the UK; 7 states require preserving cores${cites(["aec", "canada-ebra", "ncsl-criteria"])}`, "conflict", `The plan starts fresh each census, because today's districts carry today's gerrymanders. Even so, ${N.ret != null ? pct(N.ret) : "most"} of Americans would stay with the core of their current district.`],
    ]],
    ["Partisan fairness", [
      ["No intent to favor a party", `About 17 states' law; 73% prefer maps without partisan bias even if their own party loses seats (71% of Republicans, 74% of Democrats)${cites(["ncsl-criteria", "poll-clc-2017"])}`, "met", "No one with a partisan aim takes part, and no party data are read, so there is no channel for intent."],
      ["No partisan advantage in effect (bias, symmetry, efficiency gap)", `Michigan and Florida law; Princeton's report cards; partisan-symmetry scholars${cites(["mi-iv6", "fl-iii20", "princeton-card", "king-amicus", "eg"])}`, "audit", `Summed bias at a 50–50 vote: ${seatsFavor(N.oursBias)}, vs ${seatsFavor(N.enBias)} in the 2026 maps. The remaining lean comes from where people live, which compact party-blind maps inherit (Chen &amp; Rodden; Kenny et al.)${cites(["chen-rodden", "kenny-pnas"])}.`],
      ["Typical of neutral maps", `The test courts and the Princeton project use: is the plan an outlier among neutral maps?${cites(["herschlag", "recom", "mccartan-smc", "princeton-card"])}`, "audit", N.tyN ? `Among the valid plans the search found in each state, all drawn blind and compared at the county stage before refinement: summed over the ${N.tyN} states where the search found more than one distinct plan, the rule's plan has ${n1(N.tyRule)} Democratic-leaning seats on the 2016–20 composite, against a median of ${n1(N.tyMed)}. In ${N.tyMidSeats} of those ${N.tyN} states its seat count sits within the middle 80% of those plans.${N.tyOut.length ? ` The exception${N.tyOut.length > 1 ? "s are" : " is"} ${N.tyOut.join(", ")}: the most compact plan can sit near one end, because compactness is itself an extreme among neutral maps.` : ""}` : "Computed per state from the valid candidates."],
      ["Seats in proportion to votes", `Vice President Vance on Massachusetts; Ohio's legislative maps${cites(["vance-2025", "oh-xix"])}`, "conflict", `Strict proportionality would give Democrats about ${N.propD.toFixed(0)} seats; the plan has ${N.oursD}.${Math.abs(N.oursD - N.propD) < 2.5 ? " The national total lands close, but by accident: state by state it does not, and the rule never aims at it." : ""} No party-blind rule can promise proportionality, and sometimes no map can: every possible Massachusetts map elects nine Democrats though a third of voters are Republican${cites(["duchin-ma"])}.`],
      ["Competitive districts", `Arizona, Colorado and Washington; Princeton's grades; the most common complaint at Indiana's citizen hearings${cites(["princeton-card"])}`, "audit", `${N.compO} districts within 5 points of even, vs ${N.compE} in the 2026 maps. Targeting competitiveness would mean dividing towns and reading election data, so the rule does not.`],
      ["Responsive to voters", `Seats should move when votes move${cites(["deford-resp", "kenny-pnas"])}`, "audit", `A 1-point national swing moves about ${n1(N.respO)} seats under the plan, vs ${n1(N.respE)} under the 2026 maps.`],
    ]],
    ["Race and representation", [
      ["Race should play no role", `Heritage Foundation; the Justice Department in 2025; <i>Shaw</i>; <i>Callais</i>${cites(["heritage-2023", "shaw", "callais", "ncc-callais"])}`, "met", "Race is never read, so no district can be a racial gerrymander."],
      ["Minority communities get a fair chance to elect their candidates", `Brennan Center's #2; NAACP LDF, MALDEF and AAJC; the Voting Rights Act${cites(["brennan-criteria", "ldf-guide", "vra", "gingles", "milligan"])}`, "conflict", `Race-blind maps cannot guarantee opportunity districts, and research finds they usually produce fewer${cites(["chen-steph", "becker-vra"])}. Majority-Black districts: ${N.bO} vs ${N.bE} today; majority-Hispanic: ${N.hO} vs ${N.hE}; majority-Asian: ${N.aO} vs ${N.aE}; majority-minority overall: ${N.mmO} vs ${N.mmE}. <b>Added to the rule:</b> Section 2 still governs. If a court finds a violation, it fixes the districts its judgment requires and the rule redraws the rest of the state around them, with no other discretion.`],
    ]],
  ];
  const nIdeas = IDEAS.reduce((a, [, rows]) => a + rows.length, 0);
  const counts = d3.rollup(IDEAS.flatMap(([, rows]) => rows), (v) => v.length, (r) => r[2]);
  document.getElementById("fitKey").innerHTML = Object.keys(FIT).map((k) =>
    `<span><span class="fit ${k}">${FIT[k]}</span> ${counts.get(k) || 0} · ${FIT_HELP[k]}</span>`).join("");
  document.getElementById("ideasTable").innerHTML = `<thead><tr><th>Idea of a fair map</th><th>Who holds it</th><th>Neutral Lines</th><th>How, with the numbers</th></tr></thead><tbody>` +
    IDEAS.map(([group, rows]) => `<tr class="group"><td colspan="4">${group}</td></tr>` + rows.map(([idea, who, fit, how]) =>
      `<tr><td><b>${idea}</b></td><td class="note">${who}</td><td><span class="fit ${fit}">${FIT[fit]}</span></td><td>${how}</td></tr>`).join("")).join("") + "</tbody>";
  document.getElementById("ideasNotes").innerHTML = `<p class="note">${nIdeas} ideas, gathered from national and state polls, the stated principles of both parties' leaders, civil-rights and reform groups, state constitutions and statutes, Supreme Court cases, academic research, and the rules of the UK, Canada, Australia, New Zealand and the Venice Commission. Partisan figures use the 2016–20 statewide composite; minority figures use 2020 voting-age population. “Today” means the maps in use for November 2026.</p>
    <p>Why not meet every idea? Because some are opposites. A map cannot be drawn by legislators and by no one, count only citizens and count everyone, ignore race and guarantee seats by race, ignore party and guarantee proportional seats. Where ideas collide, the plan sides with the ones that need no judgment and no data about how anyone votes, since those are the only ones nobody can steer. Every idea it does not target is still measured and published here.</p>`;

  const card = (title, concern, offer, cost, refs = []) => `<div class="card"><h4>${title}</h4>
    <p><b>Their concern.</b> ${concern}</p><p style="margin-top:6px"><b>What Neutral Lines offers.</b> ${offer}</p>
    <div class="proof"><b>What it costs them.</b> ${cost}${cites(refs)}</div></div>`;
  const names = (arr) => arr.map((s) => s.abbr).join(", ") || "none";
  document.getElementById("perspectiveCards").innerHTML = [
    card("Republican voters and officials",
      "A \"fairness\" step could be tuned against them; Democratic gerrymanders (e.g., Illinois, Maryland) must be undone too, and 2025–26 gains should not be surrendered alone.",
      `There is no fairness step to tune: no election data are read anywhere, and the plan is simply the most compact one with the fewest split counties. Compact maps reflect geography, which tends to help Republicans where Democrats cluster in cities. A national act changes every state at once, including the states where the formula moves seats toward Republicans (${names(toR)}).`,
      `Relative to the 2026 maps, the formula moves seats toward Democrats in ${names(toD)}. Nationally it has ${Math.abs(N.oursD - N.enD)} ${N.oursD > N.enD ? "more" : "fewer"} Democratic-leaning seats than the 2026 maps. Some of those maps were drawn by legislatures for partisan advantage, others by commissions or courts.`, ["chen-rodden", "king-amicus"]),
    card("Democratic voters and officials",
      "Neutral compact maps systematically under-represent clustered urban voters; disarming while other states gerrymander; losing majority-minority districts.",
      `Summed bias at a 50–50 vote falls from ${seatsFavor(N.enBias)} under the 2026 maps to ${seatsFavor(N.oursBias)}, without the rule ever looking at party, and mid-decade redraws end. A national act changes every state at once, so no state disarms alone.`,
      `The rule does not correct for geography, so the remaining ${seatsFavor(N.oursBias)} lean stays (Chen & Rodden). Relative to the 2026 maps, seats move toward Republicans in ${names(toR)}, including some states whose current maps were drawn by commissions or courts, and race-blind drawing yields ${N.mmO} majority-minority districts against ${N.mmE} today.`, ["chen-rodden", "sabato"]),
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

  // ---- tuning audit: the rule's pick vs a free choice among the same valid plans
  const T = (k) => sum((s) => s.tuning ? s.tuning[k] : s.ours.elections.comp.seatsD);
  const one = (x) => x.toFixed(1).replace(/\.0$/, "");
  const grids = d3.rollup(multi.filter((s) => (s.search || []).length), (v) => v.length, (s) => s.search[s.search.length - 1].grid);
  const tried = sum((s) => s.tried || 1, multi);
  document.getElementById("tuneTable").innerHTML = `<thead><tr><th>How the plan is chosen, among the same valid candidates</th><th class="n">Democratic-leaning seats</th></tr></thead><tbody>
    <tr><td><b>The rule: fewest split counties, then most compact</b></td><td class="n"><b>${one(T("rule"))}</b></td></tr>
    <tr><td>Most compact, ignoring county splits</td><td class="n">${one(T("compact_only"))}</td></tr>
    <tr><td>A free hand-pick of the most Republican valid plan in each state</td><td class="n">${one(T("most_r"))}</td></tr>
    <tr><td>A free hand-pick of the most Democratic valid plan in each state</td><td class="n">${one(T("most_d"))}</td></tr>
    <tr><td>For reference: strict proportionality to the statewide vote</td><td class="n">${one(N.propD)}</td></tr></tbody>`;
  document.getElementById("tuneNotes").innerHTML = `<p class="note">Seats are counted on each candidate's county-stage plan, averaging the 2016, 2018 and 2020 statewide races, so they differ slightly from the finished block-level figures elsewhere on this site. "Valid" means contiguous with every district within 0.3% of equal population. The search tried ${fmt(tried)} candidate plans across the ${multi.length} multi-district states; it stopped at ${[...grids].sort((a, b) => a[0] - b[0]).map(([g, n]) => `${g} angles in ${n} state${n > 1 ? "s" : ""}`).join(", ")}.</p>
    <p>The hand-picked rows are what an unconstrained chooser could do with these candidates. The rule's own figure comes from an objective that contains no party information. The objective itself is the one remaining choice. We picked the oldest and simplest standard in the field: whole counties, then Hess's population-weighted compactness from 1965.${cites(["hess1965", "weaver-hess", "ncsl-criteria"])} In the interest of full disclosure, we saw this objective's national seat estimate before adopting it, along with those of the alternatives above. That is why every alternative's figure is published next to it, and why the rule must be frozen in law before the 2030 data exist.</p>`;

  // ---- legality table
  const get = (s, id) => s.ours.checks.find((c) => c.id === id);
  const lt = document.getElementById("legalTable");
  lt.innerHTML = `<thead><tr><th>State</th><th class="n">Seats</th><th>Population</th><th>Contiguity</th><th>Compactness</th>
    <th>Splits: county / municipality / precinct (formula vs 2026)</th><th>State rules it would replace</th><th>How today's map was made</th></tr></thead><tbody>` +
    S.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
      const law = SUPERSEDED[s.abbr];
      const conflicts = (s.ours.state_law || []).filter((c) => c.status !== "pass").length;
      const origin = window.ORIGIN[s.abbr] || window.ORIGIN_DEFAULT;
      const pop = get(s, "population");
      return `<tr data-st="${s.abbr}"><td><a href="state.html?st=${s.abbr}">${esc(s.name)}</a></td><td class="n">${s.seats}</td>
        <td>${mark(pop)} ${s.ours.range_people} ppl</td><td>${mark(get(s, "contiguity"))}</td><td>${mark(get(s, "compactness"))}</td>
        <td>${s.ours.county_splits}/${s.ours.muni_splits}/${s.has_vtd ? s.ours.precinct_splits : "–"} vs ${s.enacted.county_splits}/${s.enacted.muni_splits}/${s.has_vtd ? s.enacted.precinct_splits : "–"}</td>
        <td>${law ? law[0] + cites(law[1]) : "No specific congressional criteria found beyond federal law and general state practice."}${conflicts ? ` <span class="note">(${conflicts} current rule${conflicts > 1 ? "s" : ""} not met by the national plan)</span>` : ""}</td>
        <td class="note">${origin[0]}${cites(origin[1])}</td></tr>`;
    }).join("") + "</tbody>";
  lt.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-st]");
    if (tr && !e.target.closest("a")) location.href = `state.html?st=${tr.dataset.st}`;
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
