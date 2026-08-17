#!/usr/bin/env python3
"""Konservative historische Kalibrierung fuer den Fast-Decision-Layer.

Nutzt 15-Minuten-Daten eines breiten, liquiden Samples. Schwellen werden auf einem
zeitlich frueheren Trainingsfenster gewaehlt und auf einem spaeteren, mit Abstand
getrennten Holdout-Fenster validiert. Weil der historische Core-Score nicht exakt dem
Live-Fast-Score entspricht, darf die Historie die Live-Schwellen nur leicht verschieben.
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
TRAIN_FRACTION = 0.70
PURGE_BARS = FORWARD_BARS
BASE_RUNTIME_BUY = 4.20
BASE_RUNTIME_SELL = 4.00
CORE_REFERENCE_BUY = 4.20
CORE_REFERENCE_SELL = 4.00
MAX_RUNTIME_SHIFT = 0.25


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
    out = pd.DataFrame({
        "timestamp": pd.to_datetime(x.index, utc=True, errors="coerce"),
        "symbol": symbol,
        "buy_score": buy_score,
        "sell_score": sell_score,
        "forward": forward,
        "adx": w.adx,
        "vol_ratio": vol_ratio,
    }).replace([np.inf, -np.inf], np.nan).dropna()
    return out.iloc[30:-FORWARD_BARS] if len(out) > 50 else pd.DataFrame()


def pick_symbols() -> list[str]:
    data = json.loads(UNIVERSE.read_text(encoding="utf-8"))
    rows = [x for x in data.get("equities", []) if x.get("symbol")]
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


def threshold_quality(rows: pd.DataFrame, col: str, threshold: float, positive: bool) -> tuple[float, int, float, float]:
    s = rows[rows[col] >= threshold]
    if len(s) < 40:
        return (-999.0, len(s), 0.0, 0.0)
    f = s.forward if positive else -s.forward
    mean = float(f.mean())
    hit = float((f > 0).mean())
    quality = mean * 0.65 + (hit - 0.5) * 1.4 + min(0.18, math.log10(max(len(s), 10)) * 0.04)
    return quality, len(s), hit, mean


def temporal_split(rows: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    train, holdout = [], []
    for _, g in rows.groupby("symbol", sort=False):
        g = g.sort_values("timestamp").reset_index(drop=True)
        cut = int(len(g) * TRAIN_FRACTION)
        train_end = max(0, cut - PURGE_BARS)
        holdout_start = min(len(g), cut + PURGE_BARS)
        if train_end >= 60:
            train.append(g.iloc[:train_end])
        if len(g) - holdout_start >= 40:
            holdout.append(g.iloc[holdout_start:])
    return (
        pd.concat(train, ignore_index=True) if train else pd.DataFrame(),
        pd.concat(holdout, ignore_index=True) if holdout else pd.DataFrame(),
    )


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

    train, holdout = temporal_split(rows)
    if len(train) < 120 or len(holdout) < 80:
        raise SystemExit(f"Zu wenig zeitlich getrennte Daten: train={len(train)}, holdout={len(holdout)}")

    buy_candidates = np.arange(3.8, 4.81, 0.2)
    sell_candidates = np.arange(3.6, 4.61, 0.2)
    buy_rank = sorted((threshold_quality(train, "buy_score", float(t), True) + (float(t),) for t in buy_candidates), reverse=True)
    sell_rank = sorted((threshold_quality(train, "sell_score", float(t), False) + (float(t),) for t in sell_candidates), reverse=True)
    bq_train, bn_train, bh_train, bm_train, bt = buy_rank[0]
    sq_train, sn_train, sh_train, sm_train, st = sell_rank[0]
    bq_hold, bn_hold, bh_hold, bm_hold = threshold_quality(holdout, "buy_score", bt, True)
    sq_hold, sn_hold, sh_hold, sm_hold = threshold_quality(holdout, "sell_score", st, False)

    validated = (
        bn_train >= 100 and sn_train >= 100
        and bn_hold >= 60 and sn_hold >= 60
        and bq_train > 0 and sq_train > 0
        and bq_hold > 0 and sq_hold > 0
        and bm_train > 0 and sm_train > 0
        and bm_hold > 0 and sm_hold > 0
    )

    if validated:
        buy_shift = clamp((bt - CORE_REFERENCE_BUY) * 0.25, -MAX_RUNTIME_SHIFT, MAX_RUNTIME_SHIFT)
        sell_shift = clamp((st - CORE_REFERENCE_SELL) * 0.25, -MAX_RUNTIME_SHIFT, MAX_RUNTIME_SHIFT)
        buy = round(BASE_RUNTIME_BUY + buy_shift, 2)
        sell = round(BASE_RUNTIME_SELL + sell_shift, 2)
    else:
        buy, sell = BASE_RUNTIME_BUY, BASE_RUNTIME_SELL

    now = datetime.now(timezone.utc).isoformat()
    content = f"""// Automatisch erzeugt durch scripts/calibrate_fast_signals.py.\nexport const FAST_CALIBRATION={{\n  version:'historical-15m-purged-holdout-v2',\n  generatedAt:'{now}',\n  sampleCount:{len(rows)},\n  trainSampleCount:{len(train)},\n  holdoutSampleCount:{len(holdout)},\n  validated:{str(validated).lower()},\n  buyThreshold:{buy:.2f},\n  sellThreshold:{sell:.2f},\n  maxSpreadPct:0.80,\n  minAdxBuy:18,\n  strongAdx:22,\n  maxAtrPctBuy:2.50,\n  minRelativeVolume:1.10,\n  trailing:{{activatePnlPct:2.0,minGivebackPct:0.8,maxGivebackPct:2.2,givebackShare:0.34}},\n  validation:{{trainBuySamples:{bn_train},trainBuyHitRate:{bh_train:.4f},trainBuyMeanPct:{bm_train:.4f},holdoutBuySamples:{bn_hold},holdoutBuyHitRate:{bh_hold:.4f},holdoutBuyMeanPct:{bm_hold:.4f},trainSellSamples:{sn_train},trainSellHitRate:{sh_train:.4f},trainSellMeanPct:{sm_train:.4f},holdoutSellSamples:{sn_hold},holdoutSellHitRate:{sh_hold:.4f},holdoutSellMeanPct:{sm_hold:.4f},symbols:{len(frames)},purgeBars:{PURGE_BARS}}}\n}};\n"""
    OUTPUT.write_text(content, encoding="utf-8")
    print(json.dumps({
        "rows": len(rows),
        "trainRows": len(train),
        "holdoutRows": len(holdout),
        "symbols": len(frames),
        "validated": validated,
        "runtimeBuyThreshold": buy,
        "runtimeSellThreshold": sell,
        "trainBuyHitRate": bh_train,
        "holdoutBuyHitRate": bh_hold,
        "trainSellHitRate": sh_train,
        "holdoutSellHitRate": sh_hold,
    }, indent=2))


symbols_global: list[str] = []
if __name__ == "__main__":
    main()
