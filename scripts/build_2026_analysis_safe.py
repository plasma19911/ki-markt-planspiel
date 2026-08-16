from __future__ import annotations

import json
from pathlib import Path

import build_2026_walkforward_causal as causal

base = causal.base
ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_TO_EUR = base.to_eur_series
EXCLUDED = []
MAX_FACTOR = 2.5
MIN_FACTOR = 0.4

# Historische Vollperiode nutzt Tagesdaten. Diese Schwellen sind fuer die Tagesaufloesung
# kalibriert; die Rangfolge selbst ist seit causal-daily-v2 kontinuierlich statt diskret.
base.STYLE = {
    'vorsichtig': {'entry': 4.0, 'stop': -0.018, 'take': 0.035},
    'ausgewogen': {'entry': 3.2, 'stop': -0.025, 'take': 0.055},
    'offensiv': {'entry': 2.6, 'stop': -0.035, 'take': 0.075},
}


def safe_to_eur_series(universe, series, fx):
    out = ORIGINAL_TO_EUR(universe, series, fx)
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
    print(f'Data-quality: excluded {len(EXCLUDED)} anomalous series: {[x["symbol"] for x in EXCLUDED][:30]}')
    return clean


def remove_artificial_final_day_roundtrips(result):
    """Sicherheitsnetz fuer alte/ungewoehnliche Datenkalender; der kausale Walker kauft am letzten globalen Tag bereits nicht mehr."""
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


base.to_eur_series = safe_to_eur_series
base.main()

path = ROOT / 'public' / 'analysis-2026.json'
data = json.loads(path.read_text(encoding='utf-8'))
for style, result in (data.get('walkForward') or {}).items():
    data['walkForward'][style] = remove_artificial_final_day_roundtrips(result)

data['dataQuality'] = {
    'rule': f'Komplette Serie ausgeschlossen, wenn ein aufeinanderfolgender EUR-Tagesfaktor < {MIN_FACTOR:.2f} oder > {MAX_FACTOR:.2f} ist.',
    'excludedCount': len(EXCLUDED),
    'excluded': EXCLUDED,
}
data['walkForwardCalibration'] = {
    'reason': 'Historische Vollperiode nutzt Tagesdaten statt 1-Minuten-Daten; Eintrittsschwellen sind fuer Tagesaufloesung kalibriert.',
    'styles': base.STYLE,
    'modelVersion': 'causal-daily-v2',
    'continuousRanking': True,
    'duplicateListingsGrouped': True,
    'stopExcludesFixedEntryFee': True,
    'dynamicFeeAwareAllocation': True,
    'newsReconstructed': False,
    'causalExecution': 'Signal aus vollstaendig abgeschlossenem Vortag; Ausfuehrung fruehestens am folgenden verfuegbaren Handelstag.',
    'artificialSameDayEndTradesRemoved': True,
}
path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Quality-guarded causal analysis written; excluded={len(EXCLUDED)}')