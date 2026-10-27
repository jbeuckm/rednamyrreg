/* Shared by index.html and fairness.html: how each state's 2026 map was made, with reference keys. */
window.ORIGIN = {
  TX: ["Drawn by the Legislature in a mid-decade redraw at the President's urging, signed Aug. 29, 2025; the Supreme Court reversed a lower court's racial-gerrymandering ruling (Apr. 27, 2026).", ["tx-lulac", "ncsl-tracker"]],
  CA: ["Legislature-drawn map approved by voters as Prop 50 (Nov. 4, 2025), replacing the citizen commission's map until 2030.", ["ncsl-tracker", "ap-9states"]],
  NC: ["Drawn by the Legislature in a mid-decade redraw enacted Oct. 22, 2025 (North Carolina governors cannot veto maps).", ["ncsl-tracker"]],
  OH: ["Adopted 7–0 by the bipartisan Ohio Redistricting Commission on Oct. 31, 2025, under Art. XIX.", ["oh-2025", "oh-xix"]],
  UT: ["Imposed by a state court (Nov. 10, 2025) after it held the Legislature's repeal of voter-passed Prop 4 unconstitutional.", ["ut-2025"]],
  FL: ["Drawn by the Legislature and signed May 4, 2026; challenged under the Fair Districts amendment, and in use for 2026.", ["fl-2026", "fl-iii20"]],
  AL: ["The Legislature's 2023 map, restored for 2026 by a June 2, 2026 Supreme Court order after <i>Callais</i>.", ["al-2026", "callais"]],
  LA: ["Drawn by the Legislature (May 29, 2026) after <i>Callais</i> struck down the second majority-Black district.", ["la-2026", "callais"]],
  TN: ["Drawn by the Legislature in a mid-decade redraw (May 7, 2026) that splits Memphis; an injunction was denied.", ["tn-2026"]],
  MO: ["The 2022 legislative map. The 2025 redraw is suspended pending a referendum (Prop A, Nov. 3, 2026).", ["mo-scotus"]],
  VA: ["Drawn in 2021 by special masters appointed by the Supreme Court of Virginia; a 2026 amendment to redraw it was voided.", ["va-2026"]],
  AZ: ["Drawn by the Arizona Independent Redistricting Commission after the 2020 census.", ["airc", "ncsl-criteria"]],
  CO: ["Drawn by Colorado's Independent Congressional Redistricting Commission after the 2020 census.", ["ncsl-criteria"]],
  MI: ["Drawn by Michigan's Independent Citizens Redistricting Commission after the 2020 census.", ["mi-iv6"]],
  WA: ["Drawn by Washington's bipartisan Redistricting Commission after the 2020 census.", ["wa-rcw"]],
  PA: ["Chosen by the Pennsylvania Supreme Court in 2022 after the Legislature and Governor deadlocked.", ["ncsl-criteria"]],
  NY: ["Drawn by the Legislature in 2024; a 2026 court order to redraw the 11th District was stayed by the Supreme Court.", ["ny-2026"]],
  IN: ["Drawn by the Legislature after the 2020 census; a 2025 mid-decade redraw was rejected by the state Senate.", ["in-2025"]],
  MD: ["Drawn by the Legislature in 2022 after a state court struck its first plan; a constitutional amendment (Question 3) is on the Nov. 2026 ballot.", ["md-2026"]],
};
window.ORIGIN_DEFAULT = ["Adopted after the 2020 census and unchanged for 2026 (see the NCSL tracker for each state's process).", ["ncsl-criteria", "ncsl-tracker"]];


// State-law notes that the automated checks don't capture on their own.
window.NO_PARTISAN = ["IA", "MT", "NE", "NM", "CA", "FL"];
window.STATE_LAW = {
  IA: ["Iowa Const. art. III §37 forbids dividing a county in a congressional district, and Code §42.4 allows up to 1% deviation and bars political data. The Neutral Lines plan for Iowa uses whole counties only, as equal as whole counties allow, and the partisan step is off.", ["ia-const", "iowa-424"]],
  WV: ["W. Va. Const. art. I §4 requires congressional districts made of contiguous counties. The Neutral Lines plan for West Virginia uses whole counties only.", ["wv-const"]],
  OH: ["Ohio Const. art. XIX §2(B) applies in full: at least 65 counties whole, at most 18 split once and 5 twice, Cleveland and Cincinnati whole, and two districts sharing at most one county under 400,000. The Ohio module enforces each rule (see the checks).", ["oh-xix"]],
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

