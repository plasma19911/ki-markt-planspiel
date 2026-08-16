from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
START = pd.Timestamp("2026-01-01")
TODAY = pd.Timestamp.now(tz="Europe/Berlin").tz_localize(None).normalize()
END = TODAY + pd.Timedelta(days=1)
START_CAPITAL = 100.0
FEE_FIXED = 1.0
FEE_PERCENT = 0.0
SLIPPAGE = 0.001  # 0.10 % je Ausfuehrung
BATCH = 45

STYLE = {
    "vorsichtig": {"entry": 6.2, "stop": -0.018, "take": 0.035},
    "ausgewogen": {"entry": 5.2, "stop": -0.025, "take": 0.055},
    "offensiv": {"entry": 4.2, "stop": -0.035, "take": 0.075},
}


def read_text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def normalize_currency(cur: Optional[str], symbol: str) -> Tuple[str, float]:
    c = (cur or "").strip()
    if c.upper() in {"GBP", "GBX", "GBP.", "GBPENCE"} or c == "GBp":
        return ("GBP", 0.01 if c != "GBP" else 1.0)
    if c in {"ZAc", "ZAC"}:
        return ("ZAR", 0.01)
    if c:
        return (c.upper(), 1.0)
    s = symbol.upper()
    rules = [
        (r"\.(DE|PA|BR|MI|MC|AS)$", "EUR"), (r"\.L$", "GBP"), (r"\.SW$", "CHF"),
        (r"\.ST$", "SEK"), (r"\.OL$", "NOK"), (r"\.T$", "JPY"),
        (r"\.(KS|KQ)$", "KRW"), (r"\.(TW|TWO)$", "TWD"), (r"\.HK$", "HKD"),
        (r"\.(SS|SZ)$", "CNY"), (r"\.(NS|BO)$", "INR"), (r"\.AX$", "AUD"),
        (r"\.(TO|V)$", "CAD"), (r"\.SA$", "BRL"), (r"\.JO$", "ZAR"),
    ]
    for pat, val in rules:
        if re.search(pat, s):
            return val, 1.0
    return "USD", 1.0


def load_universe() -> List[dict]:
    data = json.loads(read_text("public/universe.json"))
    items: List[dict] = []
    for x in data.get("equities", []):
        if not x.get("symbol"):
            continue
        cur, scale = normalize_currency(x.get("currency"), x["symbol"])
        items.append({"symbol": x["symbol"].upper(), "name": x.get("name") or x["symbol"], "type": "EQUITY", "currency": cur, "unitScale": scale})

    # Zusatzaktien aus priority-equities.js
    ptxt = read_text("src/priority-equities.js")
    for sym, name, _theme in re.findall(r"\['([^']+)','([^']+)','([^']+)'\]", ptxt):
        cur, scale = normalize_currency(None, sym)
        items.append({"symbol": sym.upper(), "name": name, "type": "EQUITY", "currency": cur, "unitScale": scale})

    # Nur normale ETFs. Hebel-/Inverse-ETFs sind bewusst komplett ausgeschlossen.
    ctxt = read_text("src/constants.js")
    block = ctxt.split("export const CORE_ETFS = [", 1)[1].split("].map", 1)[0]
    for sym, name in re.findall(r"\['([^']+)','([^']+)'\]", block):
        cur, scale = normalize_currency(None, sym)
        items.append({"symbol": sym.upper(), "name": name, "type": "ETF", "currency": cur, "unitScale": scale})

    out, seen = [], set()
    for x in items:
        if x["symbol"] in seen:
            continue
        seen.add(x["symbol"])
        out.append(x)
    return out


