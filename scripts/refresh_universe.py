#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import math
import re
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf
from pypdf import PdfReader

OUT = Path(__file__).resolve().parents[1] / "public" / "universe.json"
TR_UNIVERSE_PDF = "https://assets.traderepublic.com/assets/files/DE/Instrument_Universe_DE_en.pdf"
REGIONS = ["us","ca","gb","de","fr","ch","nl","se","dk","no","fi","it","es","be","at","jp","hk","cn","tw","kr","in","au","sg","br","mx","za"]
PRIMARY_EXCHANGES = {"us":{"NMS","NYQ","NGM","NCM","ASE","PCX"},"ca":{"TOR","VAN","NEO"},"gb":{"LSE"},"de":{"GER"},"fr":{"PAR"},"ch":{"EBS"},"nl":{"AMS"},"se":{"STO"},"dk":{"CPH"},"no":{"OSL"},"fi":{"HEL"},"it":{"MIL"},"es":{"MCE"},"be":{"BRU"},"at":{"VIE"},"jp":{"JPX","TYO"},"hk":{"HKG"},"cn":{"SHH","SHZ"},"tw":{"TAI","TWO"},"kr":{"KSC","KOE"},"in":{"NSI","BSE"},"au":{"ASX"},"sg":{"SES"},"br":{"SAO"},"mx":{"MEX"},"za":{"JNB"}}
REGION_PAGE_OFFSETS = range(0, 1250, 250)
BROAD_PAGE_OFFSETS = range(0, 15000, 250)
MAX_PLAUSIBLE_MCAP_USD = 10_000_000_000_000.0
# This is a verified-only intersection, not the size of the full TR catalogue.
# The old 1,500-row guard made every refresh fail even when hundreds of uniquely
# verified equities were found. 120 still catches catastrophic provider/parser
# collapse while allowing the conservative verified subset to refresh.
MIN_SAFE_OUTPUT = 120
ISIN_RE = re.compile(r"\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b")
# Only legal-entity suffixes are relaxed. Share-class / instrument markers such
# as ADR, ADS, ORDINARY, SHARE(S) and STOCK deliberately remain significant so
# a unique legal-suffix match cannot silently cross to another security class.
LEGAL_WORDS = {"INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC","AG","SE","NV","SA","SPA","SAS","AB","ASA","OYJ","A/S","HOLDING","HOLDINGS","GROUP","THE","REGISTERED"}


def scalar(v, default=0):
    if isinstance(v, dict):
        for k in ("raw", "value"):
            if k in v:
                return scalar(v[k], default)
    try:
        return float(v)
    except Exception:
        return default


