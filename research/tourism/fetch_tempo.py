#!/usr/bin/env python3
"""Pull the REAL city monthly arrivals from INS Tempo (matrix TUR104F).

OFFLINE reproducibility helper — documents exactly how city-arrivals-monthly.csv
and city-arrivals-annual.csv were produced. Re-run to refresh (e.g. add 2026).

Tempo REST API (public, no key), over HTTP port 8077 to avoid insse.ro's broken
TLS cert:
  metadata: GET  http://statistici.insse.ro:8077/tempo-ins/matrix/TUR104F
  data:     POST http://statistici.insse.ro:8077/tempo-ins/matrix/TUR104F
            body {"language","arr":[[option objects per dim]],"matrixName","matrixDetails"}

TUR104F dims: 1 structure type (Total=9148), 2 tourist type (Romani=9181,
Straini=9182), 3 county (Brasov=3071, Sibiu=3095), 4 month, 5 UM (9685).
The response is an HTML table with MALFORMED closing tags (</td align='right'>),
so parse tolerantly.
"""
import csv, json, os, re, urllib.request

BASE = "http://statistici.insse.ro:8077/tempo-ins/matrix/TUR104F"
HERE = os.path.dirname(os.path.abspath(__file__))
YEARS = [str(y) for y in range(2020, 2026)]
ROMANIAN_MONTHS = {"ianuarie":1,"februarie":2,"martie":3,"aprilie":4,"mai":5,"iunie":6,
                   "iulie":7,"august":8,"septembrie":9,"octombrie":10,"noiembrie":11,"decembrie":12}


def main():
    meta = json.loads(urllib.request.urlopen(BASE, timeout=60).read().decode("utf-8"))
    dims = {d["dimCode"]: d for d in meta["dimensionsMap"]}
    pick = lambda dc, ids: [o for o in dims[dc]["options"] if o["nomItemId"] in ids]
    months = [o for o in dims[4]["options"] if any(y in o["label"] for y in YEARS)]
    arr = [pick(1, {9148}), pick(2, {9181, 9182}), pick(3, {3071, 3095}), months, pick(5, {9685})]
    payload = {"language": "ro", "arr": arr,
               "matrixName": meta["matrixName"], "matrixDetails": meta["details"]}
    req = urllib.request.Request(BASE, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    html = json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))["resultTable"]

    ym = []
    for o in months:
        _, mon, yr = o["label"].split()
        ym.append((int(yr), ROMANIAN_MONTHS[mon]))

    cell = re.compile(r"<t[hd][^>]*>(.*?)</t[hd]", re.S)
    def num(v):
        v = v.replace("&nbsp;", "").strip()
        return int(v.replace(".", "").replace(",", "")) if re.fullmatch(r"[0-9.,]+", v) else None

    data_rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", html, re.S):
        raw = [re.sub(r"<[^>]+>", "", c).strip() for c in cell.findall(tr)]
        if len(raw) < len(ym):
            continue
        vals = [num(x) for x in raw[-len(ym):]]
        if sum(v is not None for v in vals) >= len(ym) // 2:   # genuine numeric row
            data_rows.append(vals)

    # Tempo emits rows in dim order: turisti(Romani,Straini) x judete(Brasov,Sibiu)
    order = [("Romanian", "Brasov"), ("Romanian", "Sibiu"),
             ("Foreign", "Brasov"), ("Foreign", "Sibiu")]
    assert len(data_rows) == 4, f"expected 4 data rows, got {len(data_rows)}"
    table = {}  # (city,year,month) -> {type: val}
    for (ttype, city), vals in zip(order, data_rows):
        for (y, m), v in zip(ym, vals):
            table.setdefault((city, y, m), {})[ttype] = v

    with open(os.path.join(HERE, "city-arrivals-monthly.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["city", "year", "month", "arrivals_romanian", "arrivals_foreign", "arrivals_total"])
        for (city, y, m) in sorted(table):
            d = table[(city, y, m)]; ro, fo = d.get("Romanian"), d.get("Foreign")
            tot = (ro + fo) if ro is not None and fo is not None else ""
            w.writerow([city, y, f"{m:02d}", ro if ro is not None else "", fo if fo is not None else "", tot])
    print("wrote city-arrivals-monthly.csv")


if __name__ == "__main__":
    main()
