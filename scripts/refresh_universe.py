#!/usr/bin/env python3
from __future__ import annotations
import json
import math
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf

OUT = Path(__file__).resolve().parents[1] / "public" / "universe.json"
REGIONS = [
    "us","ca","gb","de","fr","ch","nl","se","dk","no","fi","it","es","be","at",
    "jp","hk","cn","tw","kr","in","au","sg","br","mx","za"
]

PRIMARY_EXCHANGES = {
    "us": {"NMS","NYQ","NGM","NCM","ASE","PCX"},
    "ca": {"TOR","VAN","NEO"}, "gb": {"LSE"}, "de": {"GER"}, "fr": {"PAR"},
    "ch": {"EBS"}, "nl": {"AMS"}, "se": {"STO"}, "dk": {"CPH"}, "no": {"OSL"},
    "fi": {"HEL"}, "it": {"MIL"}, "es": {"MCE"}, "be": {"BRU"}, "at": {"VIE"},
    "jp": {"JPX","TYO"}, "hk": {"HKG"}, "cn": {"SHH","SHZ"}, "tw": {"TAI","TWO"},
    "kr": {"KSC","KOE"}, "in": {"NSI","BSE"}, "au": {"ASX"}, "sg": {"SES"},
    "br": {"SAO"}, "mx": {"MEX"}, "za": {"JNB"},
}

LISTING_WORDS = {
    "INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC","AG","SE","NV","SA","SPA",
    "HOLDING","HOLDINGS","GROUP","ORD","ORDINARY","SHARE","SHARES","SHS","REGISTERED","REG","R",
    "ADR","GDR","CDR","DRN","BDR","ED","HEDGED","HEDGE","ADS","UNIT","UNITS","STOCK",
    "CLASS","CL","SERIES","THE","AND","A","B","C","D","I","II","III"
}

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

def company_key(name: str, symbol: str) -> str:
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode("ascii").upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    toks = []
    for t in text.split():
        if t in LISTING_WORDS or len(t) <= 1:
            continue
        if t in {"USD","EUR","CAD","CHF","GBP","BRL","MXN"}:
            continue
        s = t[:9] if len(t) > 9 else t
        if not toks or toks[-1] != s:
            toks.append(s)
    if not toks:
        return re.sub(r"[^A-Z0-9]", "", symbol.split(".")[0])
    return " ".join(toks[:7])

def representative_score(item: dict) -> tuple:
    region = str(item.get("region") or "").lower()
    exchange = str(item.get("exchange") or "").upper()
    name = str(item.get("name") or "").upper()
    symbol = str(item.get("symbol") or "")
    primary = 1 if exchange in PRIMARY_EXCHANGES.get(region, set()) else 0
    depositary = 1 if re.search(r"\b(ADR|GDR|CDR|DRN|BDR|ADS)\b", name) else 0
    volume = max(0.0, scalar(item.get("avgVolume"), 0))
    return (primary, -depositary, math.log10(volume + 1.0), -len(symbol), item.get("marketCapUSD", 0.0))

def main():
    rows=[]
    failures=[]
    for region in REGIONS:
        try:
            rows.extend(one_region(region))
        except Exception as e:
            failures.append(f"{region}: {e}")

    if len(rows) < 1500:
        for off in (0,250,500,750,1000):
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
        name=q.get("longName") or q.get("shortName") or q.get("displayName") or symbol
        item={
            "symbol":symbol,
            "name":name,
            "marketCap":market_cap_local,
            "marketCapUSD":market_cap_usd,
            "region":q.get("region"),
            "exchange":q.get("exchange"),
            "currency":currency,
            "sector":q.get("sector") or q.get("sectorDisp"),
            "industry":q.get("industry") or q.get("industryDisp"),
            "avgVolume":scalar(q.get("averageDailyVolume3Month"), scalar(q.get("averageDailyVolume10Day"), 0)),
        }
        item["companyKey"]=company_key(name,symbol)
        old=by_symbol.get(symbol)
        if old is None or market_cap_usd > old["marketCapUSD"]:
            by_symbol[symbol]=item

    # Internationale Listings werden zu EINER Firma gruppiert. Die Marktkapitalisierung fuer
    # die Rangfolge stammt bewusst von genau der ausgewaehlten repraesentativen Notierung;
    # ein fehlerhaft skaliertes Sekundaerlisting darf die Firma nicht kuenstlich aufblasen.
    by_company={}
    duplicate_listings=0
    for item in by_symbol.values():
        key=item["companyKey"]
        old=by_company.get(key)
        if old is None:
            by_company[key]=item
        else:
            duplicate_listings+=1
            if representative_score(item) > representative_score(old):
                by_company[key]=item

    unique=[dict(item) for item in by_company.values()]
    top=sorted(unique, key=lambda x:x["marketCapUSD"], reverse=True)[:500]

    if len(top) < 450:
        raise RuntimeError(f"Only {len(top)} unique FX-normalized companies found; refusing to overwrite existing universe. Failures: {failures[:5]}")

    payload={
        "generated_at":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "source":"yfinance Yahoo EquityQuery; global region aggregation; FX-normalized representative-listing market caps; international listings deduplicated to unique companies",
        "count":len(top),
        "unique_companies":len(top),
        "raw_unique_symbols":len(by_symbol),
        "duplicate_listings_collapsed":duplicate_listings,
        "equities":top
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(top)} unique FX-normalized companies to {OUT}; collapsed {duplicate_listings} duplicate listings")
    if failures:
        print("Warnings:", failures)

if __name__ == "__main__":
    main()