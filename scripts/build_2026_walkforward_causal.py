from __future__ import annotations

from typing import Dict, List

import build_2026_analysis as base


def causal_walk_forward(universe: List[dict], eur: Dict[str, object], style_name: str) -> dict:
    """Walk-forward mit einer vollen Tagesverzoegerung zwischen Signal und Ausfuehrung.

    Signal am Schluss von T entsteht nur aus Daten bis T. Eine daraus folgende Order wird
    am Schluss des naechsten fuer den Wert verfuegbaren Handelstags ausgefuehrt. Dadurch
    wird kein Schlusskurs analysiert und rueckwirkend noch zum selben Schlusskurs gehandelt.
    """
    style = base.STYLE[style_name]
    meta = {x['symbol']: x for x in universe}
    sig = {sym: base.signal_frame(df) for sym, df in eur.items() if len(df) >= 22}
    dates = sorted({d for df in sig.values() for d in df.index})
    cash = base.START_CAPITAL
    holdings = {}
    trades = []
    actions = []

    if len(dates) < 2:
        return {
            'title': 'KI haette damals gemacht', 'style': style_name,
            'startCapital': base.START_CAPITAL, 'endCapital': cash, 'profit': 0.0, 'returnPct': 0.0,
            'trades': [], 'actions': [], 'winRate': 0.0,
            'note': 'Zu wenig historische Daten fuer einen kausalen Walk-Forward.'
        }

    for global_i, date in enumerate(dates):
        # EXIT: Entscheidung basiert ausschliesslich auf dem vorherigen Datenpunkt dieses Wertes.
        for sym in list(holdings):
            df = sig.get(sym)
            if df is None or date not in df.index:
                continue
            pos = df.index.get_loc(date)
            if isinstance(pos, slice) or pos < 1:
                continue
            prev = df.iloc[pos - 1]
            current = df.loc[date]
            h = holdings[sym]
            prior_mark = h['shares'] * float(prev['eur'])
            pnl_pct = prior_mark / h['capitalBefore'] - 1.0 if h['capitalBefore'] else 0.0
            why = None
            if pnl_pct <= style['stop']:
                why = f"Stop-Signal vom Vortag {pnl_pct*100:.2f}%"
            elif pnl_pct >= style['take']:
                why = f"Gewinnziel-Signal vom Vortag {pnl_pct*100:.2f}%"
            elif float(prev['score']) < 0:
                why = f"Vortagssignal gefallen auf {float(prev['score']):.2f}"
            if why:
                p = float(current['eur'])
                proceeds, fee = base.sell_cash(h['shares'], p)
                cash += proceeds
                pnl = proceeds - h['capitalBefore']
                sell = {
                    'action': 'SELL', 'date': date.strftime('%Y-%m-%d'), 'symbol': sym,
                    'name': meta[sym]['name'], 'type': meta[sym]['type'], 'fee': fee,
                    'reason': why,
                }
                actions.append(sell)
                trades.append({
                    'symbol': sym, 'name': meta[sym]['name'], 'type': meta[sym]['type'],
                    'buyAt': h['buyAt'], 'sellAt': sell['date'],
                    'capitalBefore': h['capitalBefore'], 'capitalAfter': proceeds,
                    'pnl': pnl, 'returnPct': pnl / h['capitalBefore'] * 100.0 if h['capitalBefore'] else 0.0,
                    'buyFee': h['buyFee'], 'sellFee': fee, 'reason': why,
                })
                del holdings[sym]

        # Am letzten globalen Datenpunkt keine neue Position mehr eroeffnen, die nur wegen
        # des Auswertungsendes sofort wieder geschlossen werden muesste.
        if global_i == len(dates) - 1:
            continue

        # ENTRY: Das Signal stammt vom vorherigen Datenpunkt, Ausfuehrung erfolgt heute.
        candidates = []
        for sym, df in sig.items():
            if sym in holdings or date not in df.index:
                continue
            pos = df.index.get_loc(date)
            if isinstance(pos, slice) or pos < 22:
                continue
            prev = df.iloc[pos - 1]
            current = df.loc[date]
            score, conf = float(prev['score']), float(prev['confidence'])
            if score < style['entry'] or conf < 0.55:
                continue
            candidates.append((sym, score, conf, float(current['eur'])))

        candidates.sort(key=lambda z: (z[1] + z[2]), reverse=True)
        candidates = candidates[:12]
        if not candidates or cash <= base.FEE_FIXED:
            continue

        # Keine feste Positionszahl. Freies Cash wird kostenbewusst auf alle ausreichend
        # starken Kandidaten des Deep-Scan-Fensters verteilt.
        active = []
        for sym, score, conf, price in candidates:
            edge = max(0.01, score - style['entry'] + conf)
            active.append([sym, score, conf, price, edge])

        for _ in range(3):
            if not active:
                break
            total_w = sum(x[4] for x in active)
            kept = []
            for x in active:
                alloc = cash * x[4] / total_w
                roundtrip_pct = (2 * base.FEE_FIXED / max(alloc, 0.01)) * 100 + 2 * base.SLIPPAGE * 100 + 2 * base.FEE_PERCENT
                expected_edge_pct = max(0.6, (x[1] - style['entry'] + 1.0) * 1.2)
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
        for i, (sym, score, conf, price, weight) in enumerate(active):
            budget = starting_cash * weight / total_w
            if i == len(active) - 1:
                budget = max(0.0, starting_cash - spent)
            shares, fee = base.buy_shares(budget, price)
            if shares <= 0:
                continue
            used = shares * price * (1 + base.SLIPPAGE) + fee
            if used > cash + 1e-8:
                continue
            cash -= used
            spent += used
            holdings[sym] = {
                'shares': shares, 'capitalBefore': used,
                'buyAt': date.strftime('%Y-%m-%d'), 'buyFee': fee,
            }
            actions.append({
                'action': 'BUY', 'date': date.strftime('%Y-%m-%d'), 'symbol': sym,
                'name': meta[sym]['name'], 'type': meta[sym]['type'], 'fee': fee,
                'score': score, 'confidence': conf,
                'reason': f"Vortagssignal: Score {score:.2f}, Konfidenz {conf*100:.0f}%",
            })

    # Mark-to-liquidation am letzten verfuegbaren Kurs, damit alle Stile mit einem
    # vergleichbaren Endkapital nach Verkaufsgebuehr bewertet werden.
    for sym in list(holdings):
        df = sig[sym]
        date = df.index[-1]
        p = float(df.loc[date, 'eur'])
        h = holdings[sym]
        proceeds, fee = base.sell_cash(h['shares'], p)
        cash += proceeds
        pnl = proceeds - h['capitalBefore']
        trades.append({
            'symbol': sym, 'name': meta[sym]['name'], 'type': meta[sym]['type'],
            'buyAt': h['buyAt'], 'sellAt': date.strftime('%Y-%m-%d'),
            'capitalBefore': h['capitalBefore'], 'capitalAfter': proceeds,
            'pnl': pnl, 'returnPct': pnl / h['capitalBefore'] * 100.0 if h['capitalBefore'] else 0.0,
            'buyFee': h['buyFee'], 'sellFee': fee, 'reason': 'Auswertungsende',
        })
        actions.append({
            'action': 'SELL', 'date': date.strftime('%Y-%m-%d'), 'symbol': sym,
            'name': meta[sym]['name'], 'type': meta[sym]['type'], 'fee': fee,
            'reason': 'Auswertungsende',
        })
        del holdings[sym]

    wins = sum(1 for t in trades if float(t.get('pnl') or 0) > 0)
    return {
        'title': 'KI haette damals gemacht', 'style': style_name,
        'startCapital': base.START_CAPITAL, 'endCapital': cash,
        'profit': cash - base.START_CAPITAL,
        'returnPct': (cash / base.START_CAPITAL - 1.0) * 100.0,
        'trades': trades, 'actions': actions,
        'winRate': wins / len(trades) * 100.0 if trades else 0.0,
        'note': 'Kausaler Walk-Forward ohne Zukunftsdaten: Signale werden erst nach einem vollstaendig abgeschlossenen Handelstag gebildet und fruehestens am folgenden verfuegbaren Handelstag ausgefuehrt. Historische News und historische 1-Minuten-Daten werden nicht rueckwirkend erfunden; dies ist daher eine konservative Rekonstruktion der heutigen Markt-/Signallogik.',
    }


base.walk_forward = causal_walk_forward
