/* Named measures, theorems, methods, laws and cases. Every mention in page text,
   including text rendered later from data, becomes a link to an outside
   explanation, with a hover (or tap) card that defines it and cites our source.
   Each entry: [key, pattern, description, ref key in refs.js or null, explanation URL or null].
   With no explanation URL, the link goes to the cited source. */
(function () {
const W = "https://en.wikipedia.org/wiki/";
const PS = "https://planscore.org/metrics/";
const TERMS = [
  // ---- measures and theorems
  ["polsby-popper", /Polsby[–-]Popper/, "A compactness score: the district's area divided by the area of a circle with the same perimeter. A circle scores 1; long or jagged borders push the score toward 0. Sensitive to coastlines and map detail.", "polsby-popper", W + "Polsby%E2%80%93Popper_test"],
  ["reock", /Reock/, "A compactness score: the district's area divided by the area of the smallest circle that encloses it. A circle scores 1; stretched districts score low.", "reock", W + "Reock_degree_of_compactness"],
  ["compactness", /\bcompactness\b/i, "How tightly a district is shaped. Measured many ways (Polsby–Popper, Reock, moment of inertia); low scores can signal a gerrymander, but they also come from coastlines and county lines.", null, W + "Compactness_measure"],
  ["moi", /moments? of inertia/i, "The sum, over every resident, of the squared distance to their district's population center. Smaller means people live closer to the middle of their district. The objective of Hess and colleagues (1965), and the compactness measure this rule minimizes.", "hess1965", W + "Moment_of_inertia"],
  ["power", /(?:balanced )?(?:centroidal )?power (?:diagrams?|cells?)/i, "A map in which each place belongs to the center that minimizes its squared distance minus that center's weight. Every region is a convex polygon, and the weights can be set so all regions hold equal population.", "cohen-addad", W + "Power_diagram"],
  ["eg", /efficiency gap/i, "Wasted votes (every vote for a loser, plus a winner's votes beyond 50%) for one party minus the other's, divided by all votes cast. 0 means both parties waste votes equally; around 8% or more is usually treated as a red flag.", "eg", W + "Efficiency_gap"],
  ["wasted", /wasted votes?/i, "Votes that do not help elect anyone: every vote for a losing candidate, plus a winner's votes beyond what was needed to win. The efficiency gap is built from them.", "eg", W + "Wasted_vote"],
  ["mm", /mean[–-]median/i, "A party's average district vote share minus its median district vote share. A large gap means its voters are packed into a few lopsided districts.", "mcdonald-best", PS + "meanmedian/"],
  ["bias", /partisan (?:bias|symmetry)|bias at (?:a )?50[–-]50(?: vote)?/i, "Partisan symmetry: how many more seats one party would win than the other if each won exactly half the vote, shifting every district by the same swing. A symmetric map treats both parties alike at the same vote share.", "king-amicus", PS + "partisanbias/"],
  ["seats-votes", /seats[–-]votes curve/i, "How a party's seat share changes as its statewide vote share changes, shifting every district by the same swing.", "king-amicus", W + "Gerrymandering#Seats%E2%80%93votes_curve"],
  ["swing", /uniform[- ]swing/i, "Shifting every district's vote by the same number of points to see how seats would change. The basis for partisan bias and responsiveness.", "king-amicus", W + "Swing_(politics)"],
  ["resp", /responsiveness/i, "How many seats change hands when the statewide vote moves by one point, shifting every district equally. Gerrymanders tend to lower it.", "deford-resp", W + "Gerrymandering#Seats%E2%80%93votes_curve"],
  ["comp", /competitive (?:districts?|seats?)/i, "Here: a district whose two-party vote in the 2016–20 statewide composite falls between 45% and 55%.", "deford-resp", W + "Marginal_seat"],
  ["declination", /declination/i, "A measure of how unevenly a party's winning and losing districts are distributed, based on the angle between them on a plot of sorted vote shares.", "warrington", PS + "declination/"],
  ["ensemble", /ensembles?|outliers?/i, "Ensemble analysis compares a plan with many plans drawn blind under the same rules. A plan whose results fall outside that range is an outlier, which suggests something other than the rules shaped it.", "herschlag", "https://sites.duke.edu/quantifyinggerrymandering/"],
  ["recom", /\bReCom\b/, "Recombination: a Markov chain that builds large ensembles of valid plans by repeatedly merging two neighboring districts and splitting them again along a random spanning tree.", "recom", null],
  ["alexeev-mixon", /Alexeev (?:and|&|–) ?Mixon|impossibility theorem/i, "Alexeev and Mixon's impossibility theorem (2018): no districting rule can always guarantee equal population, a minimum Polsby–Popper compactness and a bounded efficiency gap at the same time.", "alexeev-mixon", null],
  ["hh", /Huntington[–-]Hill/, "The method of equal proportions, used since 1941 to give each state its number of House seats after each census.", "census-hh", W + "Huntington%E2%80%93Hill_method"],
  ["splitline", /(?:shortest[- ])?splitline/i, "Warren D. Smith's districting algorithm: cut the state with the shortest straight line that divides its population in the right proportion, then repeat on each side. Simple and party-blind, but it ignores county and city lines.", "splitline", W + "Gerrymandering#Shortest_splitline_algorithm"],
  ["tree", /spanning trees?/i, "A set of links that connects every point in a network with no loops. Here it connects the districts so population can be passed along their borders, one step at a time, until every district is equal.", null, W + "Spanning_tree"],
  ["retention", /core retention|cores? of (?:prior|current|today's) districts?/i, "The share of residents who stay with the core of their current district: for each new district, the people it shares with the current district it overlaps most.", "ncsl-criteria", null],
  ["prop", /proportionality|proportional (?:results|seats|representation)/i, "Seat share equal to vote share. Single-member districts do not guarantee it: in Massachusetts no possible map gives Republicans a seat, though a third of voters are Republican.", "duchin-ma", W + "Proportional_representation"],
  ["packing", /\b(?:packing|cracking|packed|cracked)\b/i, "Packing concentrates a group's voters in a few districts they win by huge margins; cracking spreads them thinly so they lose everywhere. The two basic tactics of gerrymandering.", "bernstein-duchin", W + "Gerrymandering#Tactics"],
  ["prison", /prison(?:-based)? gerrymander(?:ing|s)?/i, "Counting incarcerated people where the prison is rather than at their home address, which inflates the population of districts with prisons.", "ppi-prisoners", W + "Prison_gerrymandering"],
  ["geography", /political geography|Chen (?:and|&) Rodden/, "Democrats are concentrated in cities, so compact, party-blind maps tend to waste more Democratic votes (Chen and Rodden, 2013).", "chen-rodden", null],
  ["mmd", /majority[–-]minority/i, "A district where racial and ethnic minorities together make up more than half of the voting-age population.", "gingles", W + "Majority-minority_district"],
  ["coi", /communit(?:y|ies) of interest/i, "Groups with shared interests, such as a neighborhood, a watershed or an economic region, that many states ask mapmakers to keep together. They have no fixed boundaries, so a rule cannot check them.", "ncsl-criteria", null],
  ["contiguity", /\bcontiguity\b|\bcontiguous\b/i, "Every part of a district connects to every other part. Here, connected means sharing a block edge (a corner touch does not count), and water inside a state connects its shores.", "ncsl-criteria", null],
  // ---- census geography
  ["block", /census blocks?/i, "The smallest area the Census Bureau counts, often a city block bounded by streets, streams or other features. Every district here is built from whole 2020 blocks.", "census-glossary", W + "Census_block"],
  ["bg", /block groups?/i, "A cluster of census blocks, usually 600 to 3,000 people. The search places districts at this level before refining to blocks.", "census-glossary", W + "Census_block_group"],
  ["vtd", /\bVTDs?\b|voting (?:tabulation )?districts?/i, "Voting tabulation district: the Census Bureau's version of a precinct, the area whose votes are counted together. Used here as the national definition of a precinct.", "census-baf", "https://www.census.gov/programs-surveys/geography/about/glossary.html"],
  ["baf", /block assignment files?/i, "A list of every census block and the district it belongs to: the format legislatures publish and election offices load.", "census-baf", null],
  // ---- constitution and statutes
  ["art1s4", /Elections Clause|[Aa]rt(?:icle|\.) I,? (?:§|Section) ?4\b/, "Article I, Section 4 of the Constitution: states set the times, places and manner of congressional elections, but Congress may make or alter those rules. The basis for a national districting law.", "const-art1", W + "Article_One_of_the_United_States_Constitution#Clause_1:_Time,_place,_and_manner_of_holding_elections"],
  ["art1s2", /[Aa]rt(?:icle|\.) I,? (?:§|Section) ?2\b/, "Article I, Section 2 of the Constitution: House seats are divided among the states by population, counted in a census every ten years.", "const-art1", W + "Article_One_of_the_United_States_Constitution#Clause_3:_Apportionment_of_Representatives_and_taxes"],
  ["usc2c", /2 U\.S\.C\.? (?:§ ?)?2c/, "The 1967 federal law requiring single-member congressional districts in every state with more than one seat.", "usc-2c", W + "Uniform_Congressional_District_Act"],
  ["usc2a", /2 U\.S\.C\.? (?:§ ?)?2a/, "The federal law that reapportions House seats after each census using the method of equal proportions (Huntington–Hill).", "usc-2a", W + "Huntington%E2%80%93Hill_method"],
  ["act1929", /Reapportionment Act(?: of 1929)?/, "The 1929 law that fixed the House at 435 seats with automatic reapportionment after each census, and dropped the earlier districting standards.", "act-1929", W + "Reapportionment_Act_of_1929"],
  ["acts", /(?<!Re)Apportionment Acts?(?: of \d{4})?/, "Laws setting the size of the House and dividing its seats. The acts of 1842 to 1911 also set districting standards: single-member, contiguous, compact or equal districts.", "crs-apportion-acts", W + "United_States_congressional_apportionment"],
  ["vra", /Voting Rights Act(?: of 1965)?/, "The Voting Rights Act of 1965, the federal law against racial discrimination in voting. Its Section 2 bars district lines that deny minority voters an equal opportunity to elect candidates of their choice.", "vra", W + "Voting_Rights_Act_of_1965"],
  ["s2", /\bSection 2\b(?![(\d])|VRA §\s?2\b/, "Section 2 of the Voting Rights Act bars voting practices, including district lines, that deny minority voters an equal opportunity to elect candidates of their choice. Louisiana v. Callais (2026) narrowed it.", "vra", W + "Voting_Rights_Act_of_1965#General_prohibition_of_discriminatory_voting_laws"],
  ["opov", /one person, one vote/i, "Districts must hold equal populations so every vote counts equally, as the Supreme Court held in Wesberry v. Sanders and Reynolds v. Sims (1964).", "reynolds", W + "One_man,_one_vote"],
  ["ep", /Equal Protection(?: Clause)?/, "The Fourteenth Amendment's guarantee of the equal protection of the laws: the basis for one person, one vote in state districts and for limits on race-based districting.", "reynolds", W + "Equal_Protection_Clause"],
  ["fra", /Fair Representation Act/, "A proposed federal bill to elect the House by ranked-choice voting in multi-member districts drawn by independent commissions.", "fairvote-fra", W + "Fair_Representation_Act"],
  ["prop50", /Prop(?:osition|\.)? 50/, "California's November 2025 ballot measure that replaced the citizens commission's congressional map with a legislature-drawn map through 2030, in answer to Texas's mid-decade redraw.", null, W + "2025_California_Proposition_50"],
  ["venice", /Venice Commission/, "The Council of Europe's advisory body on constitutional law. Its Code of Good Practice in Electoral Matters sets standards for drawing boundaries, including a population tolerance of 10%, and never more than 15% outside special circumstances.", "venice", W + "Venice_Commission"],
  ["master", /special masters?/i, "An expert a court appoints to draw or review a map, often after a legislature or commission fails to adopt one.", null, W + "Special_master"],
  ["multi", /multi-member(?: districts?)?/i, "A district that elects more than one representative. Federal law has required single-member House districts since 1967.", "usc-2c", W + "Electoral_district#District_magnitude"],
  ["rcv", /ranked[- ]choice(?: voting)?/i, "Voters rank candidates in order of preference. If no one has a majority, the last-place candidate is eliminated and those ballots count for their next choice, until someone wins.", null, W + "Ranked-choice_voting_in_the_United_States"],
  // ---- court cases
  ["gingles", /(?:Thornburg v\. )?Gingles/, "The test from Thornburg v. Gingles (1986) for a Voting Rights Act §2 claim: a minority group large and compact enough to be a district majority, politically cohesive, and usually outvoted by a white bloc. Louisiana v. Callais (2026) narrowed it.", "gingles", W + "Thornburg_v._Gingles"],
  ["callais", /(?:Louisiana v\. )?Callais/, "Louisiana v. Callais (2026): the Supreme Court (6–3) struck down Louisiana's second majority-Black district and held that Section 2 liability needs a strong inference of intentional discrimination.", "callais", W + "Louisiana_v._Callais"],
  ["tennant", /(?<!v\. )Tennant(?: v\. Jefferson County(?: Commission)?)?/, "Tennant v. Jefferson County Commission (2012): the Supreme Court upheld West Virginia's congressional map with a 0.79% population deviation, justified by goals such as keeping counties whole.", "tennant", W + "Tennant_v._Jefferson_County_Commission"],
  ["rucho", /Rucho(?: v\. Common Cause)?/, "Rucho v. Common Cause (2019): the Supreme Court held that partisan gerrymandering claims are political questions that federal courts cannot decide.", "rucho", W + "Rucho_v._Common_Cause"],
  ["evenwel", /Evenwel(?: v\. Abbott)?/, "Evenwel v. Abbott (2016): the Supreme Court held that states may draw districts by total population, not only by eligible voters.", "evenwel", W + "Evenwel_v._Abbott"],
  ["wesberry", /Wesberry(?: v\. Sanders)?/, "Wesberry v. Sanders (1964): congressional districts must be as nearly equal in population as is practicable.", "wesberry", W + "Wesberry_v._Sanders"],
  ["karcher", /Karcher(?: v\. Daggett)?/, "Karcher v. Daggett (1983): the Supreme Court struck down a New Jersey congressional map whose districts differed by 0.7%, because the state could not justify the gap.", "karcher", W + "Karcher_v._Daggett"],
  ["milligan", /(?:Allen v\. )?Milligan(?: v\. Allen)?/, "Allen v. Milligan (2023): the Supreme Court held that Alabama's map likely violated Section 2, and Alabama had to add a second district where Black voters could elect their candidate.", "milligan", W + "Allen_v._Milligan"],
  ["shelby", /Shelby County(?: v\. Holder)?/, "Shelby County v. Holder (2013): the Supreme Court struck down the Voting Rights Act's coverage formula, ending federal preclearance of new maps.", "shelby", W + "Shelby_County_v._Holder"],
  ["reynolds", /Reynolds v\. Sims/, "Reynolds v. Sims (1964): both houses of a state legislature must be apportioned by population: one person, one vote.", "reynolds", W + "Reynolds_v._Sims"],
  ["baker", /Baker v\. Carr/, "Baker v. Carr (1962): the Supreme Court held that courts may hear challenges to unequal districts, opening the way to one person, one vote.", "baker", W + "Baker_v._Carr"],
  ["shaw", /Shaw v\. Reno/, "Shaw v. Reno (1993): a district so oddly shaped that only race can explain it may be challenged as a racial gerrymander under the Equal Protection Clause.", "shaw", W + "Shaw_v._Reno"],
  ["vieth", /Vieth(?: v\. Jubelirer)?/, "Vieth v. Jubelirer (2004): the Supreme Court could not agree on a standard for partisan gerrymandering claims and let the map stand.", "vieth", W + "Vieth_v._Jubelirer"],
  ["bandemer", /(?:Davis v\. )?Bandemer/, "Davis v. Bandemer (1986): the Supreme Court held that partisan gerrymandering claims could be heard, but set a standard no challenger ever met.", "bandemer", W + "Davis_v._Bandemer"],
  ["lulac", /LULAC v\. Perry|League of United Latin American Citizens v\. Perry/, "LULAC v. Perry (2006): the Supreme Court upheld most of Texas's 2003 mid-decade redraw but struck down one district under Section 2 of the Voting Rights Act.", "lulac", W + "League_of_United_Latin_American_Citizens_v._Perry"],
  ["colegrove", /Colegrove(?: v\. Green)?/, "Colegrove v. Green (1946): the Supreme Court refused to hear a challenge to unequal districts, calling districting a political thicket.", "colegrove", W + "Colegrove_v._Green"],
  ["wood", /Wood v\. Broom/, "Wood v. Broom (1932): the Supreme Court held that the 1911 act's compactness, contiguity and equal-population requirements had lapsed.", "wood", "https://supreme.justia.com/cases/federal/us/287/1/"],
  ["moore", /Moore v\. Harper/, "Moore v. Harper (2023): the Supreme Court rejected the independent state legislature theory, so state courts may review congressional maps under their state constitutions.", "moore", W + "Moore_v._Harper"],
  ["airc", /(?:Arizona (?:State )?Legislature|State Legislature) v\. (?:AIRC|Arizona Independent Redistricting Commission)/, "Arizona State Legislature v. Arizona Independent Redistricting Commission (2015): voters may give congressional districting to an independent commission by ballot initiative.", "airc", W + "Arizona_State_Legislature_v._Arizona_Independent_Redistricting_Commission"],
  ["alexander", /Alexander v\. (?:SC NAACP|S\.C\. NAACP|South Carolina State Conference of the NAACP)/, "Alexander v. South Carolina State Conference of the NAACP (2024): courts must presume a legislature acted in good faith, and challengers must separate race from party.", "alexander", W + "Alexander_v._South_Carolina_State_Conference_of_the_NAACP"],
  ["clarke", /Clarke v\. (?:WEC|Wisconsin Elections Commission)/, "Clarke v. Wisconsin Elections Commission (2023): the Wisconsin Supreme Court struck down legislative maps with districts in detached pieces, because the state constitution requires contiguity.", "clarke", W + "Clarke_v._Wisconsin_Elections_Commission"],
];
const SKIP = "a, button, select, option, textarea, input, label, script, style, svg, code, .eyebrow, .term, .termtip, #tooltip, .refs";
const refs = new Map((window.REFS || []).map((r, i) => [r[0], [i + 1, r[1], r[2]]]));
const byKey = new Map(TERMS.map((t) => [t[0], t]));
const explainUrl = (t) => t[4] || (refs.get(t[3]) || [])[2] || "#";
const SITES = { "en.wikipedia.org": "Wikipedia", "planscore.org": "PlanScore", "www.census.gov": "U.S. Census Bureau",
  "sites.duke.edu": "Duke University", "supreme.justia.com": "Justia" };
const siteName = (url) => { try { const h = new URL(url).hostname; return SITES[h] || h.replace(/^www\./, ""); } catch { return ""; } };

// The earliest term in the text; the longest one when two start at the same place.
function firstMatch(text) {
  let best = null;
  for (const t of TERMS) {
    const m = t[1].exec(text);
    if (m && (!best || m.index < best.m.index || (m.index === best.m.index && m[0].length > best.m[0].length))) best = { t, m };
  }
  return best;
}
function wrapIn(node) {
  let cur = node;
  for (let hit; cur && (hit = firstMatch(cur.nodeValue));) {
    const { t, m } = hit;
    const mid = cur.splitText(m.index);
    cur = mid.splitText(m[0].length);
    const a = document.createElement("a");
    a.className = "term";
    a.dataset.term = t[0];
    a.href = explainUrl(t);
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-describedby", "termtip");
    a.textContent = mid.nodeValue;
    mid.replaceWith(a);
  }
}
function scan(root) {
  if (root.nodeType === 3) { if (root.parentElement && !root.parentElement.closest(SKIP)) wrapIn(root); return; }
  if (root.nodeType !== 1 || root.closest(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.nodeValue.trim() && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(wrapIn);
}

// ---- the tooltip
const tip = document.createElement("div");
tip.className = "termtip";
tip.id = "termtip";
tip.setAttribute("role", "tooltip");
tip.hidden = true;
document.body.appendChild(tip);
let hideTimer = null, shownFor = null;
function show(a) {
  const t = byKey.get(a.dataset.term), ref = refs.get(t[3]), url = explainUrl(t);
  clearTimeout(hideTimer);
  const srcHref = ref && (document.getElementById("refList") ? `#ref-${t[3]}` : ref[2]);
  tip.innerHTML = `<div>${t[2]}</div>`
    + (t[4] ? `<div class="src"><a href="${url}" target="_blank" rel="noopener">What is it? ${siteName(url)} ↗</a></div>` : "")
    + (ref ? `<div class="src">Source [${ref[0]}]: ${ref[1]} <a href="${srcHref}"${srcHref.startsWith("#") ? "" : ' target="_blank" rel="noopener"'}>Open ↗</a></div>` : "");
  tip.hidden = false;
  const r = a.getBoundingClientRect(), w = Math.min(340, innerWidth - 32);
  tip.style.width = w + "px";
  tip.style.left = Math.max(16, Math.min(r.left, innerWidth - w - 16)) + "px";
  const below = r.bottom + 8, h = tip.offsetHeight;
  tip.style.top = (below + h > innerHeight - 8 && r.top - h - 8 > 8 ? r.top - h - 8 : below) + "px";
  shownFor = a;
}
function hideSoon() { hideTimer = setTimeout(() => { tip.hidden = true; shownFor = null; }, 180); }
document.addEventListener("mouseover", (e) => { const a = e.target.closest?.(".term"); if (a) show(a); });
document.addEventListener("mouseout", (e) => { if (e.target.closest?.(".term")) hideSoon(); });
document.addEventListener("focusin", (e) => { const a = e.target.closest?.(".term"); if (a) show(a); });
document.addEventListener("focusout", (e) => { if (e.target.closest?.(".term")) hideSoon(); });
tip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
tip.addEventListener("mouseleave", hideSoon);
// On touch screens the first tap explains the term; a second tap, or the link in the card, opens the explanation.
document.addEventListener("pointerdown", (e) => {
  const a = e.target.closest?.(".term");
  if (a && e.pointerType !== "mouse" && shownFor !== a) { a.dataset.tapped = "1"; }
});
document.addEventListener("click", (e) => {
  const a = e.target.closest?.(".term");
  if (a && a.dataset.tapped) { delete a.dataset.tapped; e.preventDefault(); show(a); return; }
  if (!a && !e.target.closest?.(".termtip")) { tip.hidden = true; shownFor = null; }
});
addEventListener("scroll", () => { if (!tip.hidden) { tip.hidden = true; shownFor = null; } }, { passive: true });

// ---- scan now and whenever content is rendered from data
let pending = new Set(), queued = false;
new MutationObserver((muts) => {
  muts.forEach((m) => m.addedNodes.forEach((n) => { if (!(n.nodeType === 1 && n.classList.contains("term"))) pending.add(n); }));
  if (!queued && pending.size) {
    queued = true;
    requestAnimationFrame(() => { const ns = [...pending]; pending = new Set(); queued = false; ns.forEach((n) => n.isConnected && scan(n)); });
  }
}).observe(document.body, { childList: true, subtree: true });
scan(document.body);
})();
