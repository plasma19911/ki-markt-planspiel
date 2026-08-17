from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import build_2026_walkforward_causal as causal

base = causal.base
ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_TO_EUR = base.to_eur_series
ORIGINAL_NORMALIZE_CURRENCY = base.normalize_currency
EXCLUDED = []
DUPLICATE_LISTINGS = []
LEARNING_EUR = {}
LEARNING_META = {}
MAX_FACTOR = 2.5
MIN_FACTOR = 0.4

base.STYLE = {
    'vorsichtig': {'entry': 4.0, 'stop': -0.018, 'take': 0.035},
    'ausgewogen': {'entry': 3.2, 'stop': -0.025, 'take': 0.055},
    'offensiv': {'entry': 2.6, 'stop': -0.035, 'take': 0.075},
}

CURRENCY_SUFFIX = [
    (r'\.(DE|PA|BR|MI|MC|AS|VI|F|SG|MU|HM|DU|HE|LS)$', 'EUR'),
    (r'\.L$', 'GBP'), (r'\.SW$', 'CHF'), (r'\.ST$', 'SEK'), (r'\.OL$', 'NOK'),
    (r'\.CO$', 'DKK'), (r'\.IS$', 'TRY'), (r'\.SR$', 'SAR'), (r'\.WA$', 'PLN'), (r'\.PR$', 'CZK'),
    (r'\.T$', 'JPY'), (r'\.(KS|KQ)$', 'KRW'), (r'\.(TW|TWO)$', 'TWD'),
    (r'\.HK$', 'HKD'), (r'\.(SS|SZ)$', 'CNY'), (r'\.(NS|BO)$', 'INR'),
    (r'\.AX$', 'AUD'), (r'\.(TO|V|NE)$', 'CAD'), (r'\.MX$', 'MXN'),
    (r'\.SA$', 'BRL'), (r'\.JO$', 'ZAR'), (r'\.SI$', 'SGD'), (r'\.BK$', 'THB'),
    (r'\.JK$', 'IDR'), (r'\.KL$', 'MYR'), (r'\.TA$', 'ILS'), (r'\.NZ$', 'NZD'),
]

FEATURES = ['emaGapPct', 'priceVsEma21Pct', 'rsi', 'mom5Pct', 'mom20Pct', 'dayPct', 'volatility20Pct']


def safe_normalize_currency(cur, symbol):
    if cur is not None and str(cur).strip():
        return ORIGINAL_NORMALIZE_CURRENCY(cur, symbol)
    s = str(symbol or '').upper()
    for pat, currency in CURRENCY_SUFFIX:
        if re.search(pat, s):
            return currency, 1.0
    return ORIGINAL_NORMALIZE_CURRENCY(cur, symbol)


def listing_quality(df) -> float:
    try:
        turnover = (df['volume'].clip(lower=0).astype(float) * df['eur'].astype(float)).replace([np.inf, -np.inf], np.nan).dropna()
        med = float(turnover.median()) if len(turnover) else 0.0
    except Exception:
        med = 0.0
    return len(df) * 0.08 + math.log10(max(1.0, med))


def safe_to_eur_series(universe, series, fx):
    out = ORIGINAL_TO_EUR(universe, series, fx)
    meta = {x['symbol']: x for x in universe}
    clean = {}
    for sym, df in out.items():
        ratio = df['eur'] / df['eur'].shift(1)
        bad = ratio[(ratio > MAX_FACTOR) | (ratio < MIN_FACTOR)]
        if not bad.empty:
            EXCLUDED.append({
                'symbol': sym,
                'maxFactor': float(ratio.max(skipna=True)),
                'minFactor': float(ratio.min(skipna=True)),
                'reason': f'Tagesfaktor ausserhalb {MIN_FACTOR:.2f}–{MAX_FACTOR:.2f}; moeglicher Split/Notierungs-/Feeddatenfehler'
            })
            continue
        clean[sym] = df

    groups = {}
    for sym, df in clean.items():
        item = meta.get(sym, {'symbol': sym, 'name': sym, 'type': 'EQUITY'})
        key = causal.entity_key(item)
        groups.setdefault(key, []).append((sym, df, listing_quality(df)))

    deduped = {}
    for key, rows in groups.items():
        rows.sort(key=lambda x: (x[2], len(x[1])), reverse=True)
        keep_sym, keep_df, _ = rows[0]
        deduped[keep_sym] = keep_df
        if len(rows) > 1 and key.startswith('EQ:'):
            DUPLICATE_LISTINGS.append({
                'entity': key[3:],
                'kept': keep_sym,
                'removed': [x[0] for x in rows[1:]],
                'reason': 'Mehrfachlisting derselben Firma; fuer den gesamten Backtest eine feste repraesentative/liquide Notierung verwendet'
            })

    LEARNING_EUR.clear()
    LEARNING_EUR.update({sym: df.copy() for sym, df in deduped.items()})
    LEARNING_META.clear()
    LEARNING_META.update({sym: meta.get(sym, {'symbol': sym, 'name': sym, 'type': 'EQUITY'}) for sym in deduped})
    print(f'Data-quality: excluded {len(EXCLUDED)} anomalous series')
    print(f'Company dedupe: removed {sum(len(x["removed"]) for x in DUPLICATE_LISTINGS)} duplicate listings across {len(DUPLICATE_LISTINGS)} companies')
    return deduped