def extract_symbol_frame(raw: pd.DataFrame, sym: str) -> pd.DataFrame:
    if raw is None or raw.empty:
        return pd.DataFrame()
    try:
        if isinstance(raw.columns, pd.MultiIndex):
            l0 = raw.columns.get_level_values(0)
            l1 = raw.columns.get_level_values(1)
            if sym in l0:
                df = raw[sym].copy()
            elif sym in l1:
                df = raw.xs(sym, axis=1, level=1).copy()
            else:
                return pd.DataFrame()
        else:
            df = raw.copy()
        cols = {str(c).lower().replace(" ", ""): c for c in df.columns}
        close_col = cols.get("close") or cols.get("adjclose")
        if close_col is None:
            return pd.DataFrame()
        vol_col = cols.get("volume")
        out = pd.DataFrame(index=pd.to_datetime(df.index).tz_localize(None).normalize())
        out["close"] = pd.to_numeric(df[close_col], errors="coerce")
        out["volume"] = pd.to_numeric(df[vol_col], errors="coerce") if vol_col is not None else 0.0
        return out.replace([np.inf, -np.inf], np.nan).dropna(subset=["close"])
    except Exception:
        return pd.DataFrame()


def download_series(universe: List[dict]) -> Tuple[Dict[str, pd.DataFrame], List[str]]:
    series: Dict[str, pd.DataFrame] = {}
    failed: List[str] = []
    symbols = [x["symbol"] for x in universe]
    for pos in range(0, len(symbols), BATCH):
        batch = symbols[pos:pos + BATCH]
        try:
            raw = yf.download(
                tickers=" ".join(batch), start=START.strftime("%Y-%m-%d"), end=END.strftime("%Y-%m-%d"),
                interval="1d", auto_adjust=True, actions=False, group_by="ticker", threads=True, progress=False,
                timeout=25,
            )
        except Exception:
            failed.extend(batch)
            continue
        for sym in batch:
            df = extract_symbol_frame(raw, sym)
            if len(df) >= 2:
                series[sym] = df
            else:
                failed.append(sym)
    return series, failed


def download_fx(currencies: List[str]) -> Dict[str, pd.Series]:
    currencies = sorted({c for c in currencies if c and c != "EUR"})
    out: Dict[str, pd.Series] = {"EUR": pd.Series(1.0, index=pd.date_range(START, TODAY, freq="D"))}
    if not currencies:
        return out
    pairs = []
    for c in currencies:
        pairs += [f"{c}EUR=X", f"EUR{c}=X"]
    for pos in range(0, len(pairs), BATCH):
        batch = pairs[pos:pos + BATCH]
        try:
            raw = yf.download(
                tickers=" ".join(batch), start=START.strftime("%Y-%m-%d"), end=END.strftime("%Y-%m-%d"),
                interval="1d", auto_adjust=True, actions=False, group_by="ticker", threads=True, progress=False,
                timeout=25,
            )
        except Exception:
            continue
        for sym in batch:
            df = extract_symbol_frame(raw, sym)
            if not df.empty:
                out[sym] = df["close"].copy()

    result: Dict[str, pd.Series] = {"EUR": out["EUR"]}
    full_index = pd.date_range(START, TODAY, freq="D")
    for c in currencies:
        direct = out.get(f"{c}EUR=X")
        inverse = out.get(f"EUR{c}=X")
        if direct is not None and not direct.empty:
            s = direct.reindex(full_index).ffill().bfill()
        elif inverse is not None and not inverse.empty:
            s = (1.0 / inverse).reindex(full_index).ffill().bfill()
        else:
            s = pd.Series(1.0, index=full_index)
        result[c] = s
    return result


def to_eur_series(universe: List[dict], series: Dict[str, pd.DataFrame], fx: Dict[str, pd.Series]) -> Dict[str, pd.DataFrame]:
    meta = {x["symbol"]: x for x in universe}
    out: Dict[str, pd.DataFrame] = {}
    for sym, df in series.items():
        m = meta[sym]
        rate = fx.get(m["currency"])
        if rate is None:
            rate = pd.Series(1.0, index=pd.date_range(START, TODAY, freq="D"))
        aligned = rate.reindex(df.index).ffill().bfill().fillna(1.0)
        x = df.copy()
        x["eur"] = x["close"] * float(m.get("unitScale", 1.0)) * aligned
        x = x[(x["eur"] > 0) & np.isfinite(x["eur"])]
        if len(x) >= 2:
            out[sym] = x
    return out


@dataclass
class Node:
    prev: Optional["Node"]
    event: dict


