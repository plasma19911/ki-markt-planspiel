from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np

import build_2026_walkforward_causal as causal

base = causal.base
ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_TO_EUR = base.to_eur_series
ORIGINAL_NORMALIZE_CURRENCY = base.normalize_currency
EXCLUDED = []
DUPLICATE_LISTINGS = []
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
path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Final unique-company causal analysis written; anomalous={len(EXCLUDED)}, duplicate-listings={removed_listing_count}')