def remove_artificial_final_day_roundtrips(result):
    trades = result.get('trades') or []
    removed = [t for t in trades if t.get('buyAt') == t.get('sellAt') and t.get('reason') == 'Auswertungsende']
    if not removed:
        return result
    result['trades'] = [t for t in trades if t not in removed]
    symbols_dates = {(t.get('symbol'), t.get('buyAt')) for t in removed}
    result['actions'] = [a for a in (result.get('actions') or []) if (a.get('symbol'), a.get('date')) not in symbols_dates]
    correction = -sum(float(t.get('pnl') or 0) for t in removed)
    result['endCapital'] = float(result.get('endCapital') or 0) + correction
    result['profit'] = result['endCapital'] - float(result.get('startCapital') or 100)
    result['returnPct'] = (result['endCapital'] / float(result.get('startCapital') or 100) - 1) * 100
    wins = sum(1 for t in result['trades'] if float(t.get('pnl') or 0) > 0)
    result['winRate'] = wins / len(result['trades']) * 100 if result['trades'] else 0
    result['removedArtificialEndTrades'] = len(removed)
    return result


def learning_rsi(c: pd.Series, period: int = 14) -> pd.Series:
    d = c.diff()
    gain = d.clip(lower=0).rolling(period).mean()
    loss = (-d.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).replace([np.inf, -np.inf], np.nan)


def feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    x = pd.DataFrame(index=df.index)
    c = df['eur'].astype(float)
    ema9 = c.ewm(span=9, adjust=False).mean()
    ema21 = c.ewm(span=21, adjust=False).mean()
    ret = c.pct_change()
    x['emaGapPct'] = (ema9 / ema21 - 1) * 100
    x['priceVsEma21Pct'] = (c / ema21 - 1) * 100
    x['rsi'] = learning_rsi(c, 14)
    x['mom5Pct'] = c.pct_change(5) * 100
    x['mom20Pct'] = c.pct_change(20) * 100
    x['dayPct'] = ret * 100
    x['volatility20Pct'] = ret.rolling(20).std() * 100
    x['forward3Pct'] = (c.shift(-3) / c - 1) * 100
    return x.replace([np.inf, -np.inf], np.nan)


def compute_strategy_learning(perfect_events) -> dict:
    frames = {sym: feature_frame(df) for sym, df in LEARNING_EUR.items() if len(df) >= 30}
    samples = []
    for sym, f in frames.items():
        good = f[FEATURES + ['forward3Pct']].dropna()
        for dt, row in good.iterrows():
            y = float(np.clip(row['forward3Pct'], -20, 20))
            samples.append((pd.Timestamp(dt), sym, [float(row[k]) for k in FEATURES], y))
    if len(samples) < 1000:
        return {'available': False, 'reason': f'Zu wenig kausale Lernbeispiele ({len(samples)}).'}

    dates = np.array([s[0].value for s in samples], dtype=np.int64)
    X = np.array([s[2] for s in samples], dtype=float)
    y = np.array([s[3] for s in samples], dtype=float)
    unique_dates = np.unique(dates)
    split_date = unique_dates[max(1, int(len(unique_dates) * 0.80)) - 1]
    train = dates <= split_date
    valid = dates > split_date
    if valid.sum() < 200:
        train = np.arange(len(samples)) < int(len(samples) * 0.8)
        valid = ~train

    mean = X[train].mean(axis=0)
    std = X[train].std(axis=0)
    std[std < 1e-9] = 1.0
    Z = (X[train] - mean) / std
    y_mean = float(y[train].mean())
    centered = y[train] - y_mean
    ridge = 25.0
    coef = np.linalg.solve(Z.T @ Z + np.eye(len(FEATURES)) * ridge, Z.T @ centered)
    pred = y_mean + ((X[valid] - mean) / std) @ coef
    actual = y[valid]
    corr = float(np.corrcoef(pred, actual)[0, 1]) if len(actual) > 2 and np.std(pred) > 0 and np.std(actual) > 0 else 0.0
    direction = float(np.mean(np.sign(pred) == np.sign(actual)) * 100) if len(actual) else 0.0
    q = float(np.quantile(pred, 0.80)) if len(pred) else 0.0
    top = actual[pred >= q] if len(pred) else np.array([])

    perfect_pre = []
    for e in perfect_events or []:
        if e.get('action') != 'BUY':
            continue
        sym = str(e.get('symbol') or '').upper()
        f = frames.get(sym)
        if f is None or f.empty:
            continue
        dt = pd.Timestamp(e.get('date'))
        prior = f.index[f.index < dt]
        if not len(prior):
            continue
        row = f.loc[prior[-1], FEATURES]
        if row.isna().any():
            continue
        perfect_pre.append([float(row[k]) for k in FEATURES])
    profile = np.array(perfect_pre, dtype=float) if perfect_pre else np.empty((0, len(FEATURES)))

    return {
        'available': True,
        'modelVersion': 'causal-3day-ridge-v1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'target': 'EUR-Gesamtrendite der folgenden 3 Handelstage, auf ±20% gekappt',
        'features': FEATURES,
        'mean': {k: float(mean[i]) for i, k in enumerate(FEATURES)},
        'std': {k: float(std[i]) for i, k in enumerate(FEATURES)},
        'coefficients': {k: float(coef[i]) for i, k in enumerate(FEATURES)},
        'interceptPct': y_mean,
        'sampleCount': int(len(samples)),
        'trainSamples': int(train.sum()),
        'validationSamples': int(valid.sum()),
        'validation': {
            'correlation': corr,
            'directionAccuracyPct': direction,
            'overallForward3Pct': float(actual.mean()) if len(actual) else 0.0,
            'topPredictedQuintileForward3Pct': float(top.mean()) if len(top) else 0.0,
            'topPredictedQuintilePositivePct': float(np.mean(top > 0) * 100) if len(top) else 0.0,
        },
        'perfectHindsightPreBuyProfile': {
            'samples': int(len(profile)),
            'mean': {k: float(profile[:, i].mean()) for i, k in enumerate(FEATURES)} if len(profile) else {},
            'description': 'Nur Merkmale des letzten abgeschlossenen Handelstags VOR einem perfekten BUY; das spätere Zukunftswissen selbst wird nicht an die Live-KI weitergegeben.'
        },
        'limitations': 'Historische News sind nicht vollständig rekonstruierbar. Das Modell lernt nur kausale Kursmuster; aktuelle News, Events, FX, Gebühren und Intraday-Reaktion werden live separat bewertet.'
    }


