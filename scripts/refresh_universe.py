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

def last_fx(symbol: str):
    try:
        h = yf.Ticker(symbol).history(period="5d", interval="1d", auto_adjust=False)
        if h is None or h.empty or "Close" not in h:
            return 0.0
        s = h["Close"].dropna()
        return float(s.iloc[-1]) if len(s) else 0.0
    except Exception:
        return 0.0

def build_fx_map(currencies):
    fx = {"USD": 1.0}
    failures = []
    for raw in sorted(set(c for c in currencies if c)):
        c = str(raw).strip()
        if not c or c == "USD":
            continue
        # Yahoo nutzt bei einigen London-Listings GBp (Pence). MarketCap folgt der Quote-Waehrung.
        if c.lower() in ("gbp", "gbp."):
            c = "GBP"
        if c == "GBp":
            r = last_fx("GBPUSD=X")
            if r > 0:
                fx[raw] = r / 100.0
            else:
                failures.append(raw)
            continue
        direct = last_fx(f"{c}USD=X")
        if direct > 0:
            fx[raw] = direct
            continue
        inverse = last_fx(f"USD{c}=X")
        if inverse > 0:
            fx[raw] = 1.0 / inverse
            continue
        failures.append(raw)
    return fx, failures

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

    raw_items=[]
    currencies=[]
    for q in rows:
        symbol=str(q.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        quote_type=str(q.get("quoteType") or "EQUITY").upper()
        if quote_type not in ("EQUITY", ""):
            continue
        market_cap_local=scalar(q.get("marketCap"), scalar(q.get("intradaymarketcap"), 0))
        if market_cap_local <= 0:
            continue
        currency=str(q.get("currency") or "USD").strip() or "USD"
        currencies.append(currency)
        raw_items.append((q,symbol,market_cap_local,currency))

    fx, fx_failures = build_fx_map(currencies)
    if fx_failures:
        failures.append("FX missing: " + ", ".join(sorted(set(fx_failures))))

    by_symbol={}
    for q,symbol,market_cap_local,currency in raw_items:
        rate=fx.get(currency)
        if not rate or rate <= 0:
            continue
        market_cap_usd=market_cap_local*rate
        item={
            "symbol":symbol,
            "name":q.get("shortName") or q.get("longName") or q.get("displayName") or symbol,
            "marketCap":market_cap_local,
            "marketCapUSD":market_cap_usd,
            "region":q.get("region"),
            "exchange":q.get("exchange"),
            "currency":currency,
            "sector":q.get("sector") or q.get("sectorDisp"),
            "industry":q.get("industry") or q.get("industryDisp")
        }
        old=by_symbol.get(symbol)
        if old is None or market_cap_usd > old["marketCapUSD"]:
            by_symbol[symbol]=item

    top=sorted(by_symbol.values(), key=lambda x:x["marketCapUSD"], reverse=True)[:500]
    if len(top) < 450:
        raise RuntimeError(f"Only {len(top)} usable FX-normalized equities found; refusing to overwrite existing universe. Failures: {failures[:5]}")

    payload={
        "generated_at":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "source":"yfinance Yahoo EquityQuery; global region aggregation; market caps FX-normalized to USD before ranking",
        "count":len(top),
        "equities":top
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(top)} FX-normalized equities to {OUT}")
    if failures:
        print("Warnings:", failures)

if __name__ == "__main__":
    main()
