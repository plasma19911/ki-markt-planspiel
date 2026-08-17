#!/usr/bin/env python3
"""Konservative historische Kalibrierung fuer den Fast-Decision-Layer.

Nutzt 15-Minuten-Daten eines breiten, liquiden Samples. Die Kalibrierung darf nur
enge, vorher definierte Grenzen veraendern. Sie optimiert keine Einzelaktie und
schreibt keine Kaufempfehlungen, sondern globale Schwellen nach src/generated-fast-calibration.js.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
UNIVERSE = ROOT / "public" / "universe.json"
OUTPUT = ROOT / "src" / "generated-fast-calibration.js"
MAX_SYMBOLS = 45
MIN_OBSERVATIONS = 180
FORWARD_BARS = 12  # ca. 3 Handelsstunden bei 15m


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(v)))


def rsi(s: pd.Series, p: int = 14) -> pd.Series:
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1 / p, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / p, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)


def adx_frame(df: pd.DataFrame, p: int = 14) -> pd.DataFrame:
    high, low, close = df["High"], df["Low"], df["Close"]
    up = high.diff()
    down = -low.diff()
    plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0), index=df.index)
    minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0), index=df.index)
    tr = pd.concat([(high - low), (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / p, adjust=False).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1 / p, adjust=False).mean() / atr.replace(0, np.nan)
    minus_di = 100 * minus_dm.ewm(alpha=1 / p, adjust=False).mean() / atr.replace(0, np.nan)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return pd.DataFrame({"atr": atr, "adx": dx.ewm(alpha=1 / p, adjust=False).mean(), "plus_di": plus_di, "minus_di": minus_di})


def feature_rows(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    cols = {str(c).title(): c for c in df.columns}
    needed = ["Open", "High", "Low", "Close", "Volume"]
    if not all(k in cols for k in needed):
        return pd.DataFrame()
    x = pd.DataFrame({k: pd.to_numeric(df[cols[k]], errors="coerce") for k in needed}).dropna(subset=["High", "Low", "Close"])
    if len(x) < 80:
        return pd.DataFrame()
    e9 = x.Close.ewm(span=9, adjust=False).mean()
    e21 = x.Close.ewm(span=21, adjust=False).mean()
    w = adx_frame(x)
    vol_avg = x.Volume.shift().rolling(20, min_periods=8).mean()
    vol_ratio = x.Volume / vol_avg.replace(0, np.nan)
    mom1h = (x.Close / x.Close.shift(4) - 1) * 100
    mom3h = (x.Close / x.Close.shift(12) - 1) * 100
    forward = (x.Close.shift(-FORWARD_BARS) / x.Close - 1) * 100
    rr = rsi(x.Close)

    buy_score = (
        (mom1h > 0.18).astype(float) * 1.0
        + (mom3h > 0.45).astype(float) * 1.0
        + (e9 > e21).astype(float) * 1.0
        + ((w.adx >= 20) & (w.plus_di > w.minus_di)).astype(float) * 1.1
        + (vol_ratio >= 1.25).astype(float) * 0.55
        + ((rr >= 48) & (rr <= 72)).astype(float) * 0.45
        - (rr >= 80).astype(float) * 0.8
    )
    sell_score = (
        (mom1h < -0.18).astype(float) * 1.0
        + (mom3h < -0.45).astype(float) * 1.0
        + (e9 < e21).astype(float) * 1.0
        + ((w.adx >= 20) & (w.minus_di > w.plus_di)).astype(float) * 1.1
        + ((vol_ratio >= 1.25) & (mom1h < 0)).astype(float) * 0.55
        + (rr <= 38).astype(float) * 0.35
    )
    out = pd.DataFrame({"symbol": symbol, "buy_score": buy_score, "sell_score": sell_score, "forward": forward, "adx": w.adx, "vol_ratio": vol_ratio}).replace([np.inf, -np.inf], np.nan).dropna()
    return out.iloc[30:-FORWARD_BARS] if len(out) > 50 else pd.DataFrame()


def pick_symbols() -> list[str]:
    data = json.loads(UNIVERSE.read_text(encoding="utf-8"))
    rows = [x for x in data.get("equities", []) if x.get("symbol")]
    # Marktgroesse/Liquiditaet priorisieren, aber Regionen mischen.
    rows.sort(key=lambda x: float(x.get("marketCapUSD") or x.get("marketCap") or 0), reverse=True)
    chosen, regions = [], {}
    for x in rows:
        sym = str(x["symbol"]).upper()
        region = str(x.get("region") or "OTHER")
        if regions.get(region, 0) >= 12:
            continue
        if any(bad in sym for bad in ["^", "=", "/"]):
            continue
        chosen.append(sym)
        regions[region] = regions.get(region, 0) + 1
        if len(chosen) >= MAX_SYMBOLS:
            break
    return chosen


def split_symbol_frame(raw: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if isinstance(raw.columns, pd.MultiIndex):
        if symbol in raw.columns.get_level_values(0):
            return raw[symbol].copy()
        if symbol in raw.columns.get_level_values(-1):
            return raw.xs(symbol, axis=1, level=-1).copy()
    return raw.copy() if len(symbols_global) == 1 else pd.DataFrame()


def threshold_quality(rows: pd.DataFrame, col: str, threshold: float, positive: bool) -> tuple[float, int, float]:
    s = rows[rows[col] >= threshold]
    if len(s) < 80:
        return (-999.0, len(s), 0.0)
    f = s.forward if positive else -s.forward
    mean = float(f.mean())
    hit = float((f > 0).mean())
    # Hit-Rate und Erwartungswert kombinieren, kleine Samples leicht bestrafen.
    quality = mean * 0.65 + (hit - 0.5) * 1.4 + min(0.18, math.log10(max(len(s), 10)) * 0.04)
    return quality, len(s), hit


def main() -> None:
    global symbols_global
    symbols_global = pick_symbols()
    raw = yf.download(symbols_global, period="60d", interval="15m", group_by="ticker", auto_adjust=False, threads=True, progress=False)
    frames = []
    for sym in symbols_global:
        try:
            f = feature_rows(split_symbol_frame(raw, sym), sym)
            if not f.empty:
                frames.append(f)
        except Exception:
            continue
    if not frames:
        raise SystemExit("Keine verwertbaren historischen Intraday-Daten erhalten.")
    rows = pd.concat(frames, ignore_index=True).dropna()
    if len(rows) < MIN_OBSERVATIONS:
        raise SystemExit(f"Zu wenig Kalibrierungsdaten: {len(rows)}")

    buy_candidates = np.arange(3.8, 4.81, 0.2)
    sell_candidates = np.arange(3.6, 4.61, 0.2)
    buy_rank = sorted((threshold_quality(rows, "buy_score", float(t), True) + (float(t),) for t in buy_candidates), reverse=True)
    sell_rank = sorted((threshold_quality(rows, "sell_score", float(t), False) + (float(t),) for t in sell_candidates), reverse=True)
    bq, bn, bh, bt = buy_rank[0]
    sq, sn, sh, st = sell_rank[0]

    # Nur konservative Anpassungen; historische Optimierung darf die Sicherheitsgrenzen nicht aufweichen.
    buy = round(clamp(bt, 3.9, 4.7), 2)
    sell = round(clamp(st, 3.7, 4.5), 2)
    validated = bn >= 100 and sn >= 100 and bq > 0 and sq > 0
    if not validated:
        buy, sell = 4.2, 4.0

    now = datetime.now(timezone.utc).isoformat()
    content = f"""// Automatisch erzeugt durch scripts/calibrate_fast_signals.py.\nexport const FAST_CALIBRATION={{\n  version:'historical-15m-v1',\n  generatedAt:'{now}',\n  sampleCount:{len(rows)},\n  validated:{str(validated).lower()},\n  buyThreshold:{buy:.2f},\n  sellThreshold:{sell:.2f},\n  maxSpreadPct:0.80,\n  minAdxBuy:18,\n  strongAdx:22,\n  maxAtrPctBuy:2.50,\n  minRelativeVolume:1.10,\n  trailing:{{activatePnlPct:2.0,minGivebackPct:0.8,maxGivebackPct:2.2,givebackShare:0.34}},\n  validation:{{buySamples:{bn},buyHitRate:{bh:.4f},buyQuality:{bq:.4f},sellSamples:{sn},sellHitRate:{sh:.4f},sellQuality:{sq:.4f},symbols:{len(frames)}}}\n}};\n"""
    OUTPUT.write_text(content, encoding="utf-8")
    print(json.dumps({"rows": len(rows), "symbols": len(frames), "validated": validated, "buyThreshold": buy, "sellThreshold": sell, "buyHitRate": bh, "sellHitRate": sh}, indent=2))


symbols_global: list[str] = []
if __name__ == "__main__":
    main()
