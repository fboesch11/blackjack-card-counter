#!/usr/bin/env python3
"""Build blackjack-trainer.html from src/ and data/.

Combines the HTML template, CSS, JavaScript, strategy charts and explanation
text into ONE self-contained file that works offline.

Usage: python3 build.py            build (charts may be missing; game shows a notice)
       python3 build.py --strict   also fail if any of the 6 strategy charts is missing
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "blackjack-trainer.html"

RULE_SETS = [f"{d}deck_{s}" for d in (1, 2, 6) for s in ("h17", "s17")]
UPCARDS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]
ROWS = ([f"H{n}" for n in range(4, 22)]
        + [f"S{n}" for n in range(13, 22)]
        + [f"P{n}" for n in range(2, 11)] + ["PA"])
CODES = {"H", "S", "D", "Ds", "P", "Rh", "Rs", "Rp"}
JS_FILES = ["engine.js", "strategy.js", "app.js"]


class ChartError(Exception):
    pass


def load_chart(path):
    """Parse and validate one strategy CSV. Returns {meta, table}."""
    meta, data_lines = {}, []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            key, _, val = line[1:].partition(":")
            meta[key.strip().lower()] = val.strip()
        else:
            data_lines.append(line)
    if not meta.get("source", "").startswith("http"):
        raise ChartError(f"{path.name}: missing '# source: <URL>' line")
    if not meta.get("retrieved"):
        raise ChartError(f"{path.name}: missing '# retrieved: <date>' line")

    reader = csv.reader(data_lines)
    header = [c.strip() for c in next(reader, [])]
    if header != ["hand"] + UPCARDS:
        raise ChartError(f"{path.name}: header must be hand,{','.join(UPCARDS)}")

    table = {}
    for row in reader:
        row = [c.strip() for c in row]
        if len(row) != len(header):
            raise ChartError(f"{path.name}: row {row[:1]} has {len(row)} cells, expected {len(header)}")
        hand, cells = row[0], row[1:]
        if hand not in ROWS:
            raise ChartError(f"{path.name}: unknown hand '{hand}'")
        if hand in table:
            raise ChartError(f"{path.name}: duplicate row '{hand}'")
        bad = [c for c in cells if c not in CODES]
        if bad:
            raise ChartError(f"{path.name}: row {hand} has unknown codes {bad}")
        table[hand] = dict(zip(UPCARDS, cells))
    missing = [r for r in ROWS if r not in table]
    if missing:
        raise ChartError(f"{path.name}: missing rows {missing}")
    return {"meta": meta, "table": table}


def load_charts(strict):
    charts, problems = {}, []
    for name in RULE_SETS:
        path = ROOT / "data" / "strategy" / f"{name}.csv"
        if not path.exists():
            problems.append(f"{path.name}: not added yet")
            continue
        charts[name] = load_chart(path)  # invalid file is always a hard error
    if problems and strict:
        raise ChartError("; ".join(problems))
    return charts, problems


def load_text():
    path = ROOT / "data" / "text" / "explanations.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def safe_json(obj):
    # Keep '</script>' sequences in data from closing the script tag.
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def build(strict=False):
    charts, problems = load_charts(strict)
    src = ROOT / "src"
    html = (src / "template.html").read_text(encoding="utf-8")
    css = (src / "styles.css").read_text(encoding="utf-8")
    js = "\n".join((src / f).read_text(encoding="utf-8") for f in JS_FILES)
    data = f"window.BJ_DATA = {{charts: {safe_json(charts)}, text: {safe_json(load_text())}}};"
    # Version label: a hash of everything that goes into the page, so two copies with the
    # same label are the same game (and a rebuild of unchanged sources keeps the label).
    import hashlib
    version = hashlib.sha256((html + css + data + js).encode("utf-8")).hexdigest()[:7]
    html = html.replace("__VERSION__", version)
    for marker, value in (("/*__CSS__*/", css), ("/*__DATA__*/", data), ("/*__JS__*/", js)):
        if marker not in html:
            raise SystemExit(f"template.html is missing marker {marker}")
        html = html.replace(marker, value)
    OUT.write_text(html, encoding="utf-8")
    print(f"Built {OUT.name} version {version} ({len(html):,} bytes); charts loaded: {sorted(charts) or 'none'}")
    for p in problems:
        print(f"  note: {p}")


if __name__ == "__main__":
    try:
        build(strict="--strict" in sys.argv)
    except ChartError as e:
        raise SystemExit(f"Build failed: {e}")
