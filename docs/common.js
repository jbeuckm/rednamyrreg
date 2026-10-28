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


// Current state rules for congressional maps that a national Neutral Lines Act
// (U.S. Const. art. I §4) would replace. State legislative maps are unaffected.
window.SUPERSEDED = {
  IA: ["Iowa Const. art. III §37 forbids dividing a county, and Code §42.4 sets a 1% limit and bars political data. The national rule splits counties only where equal population needs it, and it also uses no political data.", ["ia-const", "iowa-424"]],
  WV: ["W. Va. Const. art. I §4 requires districts made of whole, contiguous counties. The national rule splits counties only where equal population needs it.", ["wv-const"]],
  OH: ["Ohio Const. art. XIX §2(B) caps county splits, keeps Cleveland and Cincinnati whole and limits shared counties. The national rule keeps counties and cities whole by the same priority, but not by Ohio's exact caps.", ["oh-xix"]],
  CO: ["Colorado asks its commission to maximize competitive districts and bars precincts spanning districts. The national rule reads no election data, and precincts would be re-drawn along the new lines.", ["co-precinct", "ncsl-criteria"]],
  AZ: ["Arizona favors competitive districts where that costs the other goals nothing significant. The national rule reads no election data; competitiveness is reported in the audit.", ["airc", "ncsl-criteria"]],
  MI: ["Michigan requires its commission to apply accepted measures of partisan fairness. The national rule reports those measures but never chooses by them.", ["mi-iv6"]],
  UT: ["Utah's Prop 4 requires partisan-symmetry testing. The national rule reports symmetry but never chooses by it.", ["ut-2025"]],
  NM: ["New Mexico's committee may not split precincts. The national rule splits precincts only along district borders where equal population needs it.", ["nm-13a7"]],
  FL: ["Florida's Fair Districts amendment (art. III §20) bars diminishing minority voters' ability to elect, alongside compactness and boundary rules. The national rule is race-blind; federal Voting Rights Act remedies still apply.", ["fl-iii20"]],
  CA: ["California's commission criteria (art. XXI) include communities of interest; Prop 50 replaced the commission map until 2030. The national rule protects communities only through legal boundaries.", ["ca-xxi", "ncsl-tracker"]],
  PA: ["Pennsylvania's standard (do not divide counties, cities, boroughs, townships or wards except as needed for equality) matches the national rule's priorities.", ["pa-2018"]],
  WA: ["Washington keeps precincts whole where practicable and allows contiguity by ferry or bridge, as the national rule does.", ["wa-rcw"]],
};
