/* Named measures and theorems. Wherever one appears in page text, including text
   rendered later from data, it becomes a link to its citation with a hover (or tap)
   description. Each entry: [key, pattern, description, ref key in refs.js]. */
(function () {
const TERMS = [
  ["polsby-popper", /Polsby[–-]Popper/, "A compactness score: the district's area divided by the area of a circle with the same perimeter. A circle scores 1; long or jagged borders push the score toward 0. Sensitive to coastlines and map detail.", "polsby-popper"],
  ["reock", /Reock/, "A compactness score: the district's area divided by the area of the smallest circle that encloses it. A circle scores 1; stretched districts score low.", "reock"],
  ["moi", /moments? of inertia/i, "The sum, over every resident, of the squared distance to their district's population center. Smaller means people live closer to the middle of their district. The objective of Hess and colleagues (1965), and the compactness measure this rule minimizes.", "hess1965"],
  ["power", /power (?:diagrams?|cells?)/i, "A map in which each place belongs to the center that minimizes its squared distance minus that center's weight. Every region is a convex polygon, and the weights can be set so all regions hold equal population.", "cohen-addad"],
  ["eg", /efficiency gap/i, "Wasted votes (every vote for a loser, plus a winner's votes beyond 50%) for one party minus the other's, divided by all votes cast. 0 means both parties waste votes equally; around 8% or more is usually treated as a red flag.", "eg"],
  ["mm", /mean[–-]median/i, "A party's average district vote share minus its median district vote share. A large gap means its voters are packed into a few lopsided districts.", "mcdonald-best"],
  ["bias", /partisan (?:bias|symmetry)|bias at (?:a )?50[–-]50(?: vote)?/i, "Partisan symmetry: how many more seats one party would win than the other if each won exactly half the vote, shifting every district by the same swing. A symmetric map treats both parties alike at the same vote share.", "king-amicus"],
  ["seats-votes", /seats[–-]votes curve/i, "How a party's seat share changes as its statewide vote share changes, shifting every district by the same swing.", "king-amicus"],
  ["resp", /responsiveness/i, "How many seats change hands when the statewide vote moves by one point, shifting every district equally. Gerrymanders tend to lower it.", "deford-resp"],
  ["comp", /competitive (?:districts?|seats?)/i, "Here: a district whose two-party vote in the 2016–20 statewide composite falls between 45% and 55%.", "deford-resp"],
  ["ensemble", /ensembles?|outliers?/i, "Ensemble analysis compares a plan with many plans drawn blind under the same rules. A plan whose results fall outside that range is an outlier, which suggests something other than the rules shaped it.", "herschlag"],
  ["alexeev-mixon", /Alexeev (?:and|&|–) ?Mixon|impossibility theorem/i, "Alexeev and Mixon's impossibility theorem (2018): no districting rule can always guarantee equal population, a minimum Polsby–Popper compactness and a bounded efficiency gap at the same time.", "alexeev-mixon"],
  ["hh", /Huntington[–-]Hill/, "The method of equal proportions, used since 1941 to give each state its number of House seats after each census.", "census-hh"],
  ["gingles", /Gingles/, "The test from Thornburg v. Gingles (1986) for a Voting Rights Act §2 claim: a minority group large and compact enough to be a district majority, politically cohesive, and usually outvoted by a white bloc. Louisiana v. Callais (2026) narrowed it.", "gingles"],
  ["mmd", /majority[–-]minority/i, "A district where racial and ethnic minorities together make up more than half of the voting-age population.", "gingles"],
  ["retention", /core retention|cores? of (?:prior|current|today's) districts?/i, "The share of residents who stay with the core of their current district: for each new district, the people it shares with the current district it overlaps most.", "ncsl-criteria"],
  ["prop", /proportionality|proportional (?:results|seats|representation)/i, "Seat share equal to vote share. Single-member districts do not guarantee it: in Massachusetts no possible map gives Republicans a seat, though a third of voters are Republican.", "duchin-ma"],
  ["packing", /\b(?:packing|cracking|packed|cracked)\b/i, "Packing concentrates a group's voters in a few districts they win by huge margins; cracking spreads them thinly so they lose everywhere. The two basic tactics of gerrymandering.", "bernstein-duchin"],
  ["declination", /declination/i, "A measure of how unevenly a party's winning and losing districts are distributed, based on the angle between them on a plot of sorted vote shares.", "warrington"],
  ["geography", /political geography|Chen (?:and|&) Rodden/, "Democrats are concentrated in cities, so compact, party-blind maps tend to waste more Democratic votes (Chen and Rodden, 2013).", "chen-rodden"],
  ["baf", /block assignment files?/i, "A list of every census block and the district it belongs to: the format legislatures publish and election offices load.", "census-baf"],
];
const SKIP = "a, button, select, option, textarea, input, label, script, style, svg, code, h1, h2, h3, h4, .eyebrow, .term, .termtip, #tooltip, .refs";
const BLOCK = "p, li, td, th, h5, dd, .proof, .note, .card, div";
const refs = new Map((window.REFS || []).map((r, i) => [r[0], [i + 1, r[1], r[2]]]));
const byKey = new Map(TERMS.map((t) => [t[0], t]));

// The earliest term in the text that this block doesn't explain yet.
function firstMatch(text, block) {
  let best = null;
  for (const t of TERMS) {
    if (block.querySelector(`.term[data-term="${t[0]}"]`)) continue;
    const m = t[1].exec(text);
    if (m && (!best || m.index < best.m.index)) best = { t, m };
  }
  return best;
}
const hasRefList = () => !!document.getElementById("refList");
function wrapIn(node) {
  const block = node.parentElement.closest(BLOCK) || node.parentElement;
  let cur = node;
  for (let hit; (hit = firstMatch(cur.nodeValue, block));) {
    const { t, m } = hit;
    const mid = cur.splitText(m.index);
    cur = mid.splitText(m[0].length);
    const ref = refs.get(t[3]);
    const a = document.createElement("a");
    a.className = "term";
    a.dataset.term = t[0];
    if (hasRefList()) a.href = `#ref-${t[3]}`;
    else { a.href = ref ? ref[2] : "#"; a.target = "_blank"; a.rel = "noopener"; }
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
  const t = byKey.get(a.dataset.term), ref = refs.get(t[3]);
  clearTimeout(hideTimer);
  tip.innerHTML = `<div>${t[2]}</div>` + (ref ? `<div class="src">Source [${ref[0]}]: ${ref[1]} <a href="${ref[2]}" target="_blank" rel="noopener">Open ↗</a></div>` : "");
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
// On touch screens the first tap explains the term; the link inside the tip opens the source.
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
