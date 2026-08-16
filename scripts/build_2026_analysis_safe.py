from __future__ import annotations

import json
from pathlib import Path

import build_2026_analysis as base

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_TO_EUR = base.to_eur_series
EXCLUDED = []
MAX_FACTOR = 2.5
MIN_FACTOR = 0.4

# Die Live-App bewertet 1-Minuten-Momentum. Die 2026-Rekonstruktion hat fuer den gesamten
# Zeitraum verlaesslich nur Tagesdaten. Deshalb werden nur die Eintrittsschwellen auf die
# groebere Datenaufloesung kalibriert; Stop/Take und die restliche Signallogik bleiben gleich.
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


base.to_eur_series = safe_to_eur_series
base.main()

path = ROOT / 'public' / 'analysis-2026.json'
data = json.loads(path.read_text(encoding='utf-8'))
data['dataQuality'] = {
    'rule': f'Komplette Serie ausgeschlossen, wenn ein aufeinanderfolgender EUR-Tagesfaktor < {MIN_FACTOR:.2f} oder > {MAX_FACTOR:.2f} ist.',
    'excludedCount': len(EXCLUDED),
    'excluded': EXCLUDED,
}
data['walkForwardCalibration'] = {
    'reason': 'Historische Vollperiode nutzt Tagesdaten statt 1-Minuten-Daten; Eintrittsschwellen fuer Tagesauflösung kalibriert.',
    'styles': base.STYLE,
    'newsReconstructed': False,
}
path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Quality-guarded analysis written; excluded={len(EXCLUDED)}')
