#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf

OUT = Path(__file__).resolve().parents[1] / "public" / "universe.json"
REGIONS = [
    "us","ca","gb","de","fr","ch","nl","se","dk","no","fi","it","es","be","at",
    "jp","hk","cn","tw","kr","in","au","sg","br","mx","za"
]

def scalar(v, default=0):
    if isinstance(v, dict):
        for k in ("raw", "value"):
            if k in v:
                return scalar(v[k], default)
    try:
        return float(v)
    except Exception:
        return default

def one_region(region: str):
    q = yf.EquityQuery("and", [
        yf.EquityQuery("eq", ["region", region]),
        yf.EquityQuery("gt", ["intradaymarketcap", 0]),
    ])
    result = yf.screen(q, offset=0, size=120, sortField="intradaymarketcap", sortAsc=False)
    return result.get("quotes", [])

def broad_fallback(offset: int):
    q = yf.EquityQuery("gt", ["intradaymarketcap", 0])
    result = yf.screen(q, offset=offset, size=250, sortField="intradaymarketcap", sortAsc=False)
    return result.get("quotes", [])

def main():
    rows=[]
    failures=[]
    for region in REGIONS:
        try:
            rows.extend(one_region(region))
        except Exception as e:
            failures.append(f"{region}: {e}")

    if len(rows) < 700:
        for off in (0,250):
            try:
                rows.extend(broad_fallback(off))
            except Exception as e:
                failures.append(f"broad-{off}: {e}")

    by_symbol={}
    for q in rows:
        symbol=str(q.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        quote_type=str(q.get("quoteType") or "EQUITY").upper()
        if quote_type not in ("EQUITY", ""):
            continue
        market_cap=scalar(q.get("marketCap"), scalar(q.get("intradaymarketcap"), 0))
        if market_cap <= 0:
            continue
        item={
            "symbol":symbol,
            "name":q.get("shortName") or q.get("longName") or q.get("displayName") or symbol,
            "marketCap":market_cap,
            "region":q.get("region"),
            "exchange":q.get("exchange"),
            "currency":q.get("currency")
        }
        old=by_symbol.get(symbol)
        if old is None or market_cap > old["marketCap"]:
            by_symbol[symbol]=item

    top=sorted(by_symbol.values(), key=lambda x:x["marketCap"], reverse=True)[:500]
    if len(top) < 450:
        raise RuntimeError(f"Only {len(top)} usable equities found; refusing to overwrite existing universe. Failures: {failures[:5]}")

    payload={
        "generated_at":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "source":"yfinance Yahoo EquityQuery; global region aggregation; sorted by market cap",
        "count":len(top),
        "equities":top
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(top)} equities to {OUT}")
    if failures:
        print("Skipped region errors:", failures)

if __name__ == "__main__":
    main()