def fee_for(order_value: float) -> float:
    return FEE_FIXED + max(0.0, order_value) * FEE_PERCENT / 100.0


def buy_shares(cash: float, price_eur: float) -> Tuple[float, float]:
    if cash <= FEE_FIXED or price_eur <= 0:
        return 0.0, 0.0
    # fee percent is currently 0, but formula remains correct if changed later.
    order_value = max(0.0, (cash - FEE_FIXED) / (1.0 + FEE_PERCENT / 100.0))
    fee = fee_for(order_value)
    shares = order_value / (price_eur * (1.0 + SLIPPAGE))
    return shares, fee


def sell_cash(shares: float, price_eur: float) -> Tuple[float, float]:
    gross = shares * price_eur * (1.0 - SLIPPAGE)
    fee = fee_for(gross)
    return max(0.0, gross - fee), fee


def perfect_hindsight(universe: List[dict], eur: Dict[str, pd.DataFrame]) -> dict:
    meta = {x["symbol"]: x for x in universe}
    all_dates = sorted({d for df in eur.values() for d in df.index})
    if not all_dates:
        raise RuntimeError("Keine 2026-Kursdaten fuer die perfekte Rueckschau.")

    cash = START_CAPITAL
    cash_node: Optional[Node] = None
    shares: Dict[str, float] = {}
    nodes: Dict[str, Optional[Node]] = {}

    price_maps = {sym: df["eur"].to_dict() for sym, df in eur.items()}
    native_maps = {sym: df["close"].to_dict() for sym, df in eur.items()}

    for date in all_dates:
        # Erst bestes verfuegbares Cash nach moeglichem Verkauf bestimmen.
        best_cash, best_node = cash, cash_node
        for sym, sh in list(shares.items()):
            p = price_maps[sym].get(date)
            if p is None:
                continue
            proceeds, fee = sell_cash(sh, p)
            if proceeds > best_cash + 1e-10:
                best_cash = proceeds
                m = meta[sym]
                best_node = Node(nodes.get(sym), {
                    "action": "SELL", "date": date.strftime("%Y-%m-%d"), "symbol": sym, "name": m["name"], "type": m["type"],
                    "nativePrice": float(native_maps[sym][date]), "eurPrice": float(p), "fee": fee, "cashAfter": proceeds,
                })
        cash, cash_node = best_cash, best_node

        # Fuer jedes Asset ist entweder Halten oder Neu-Kaufen aus dem besten Cash optimal.
        new_shares = dict(shares)
        new_nodes = dict(nodes)
        for sym, df in eur.items():
            p = price_maps[sym].get(date)
            if p is None:
                continue
            hold_value = shares.get(sym, 0.0) * p
            sh, fee = buy_shares(cash, p)
            buy_value = sh * p
            if sh > 0 and buy_value > hold_value + 1e-10:
                m = meta[sym]
                new_shares[sym] = sh
                new_nodes[sym] = Node(cash_node, {
                    "action": "BUY", "date": date.strftime("%Y-%m-%d"), "symbol": sym, "name": m["name"], "type": m["type"],
                    "nativePrice": float(native_maps[sym][date]), "eurPrice": float(p), "fee": fee, "cashBefore": cash,
                })
        shares, nodes = new_shares, new_nodes

    # Letzte moegliche Verkaeufe sind bereits in cash eingegangen; Sicherheitshalber erneut pruefen.
    for sym, sh in list(shares.items()):
        df = eur[sym]
        date = df.index[-1]
        p = float(df.loc[date, "eur"])
        proceeds, fee = sell_cash(sh, p)
        if proceeds > cash + 1e-10:
            m = meta[sym]
            cash = proceeds
            cash_node = Node(nodes.get(sym), {
                "action": "SELL", "date": date.strftime("%Y-%m-%d"), "symbol": sym, "name": m["name"], "type": m["type"],
                "nativePrice": float(df.loc[date, "close"]), "eurPrice": p, "fee": fee, "cashAfter": proceeds,
            })

    events: List[dict] = []
    n = cash_node
    while n is not None:
        events.append(n.event)
        n = n.prev
    events.reverse()

    trades, open_buy = [], None
    for e in events:
        if e["action"] == "BUY":
            open_buy = e
        elif e["action"] == "SELL" and open_buy and open_buy["symbol"] == e["symbol"]:
            start_cash = float(open_buy["cashBefore"])
            end_cash = float(e["cashAfter"])
            trades.append({
                "symbol": e["symbol"], "name": e["name"], "type": e["type"],
                "buyAt": open_buy["date"], "sellAt": e["date"], "buyPrice": open_buy["nativePrice"], "sellPrice": e["nativePrice"],
                "buyFee": open_buy["fee"], "sellFee": e["fee"], "capitalBefore": start_cash, "capitalAfter": end_cash,
                "pnl": end_cash - start_cash, "returnPct": (end_cash / start_cash - 1.0) * 100.0 if start_cash else 0.0,
            })
            open_buy = None

    return {
        "title": "Perfekter Rueckblick",
        "startCapital": START_CAPITAL,
        "endCapital": cash,
        "profit": cash - START_CAPITAL,
        "returnPct": (cash / START_CAPITAL - 1.0) * 100.0,
        "trades": trades,
        "events": events,
        "note": "Vollstaendiges Zukunftswissen. Exakte dynamische Optimierung innerhalb des verwendeten Tages-Schlusskurs-/Fractional-Share-Modells; keine Hebelprodukte, keine Steuern. Gebuehren und 0,10 % Ausfuehrungspuffer je Seite sind enthalten.",
    }


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    d = series.diff()
    gain = d.clip(lower=0).rolling(period).mean()
    loss = (-d.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    out = 100 - 100 / (1 + rs)
    return out.fillna(100.0)


def signal_frame(df: pd.DataFrame) -> pd.DataFrame:
    x = df.copy()
    c = x["eur"]
    x["ema9"] = c.ewm(span=9, adjust=False).mean()
    x["ema21"] = c.ewm(span=21, adjust=False).mean()
    x["rsi"] = rsi(c, 14)
    x["m5"] = c.pct_change(5) * 100
    x["m20"] = c.pct_change(20) * 100
    x["day"] = c.pct_change() * 100
    x["vavg"] = x["volume"].shift(1).rolling(20).mean()
    x["vr"] = (x["volume"] / x["vavg"].replace(0, np.nan)).fillna(1.0)
    scores = []
    for _, row in x.iterrows():
        score = 0.0
        score += 1.7 if row["ema9"] > row["ema21"] else -1.0
        score += 0.8 if row["eur"] > row["ema21"] else -0.6
        rr = row["rsi"]
        if 48 <= rr <= 68:
            score += 1.0
        elif rr >= 78:
            score -= 1.5
        elif rr <= 32:
            score -= 0.8
        if pd.notna(row["m5"]):
            if row["m5"] > 0.18: score += 0.8
            elif row["m5"] < -0.25: score -= 0.9
        if pd.notna(row["m20"]):
            if row["m20"] > 0.5: score += 1.2
            elif row["m20"] < -0.5: score -= 1.2
        if row["vr"] > 1.5: score += 0.7
        if pd.notna(row["day"]):
            if row["day"] > 1: score += 0.4
            elif row["day"] < -1: score -= 0.5
        scores.append(score)
    x["score"] = scores
    x["confidence"] = (0.28 + (x["score"].abs() / 10.0).clip(upper=0.35) + ((x["vr"] - 1) / 4.0).clip(lower=0, upper=0.12)).clip(0, 1)
    return x


def walk_forward(universe: List[dict], eur: Dict[str, pd.DataFrame], style_name: str) -> dict:
    style = STYLE[style_name]
    meta = {x["symbol"]: x for x in universe}
    sig = {sym: signal_frame(df) for sym, df in eur.items() if len(df) >= 22}
    dates = sorted({d for df in sig.values() for d in df.index})
    cash = START_CAPITAL
    holdings: Dict[str, dict] = {}
    trades: List[dict] = []
    actions: List[dict] = []

    for date in dates:
        # 1) Exits nur mit Daten dieses Tages und Vergangenheit.
        for sym in list(holdings):
            df = sig.get(sym)
            if df is None or date not in df.index:
                continue
            row = df.loc[date]
            h = holdings[sym]
            p = float(row["eur"])
            mark = h["shares"] * p
            pnl_pct = mark / h["capitalBefore"] - 1.0 if h["capitalBefore"] else 0.0
            why = None
            if pnl_pct <= style["stop"]:
                why = f"Stop {pnl_pct*100:.2f}%"
            elif pnl_pct >= style["take"]:
                why = f"Gewinnziel {pnl_pct*100:.2f}%"
            elif float(row["score"]) < 0:
                why = f"Signal gefallen auf {float(row['score']):.2f}"
            if why:
                proceeds, fee = sell_cash(h["shares"], p)
                cash += proceeds
                pnl = proceeds - h["capitalBefore"]
                sell = {"action": "SELL", "date": date.strftime("%Y-%m-%d"), "symbol": sym, "name": meta[sym]["name"], "type": meta[sym]["type"], "fee": fee, "reason": why}
                actions.append(sell)
                trades.append({
                    "symbol": sym, "name": meta[sym]["name"], "type": meta[sym]["type"], "buyAt": h["buyAt"], "sellAt": sell["date"],
                    "capitalBefore": h["capitalBefore"], "capitalAfter": proceeds, "pnl": pnl,
                    "returnPct": pnl / h["capitalBefore"] * 100.0 if h["capitalBefore"] else 0.0,
                    "buyFee": h["buyFee"], "sellFee": fee, "reason": why,
                })
                del holdings[sym]

        # 2) Kandidaten aus genau den bis heute verfuegbaren Signalen.
        candidates = []
        for sym, df in sig.items():
            if sym in holdings or date not in df.index:
                continue
            pos = df.index.get_loc(date)
            if isinstance(pos, slice) or pos < 21:
                continue
            row = df.loc[date]
            score, conf = float(row["score"]), float(row["confidence"])
            if score < style["entry"] or conf < 0.55:
                continue
            candidates.append((sym, score, conf, float(row["eur"])))
        candidates.sort(key=lambda z: (z[1] + z[2]), reverse=True)
        candidates = candidates[:12]  # entspricht dem aktuellen Deep-Scan-Fenster, keine Portfolio-Grenze
        if not candidates or cash <= FEE_FIXED:
            continue

        # Kostenbewusste freie Verteilung. Kleine Orders werden nicht verboten, sondern nur verworfen,
        # wenn die geschaetzte Signalkante die realen Roundtrip-Kosten nicht deckt.
        active = []
        for sym, score, conf, price in candidates:
            edge = max(0.01, (score - style["entry"] + conf))
            active.append([sym, score, conf, price, edge])
        for _ in range(3):
            if not active:
                break
            total_w = sum(x[4] for x in active)
            kept = []
            for x in active:
                alloc = cash * x[4] / total_w
                roundtrip_pct = (2 * FEE_FIXED / max(alloc, 0.01)) * 100 + 2 * SLIPPAGE * 100 + 2 * FEE_PERCENT
                expected_edge_pct = max(0.6, (x[1] - style["entry"] + 1.0) * 1.2)
                if expected_edge_pct > roundtrip_pct * 1.05:
                    kept.append(x)
            if len(kept) == len(active):
                break
            active = kept
        if not active:
            continue

        total_w = sum(x[4] for x in active)
        starting_cash = cash
        spent = 0.0
        for i, (sym, score, conf, price, w) in enumerate(active):
            budget = starting_cash * w / total_w
            if i == len(active) - 1:
                budget = max(0.0, starting_cash - spent)
            sh, fee = buy_shares(budget, price)
            if sh <= 0:
                continue
            used = sh * price * (1 + SLIPPAGE) + fee
            if used > cash + 1e-8:
                continue
            cash -= used
            spent += used
            holdings[sym] = {"shares": sh, "capitalBefore": used, "buyAt": date.strftime("%Y-%m-%d"), "buyFee": fee}
            actions.append({"action": "BUY", "date": date.strftime("%Y-%m-%d"), "symbol": sym, "name": meta[sym]["name"], "type": meta[sym]["type"], "fee": fee, "score": score, "confidence": conf, "reason": f"Score {score:.2f}, Konfidenz {conf*100:.0f}%"})

    # Zum Ende nur fuer die Auswertung zum letzten verfuegbaren Kurs glattstellen.
    for sym in list(holdings):
        df = sig[sym]
        date = df.index[-1]
        p = float(df.loc[date, "eur"])
        h = holdings[sym]
        proceeds, fee = sell_cash(h["shares"], p)
        cash += proceeds
        pnl = proceeds - h["capitalBefore"]
        trades.append({
            "symbol": sym, "name": meta[sym]["name"], "type": meta[sym]["type"], "buyAt": h["buyAt"], "sellAt": date.strftime("%Y-%m-%d"),
            "capitalBefore": h["capitalBefore"], "capitalAfter": proceeds, "pnl": pnl,
            "returnPct": pnl / h["capitalBefore"] * 100.0 if h["capitalBefore"] else 0.0,
            "buyFee": h["buyFee"], "sellFee": fee, "reason": "Auswertungsende",
        })
        actions.append({"action": "SELL", "date": date.strftime("%Y-%m-%d"), "symbol": sym, "name": meta[sym]["name"], "type": meta[sym]["type"], "fee": fee, "reason": "Auswertungsende"})
        del holdings[sym]

    wins = sum(1 for t in trades if t["pnl"] > 0)
    return {
        "title": "KI haette damals gemacht",
        "style": style_name,
        "startCapital": START_CAPITAL,
        "endCapital": cash,
        "profit": cash - START_CAPITAL,
        "returnPct": (cash / START_CAPITAL - 1.0) * 100.0,
        "trades": trades,
        "actions": actions,
        "winRate": wins / len(trades) * 100.0 if trades else 0.0,
        "note": "Echter Walk-Forward ohne Zukunftsdaten: Jeder Tag nutzt nur bis dahin bekannte Tageskurse und Volumina. Historische News und historische 1-Minuten-Daten sind fuer den gesamten Zeitraum nicht verlaesslich rekonstruierbar und werden daher nicht erfunden; das Ergebnis ist eine konservative Rekonstruktion der heutigen Markt-/Signallogik, nicht eine exakte Wiederholung aller Live-KI-Entscheidungen.",
    }


def main() -> None:
    universe = load_universe()
    raw, failed = download_series(universe)
    usable_universe = [x for x in universe if x["symbol"] in raw]
    fx = download_fx([x["currency"] for x in usable_universe])
    eur = to_eur_series(usable_universe, raw, fx)
    usable_universe = [x for x in usable_universe if x["symbol"] in eur]

    perfect = perfect_hindsight(usable_universe, eur)
    walk = {style: walk_forward(usable_universe, eur, style) for style in STYLE}
    counts = {
        "equities": sum(1 for x in usable_universe if x["type"] == "EQUITY"),
        "etfs": sum(1 for x in usable_universe if x["type"] == "ETF"),
        "leveragedEtfs": 0,
    }
    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": {"from": "2026-01-01", "to": TODAY.strftime("%Y-%m-%d")},
        "startCapital": START_CAPITAL,
        "baseCurrency": "EUR",
        "universe": counts,
        "scannedSymbols": len(universe),
        "usableSymbols": len(usable_universe),
        "failedSymbols": len(failed),
        "assumptions": {
            "assets": "Aktien + normale ETFs; keine Hebel-/Inverse-Produkte",
            "fractionalShares": True,
            "fixedFeePerOrder": FEE_FIXED,
            "percentFee": FEE_PERCENT,
            "slippagePerSidePct": SLIPPAGE * 100,
            "taxesIncluded": False,
            "dataInterval": "1d adjusted close + volume",
        },
        "perfect": perfect,
        "walkForward": walk,
    }
    path = ROOT / "public" / "analysis-2026.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {path}: {len(usable_universe)} usable symbols; perfect end EUR {perfect['endCapital']:.2f}")


if __name__ == "__main__":
    main()