def ascii_words(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii").upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return [x for x in text.split() if x]


def exact_name_key(value):
    return " ".join(ascii_words(value))


def relaxed_name_key(value):
    words = [x for x in ascii_words(value) if x not in LEGAL_WORDS]
    return " ".join(words)


def download_tr_catalog():
    req = urllib.request.Request(TR_UNIVERSE_PDF, headers={"User-Agent": "KI-Markt-Planspiel/TradeRepublicUniverse/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if len(data) < 50_000:
        raise RuntimeError(f"Trade-Republic-PDF unexpectedly small: {len(data)} bytes")
    return data


def parse_tr_catalog(pdf_bytes):
    reader = PdfReader(io.BytesIO(pdf_bytes))
    records = []
    pending_isin = None
    for page in reader.pages:
        text = page.extract_text() or ""
        for raw in text.splitlines():
            line = " ".join(str(raw).split()).strip()
            if not line:
                continue
            hit = ISIN_RE.search(line)
            if hit:
                isin = hit.group(1)
                tail = line[hit.end():].strip(" -|;:\t")
                head = line[:hit.start()].strip(" -|;:\t")
                name = tail if len(tail) >= 2 else head if len(head) >= 2 else ""
                if name:
                    records.append({"isin": isin, "name": name})
                    pending_isin = None
                else:
                    pending_isin = isin
                continue
            if pending_isin and not re.search(r"^(ISIN|NAME|INSTRUMENT|TRADING|UNIVERSE|PAGE)\b", line, re.I):
                records.append({"isin": pending_isin, "name": line})
                pending_isin = None
    unique = {}
    for r in records:
        isin, name = r["isin"], r["name"].strip()
        if isin and name and isin not in unique:
            unique[isin] = {"isin": isin, "name": name}
    if len(unique) < 3000:
        raise RuntimeError(f"Only {len(unique)} instruments parsed from official Trade Republic universe PDF")
    return list(unique.values())


def build_name_indexes(records):
    exact = defaultdict(list)
    relaxed = defaultdict(list)
    for r in records:
        ek, rk = exact_name_key(r["name"]), relaxed_name_key(r["name"])
        if ek:
            exact[ek].append(r)
        if rk:
            relaxed[rk].append(r)
    return exact, relaxed


def unique_match(name, exact, relaxed):
    # First choice stays an exact normalized official-catalogue name.
    ek = exact_name_key(name)
    exact_candidates = exact.get(ek, [])
    if len(exact_candidates) == 1:
        return exact_candidates[0], "EXACT_NORMALIZED_NAME"

    # Safe breadth recovery: allow only a UNIQUE match after stripping legal
    # entity suffixes. Security-class markers are never stripped (see
    # LEGAL_WORDS), and ambiguous relaxed matches remain rejected.
    rk = relaxed_name_key(name)
    relaxed_candidates = relaxed.get(rk, []) if rk else []
    if len(relaxed_candidates) == 1:
        return relaxed_candidates[0], "UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME"
    return None, None


def one_region(region, offset=0):
    q = yf.EquityQuery("and", [yf.EquityQuery("eq", ["region", region]), yf.EquityQuery("gt", ["intradaymarketcap", 0])])
    return yf.screen(q, offset=offset, size=250, sortField="intradaymarketcap", sortAsc=False).get("quotes", [])


def broad_fallback(offset):
    q = yf.EquityQuery("gt", ["intradaymarketcap", 0])
    return yf.screen(q, offset=offset, size=250, sortField="intradaymarketcap", sortAsc=False).get("quotes", [])


def last_fx(symbol):
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
        if c == "GBp":
            r = last_fx("GBPUSD=X")
            if r > 0:
                fx[raw] = r / 100.0
            else:
                failures.append(raw)
            continue
        d = last_fx(f"{c}USD=X")
        if d > 0:
            fx[raw] = d
            continue
        inv = last_fx(f"USD{c}=X")
        if inv > 0:
            fx[raw] = 1.0 / inv
        else:
            failures.append(raw)
    return fx, failures


def company_key(name, symbol):
    words = [x for x in ascii_words(name) if x not in LEGAL_WORDS]
    return " ".join(words[:8]) if words else re.sub(r"[^A-Z0-9]", "", str(symbol).split(".")[0].upper())


def representative_score(item):
    region = str(item.get("region") or "").lower()
    ex = str(item.get("exchange") or "").upper()
    sym = str(item.get("symbol") or "")
    primary = 1 if ex in PRIMARY_EXCHANGES.get(region, set()) else 0
    vol = max(0.0, scalar(item.get("avgVolume"), 0))
    return (primary, math.log10(vol + 1.0), -len(sym), item.get("marketCapUSD", 0.0))


def main():
    official = parse_tr_catalog(download_tr_catalog())
    exact_index, relaxed_index = build_name_indexes(official)

    rows = []
    failures = []
    for region in REGIONS:
        for off in REGION_PAGE_OFFSETS:
            try:
                batch = one_region(region, off)
                rows.extend(batch)
                if len(batch) < 250:
                    break
            except Exception as e:
                failures.append(f"{region}-{off}: {e}")
                break
    for off in BROAD_PAGE_OFFSETS:
        try:
            batch = broad_fallback(off)
            rows.extend(batch)
            if len(batch) < 250:
                break
        except Exception as e:
            failures.append(f"broad-{off}: {e}")
            break

    raw = []
    currencies = []
    for q in rows:
        sym = str(q.get("symbol") or "").strip().upper()
        qt = str(q.get("quoteType") or "EQUITY").upper()
        mcap = scalar(q.get("marketCap"), scalar(q.get("intradaymarketcap"), 0))
        if not sym or qt not in ("EQUITY", "") or mcap <= 0:
            continue
        name = q.get("longName") or q.get("shortName") or q.get("displayName") or sym
        official_match, match_mode = unique_match(name, exact_index, relaxed_index)
        if not official_match:
            continue
        cur = str(q.get("currency") or "USD").strip() or "USD"
        currencies.append(cur)
        raw.append((q, sym, mcap, cur, name, official_match, match_mode))

    fx, fx_fail = build_fx_map(currencies)
    if fx_fail:
        failures.append("FX missing: " + ", ".join(sorted(set(fx_fail))))

    by_symbol = {}
    rejected_caps = 0
    for q, sym, mcap, cur, name, tr, match_mode in raw:
        rate = fx.get(cur)
        if not rate or rate <= 0:
            continue
        musd = mcap * rate
        if musd <= 0 or musd > MAX_PLAUSIBLE_MCAP_USD:
            rejected_caps += 1
            continue
        avgvol = scalar(q.get("averageDailyVolume3Month"), scalar(q.get("averageDailyVolume10Day"), 0))
        item = {
            "symbol": sym,
            "name": name,
            "isin": tr["isin"],
            "tradeRepublicName": tr["name"],
            "marketCap": mcap,
            "marketCapUSD": musd,
            "region": q.get("region"),
            "exchange": q.get("exchange"),
            "currency": cur,
            "sector": q.get("sector") or q.get("sectorDisp"),
            "industry": q.get("industry") or q.get("industryDisp"),
            "avgVolume": avgvol,
            "assetClass": "EQUITY",
            "brokerTarget": "Trade Republic",
            "venueTarget": "Trade Republic Bestpreis",
            "brokerCatalogCandidate": True,
            "brokerVerified": match_mode in ("EXACT_NORMALIZED_NAME", "UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME"),
            "brokerVerificationSource": "official Trade Republic Trading Universe PDF",
            "brokerMatchMode": match_mode,
        }
        item["companyKey"] = company_key(name, sym)
        old = by_symbol.get(sym)
        if old is None or representative_score(item) > representative_score(old):
            by_symbol[sym] = item

    by_isin = {}
    for item in by_symbol.values():
        old = by_isin.get(item["isin"])
        if old is None or representative_score(item) > representative_score(old):
            by_isin[item["isin"]] = item

    equities = sorted(by_isin.values(), key=lambda x: (x["marketCapUSD"], x.get("avgVolume", 0)), reverse=True)
    if len(equities) < MIN_SAFE_OUTPUT:
        raise RuntimeError(f"Only {len(equities)} conservatively matched Trade Republic stocks found; refusing overwrite. Failures: {failures[:5]}")

    match_counts = {
        "exact": sum(1 for x in equities if x.get("brokerMatchMode") == "EXACT_NORMALIZED_NAME"),
        "unique_legal_suffix": sum(1 for x in equities if x.get("brokerMatchMode") == "UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME"),
    }
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "official Trade Republic Trading Universe PDF intersected with Yahoo/yfinance EQUITY listings",
        "official_catalog_url": TR_UNIVERSE_PDF,
        "broker_target": "Trade Republic",
        "venue_target": "Trade Republic Bestpreis",
        "asset_class": "EQUITY_ONLY",
        "stocks_only": True,
        "exact_broker_catalog": True,
        "catalog_is_conservative_subset": True,
        "symbol_mapping_mode": "official ISIN/name catalog -> exact normalized or unique legal-suffix-normalized Yahoo equity name",
        "broker_verification_required_before_live_order": True,
        "temporary_broker_unavailability_possible": True,
        "official_catalog_instruments_parsed": len(official),
        "count": len(equities),
        "unique_companies": len(equities),
        "raw_unique_symbols": len(by_symbol),
        "duplicate_listings_collapsed": max(0, len(by_symbol) - len(equities)),
        "rejected_implausible_market_caps": rejected_caps,
        "match_counts": match_counts,
        "selection_note": "Nur normale Aktien, die im offiziellen Trade-Republic-Handelsuniversum entweder per exaktem normalisiertem Namen oder per eindeutigem Legal-Suffix-Match wiedergefunden wurden, werden an Scanner und Paper-Trading weitergegeben. Share-Class-/ADR-/ADS-Marker bleiben beim Relaxed-Match signifikant; mehrdeutige oder fuzzy Matches sind verboten. Vor einer spaeteren echten Order muss die aktuelle Verfuegbarkeit in Trade Republic trotzdem erneut geprueft werden.",
        "equities": equities,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(equities)} verified Trade Republic stock candidates from {len(official)} official catalog instruments ({match_counts})")
    if failures:
        print("Warnings:", failures)


if __name__ == "__main__":
    main()
