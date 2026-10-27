"""Fill the measured tables in ASSESSMENT.md from docs/data/summary.json.

Replaces the content after each <!-- MEASURED:name --> marker (up to the next
heading) so every number in the assessment comes straight from the pipeline.
"""

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REDRAWN = ["TX", "CA", "FL", "NC", "OH", "UT", "AL", "LA", "TN"]


def favor(x, scale=100, unit="%"):
    v = x * scale
    return "0" if abs(v) < 0.05 else f"{'R' if v > 0 else 'D'}+{abs(v):.1f}{unit}"


def redraws(S):
    rows = ["| State | Seats | Lean (2016–20) | D-leaning seats: 2026 map / formula | Partisan bias at 50–50: 2026 / formula "
            "| Efficiency gap: 2026 / formula | Counties split: 2026 / formula | Precincts split: 2026 / formula "
            "| Majority-minority districts: 2026 / formula |",
            "|---|---|---|---|---|---|---|---|---|"]
    for ab in REDRAWN:
        s = S[ab]
        E, O = s["enacted"], s["ours"]
        lean = (O["elections"]["comp"]["V"] - 0.5) * 200
        prec = (f"{E['precinct_splits']} / {O['precinct_splits']}" if s["has_vtd"] else "n/a")
        rows.append(
            f"| {s['name']} | {s['seats']} | {'D' if lean > 0 else 'R'}+{abs(lean):.1f} "
            f"| {E['elections']['comp']['seatsD']} / {O['elections']['comp']['seatsD']} "
            f"| {favor(E['elections']['comp']['bias'], 100, '% of seats')} / {favor(O['elections']['comp']['bias'], 100, '% of seats')} "
            f"| {favor(E['elections']['comp']['eg'])} / {favor(O['elections']['comp']['eg'])} "
            f"| {E['county_splits']} / {O['county_splits']} | {prec} | {E['mm_districts']} / {O['mm_districts']} |")
    tot = lambda key, plan: sum(S[a][plan]["elections"]["comp"][key] if key == "seatsD" else 0 for a in REDRAWN)
    biasE = sum(S[a]["seats"] * S[a]["enacted"]["elections"]["comp"]["bias"] for a in REDRAWN)
    biasO = sum(S[a]["seats"] * S[a]["ours"]["elections"]["comp"]["bias"] for a in REDRAWN)
    rows.append("")
    rows.append(f"Across these nine states, the 2026 maps give {tot('seatsD', 'enacted')} Democratic-leaning seats against "
                f"{tot('seatsD', 'ours')} under the formula. Summed partisan bias at a 50–50 vote is "
                f"{favor(biasE / 100, 100, ' seats')} for the 2026 maps and {favor(biasO / 100, 100, ' seats')} for the formula "
                f"(positive R = the map favors Republicans). Partisan bias, efficiency gap and lean are computed on the "
                f"2016–20 statewide composite; seats are districts leaning each way, not forecasts.")
    return "\n".join(rows)


def ours(S):
    checks = {}
    for s in S.values():
        for c in s["ours"]["checks"]:
            checks.setdefault(c["label"], {}).setdefault(c["status"], []).append(s["abbr"])
    rows = ["| Check (formula plan) | Pass | Justified | Review | Fail |", "|---|---|---|---|---|"]
    for label, st in checks.items():
        cell = lambda k: f"{len(st.get(k, []))}" + (f" ({', '.join(sorted(st[k]))})" if k in ("fail",) and st.get(k) else "")
        rows.append(f"| {label} | {cell('pass')} | {cell('justified')} | {cell('review')} | {cell('fail')} |")
    exact = sum(s["ours"]["range_people"] <= 1 for s in S.values())
    worst = max(S.values(), key=lambda s: s["ours"]["range_people"])
    rows.append("")
    rows.append(f"Population: {exact} of 50 states within one person; the largest gap is {worst['ours']['range_people']} "
                f"people ({worst['name']}). Counties split nationally: {sum(s['ours']['county_splits'] for s in S.values())} "
                f"(2026 maps: {sum(s['enacted']['county_splits'] for s in S.values())}); municipalities: "
                f"{sum(s['ours']['muni_splits'] for s in S.values())} ({sum(s['enacted']['muni_splits'] for s in S.values())}); "
                f"precincts: {sum(s['ours']['precinct_splits'] for s in S.values())} "
                f"({sum(s['enacted']['precinct_splits'] for s in S.values())}).")
    return "\n".join(rows)


def references():
    """The site's reference library (docs/refs.js) as a numbered Markdown list."""
    out = subprocess.run(["node", "-e", "global.window={}; require(process.argv[1]); "
                          "process.stdout.write(JSON.stringify(window.REFS))", str(ROOT / "docs" / "refs.js")],
                         capture_output=True, text=True, check=True).stdout
    refs = json.loads(out)
    lines = ["## References", "",
             "The same numbered list appears at the bottom of the website. Court decisions link to Justia, statutes to official or LII text, research to DOI or arXiv.", ""]
    for i, (key, text, url) in enumerate(refs, 1):
        md = re.sub(r"</?i>", "*", text).replace("&amp;", "&")
        lines.append(f"{i}. {md} <{url}>")
    return "\n".join(lines) + "\n"


def main():
    S = {s["abbr"]: s for s in json.loads((ROOT / "docs" / "data" / "summary.json").read_text())["states"]}
    path = ROOT / "ASSESSMENT.md"
    text = path.read_text()
    for name, fn in [("redraws", redraws), ("ours", ours)]:
        marker = f"<!-- MEASURED:{name} -->"
        text = re.sub(re.escape(marker) + r"\n.*?(?=\n- \*\*|\n### |\n## )",
                      lambda m: marker + "\n\n" + fn(S) + "\n", text, count=1, flags=re.S)
    if "\n## References" in text:
        text = text[:text.index("\n## References")]
    text = text.rstrip() + "\n\n---\n\n" + references()
    path.write_text(text)
    print("ASSESSMENT.md updated")


if __name__ == "__main__":
    main()