base.normalize_currency = safe_normalize_currency
base.to_eur_series = safe_to_eur_series
base.main()

path = ROOT / 'public' / 'analysis-2026.json'
data = json.loads(path.read_text(encoding='utf-8'))
universe_meta = json.loads((ROOT / 'public' / 'universe.json').read_text(encoding='utf-8'))
for style, result in (data.get('walkForward') or {}).items():
    data['walkForward'][style] = remove_artificial_final_day_roundtrips(result)

removed_listing_count = sum(len(x['removed']) for x in DUPLICATE_LISTINGS)
data['universeSource'] = {
    'generatedAt': universe_meta.get('generated_at'),
    'count': universe_meta.get('count'),
    'uniqueCompanies': universe_meta.get('unique_companies'),
    'duplicateListingsCollapsed': universe_meta.get('duplicate_listings_collapsed'),
    'source': universe_meta.get('source'),
}
data['dataQuality'] = {
    'rule': f'Komplette Serie ausgeschlossen, wenn ein aufeinanderfolgender EUR-Tagesfaktor < {MIN_FACTOR:.2f} oder > {MAX_FACTOR:.2f} ist. Mehrfachlistings einer Firma werden auf eine feste repraesentative Notierung reduziert.',
    'excludedCount': len(EXCLUDED),
    'excluded': EXCLUDED,
    'duplicateCompanyCount': len(DUPLICATE_LISTINGS),
    'duplicateListingsRemoved': removed_listing_count,
    'duplicateListings': DUPLICATE_LISTINGS,
}
data['walkForwardCalibration'] = {
    'reason': 'Historische Vollperiode nutzt Tagesdaten statt 1-Minuten-Daten; Eintrittsschwellen sind fuer Tagesaufloesung kalibriert.',
    'styles': base.STYLE,
    'modelVersion': 'causal-daily-v4-unique500',
    'continuousRanking': True,
    'uniqueCompanyUniverse': True,
    'duplicateListingsGrouped': True,
    'singleRepresentativeListingPerCompany': True,
    'historicalCurrencyFallbackHardened': True,
    'stopExcludesFixedEntryFee': True,
    'dynamicFeeAwareAllocation': True,
    'newsReconstructed': False,
    'causalExecution': 'Signal aus vollstaendig abgeschlossenem Vortag; Ausfuehrung fruehestens am folgenden verfuegbaren Handelstag.',
    'artificialSameDayEndTradesRemoved': True,
}
data['strategyLearning'] = compute_strategy_learning((data.get('perfect') or {}).get('events') or [])
path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
learning = data.get('strategyLearning') or {}
print(f'Final unique-company causal analysis written; anomalous={len(EXCLUDED)}, duplicate-listings={removed_listing_count}, learning-samples={learning.get("sampleCount", 0)}')