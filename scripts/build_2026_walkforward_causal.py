from __future__ import annotations

import math
import re
from typing import Dict, List

import numpy as np
import pandas as pd

import build_2026_analysis as base


def entity_key(item: dict) -> str:
    """Gruppiert Mehrfachlistings derselben Firma fuer die historische Kandidatenauswahl.

    ETFs bleiben immer eigenstaendig. Bei Aktien wird nur fuer die Auswahl gruppiert; die
    tatsaechlich gehandelte Notierung bleibt der konkrete Yahoo-Ticker mit der besseren
    Liquiditaet/Signalqualitaet des Tages.
    """
    if item.get('type') == 'ETF':
        return f"ETF:{item.get('symbol','')}"
    name = str(item.get('name') or item.get('symbol') or '').upper()
    name = re.sub(r'[^A-Z0-9]+', ' ', name)
    junk = {
        'INC','INCORPORATED','CORP','CORPORATION','CO','COMPANY','LTD','LIMITED','PLC','AG','SE','NV','SA','SPA',
        'HOLDING','HOLDINGS','GROUP','ORD','ORDINARY','CLASS','CL','ADR','DRN','CDR','ED','HED','SHS','SHARE','SHARES',
        'THE','R','CAD','USD','EUR'
    }
    toks = [t for t in name.split() if t not in junk and len(t) > 1]
    # Leichte Stammkuerzung gleicht z.B. MANUFACT / MANUFACTURING oder SEMICONDUCT / SEMICONDUCTOR an.
    stemmed = []
    for t in toks:
        s = t[:7] if len(t) > 7 else t
        if not stemmed or stemmed[-1] != s:
            stemmed.append(s)
    if not stemmed:
        return f"EQ:{item.get('symbol','')}"
    return 'EQ:' + ' '.join(stemmed[:5])


def continuous_signal_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Kontinuierlicher Tages-Score statt des alten diskreten 6,60-Maximums."""
    x = df.copy()
    c = x['eur'].astype(float)
    x['ema9'] = c.ewm(span=9, adjust=False).mean()
    x['ema21'] = c.ewm(span=21, adjust=False).mean()
    x['rsi'] = base.rsi(c, 14)
    x['m5'] = c.pct_change(5) * 100.0
    x['m20'] = c.pct_change(20) * 100.0
    x['day'] = c.pct_change() * 100.0
    x['vavg'] = x['volume'].shift(1).rolling(20).mean()
    x['vr'] = (x['volume'] / x['vavg'].replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(1.0)
    x['liq'] = (x['volume'].clip(lower=0) * c).rolling(20, min_periods=5).median().fillna(0.0)

    def clip(v, lo, hi):
        if pd.isna(v):
            return 0.0
        return max(lo, min(hi, float(v)))

    scores, confs = [], []
    for _, r in x.iterrows():
        e21 = float(r['ema21']) if pd.notna(r['ema21']) and float(r['ema21']) else float(r['eur'])
        trend = (float(r['ema9']) / e21 - 1.0) * 100.0 if e21 else 0.0
        above = (float(r['eur']) / e21 - 1.0) * 100.0 if e21 else 0.0
        rr = float(r['rsi']) if pd.notna(r['rsi']) else 50.0
        # RSI um ~58 ist fuer Momentum konstruktiv; sehr ueberkauft/ueberverkauft wird bestraft.
        rsi_term = max(-1.25, min(1.0, 1.0 - abs(rr - 58.0) / 18.0))
        vol_term = clip(math.log(max(float(r['vr']), 0.05), 2.0) * 0.42, -0.55, 0.75)
        score = (
            clip(trend * 0.72, -1.8, 1.8)
            + clip(above * 0.28, -1.15, 1.15)
            + rsi_term
            + clip(float(r['m5']) * 0.18 if pd.notna(r['m5']) else 0.0, -1.25, 1.25)
            + clip(float(r['m20']) * 0.075 if pd.notna(r['m20']) else 0.0, -1.45, 1.45)
            + vol_term
            + clip(float(r['day']) * 0.05 if pd.notna(r['day']) else 0.0, -0.4, 0.4)
        )
        confidence = max(0.42, min(0.90, 0.46 + max(score, 0.0) * 0.06 + max(0.0, min(float(r['vr']) - 1.0, 2.0)) * 0.025))
        scores.append(score)
        confs.append(confidence)
    x['score'] = scores
    x['confidence'] = confs
    return x


def expected_edge_pct(row: pd.Series, style: dict) -> float:
    """Nur Kostenfilter/Allokationshilfe, keine behauptete Renditeprognose."""
    score = float(row['score'])
    m5 = float(row['m5']) if pd.notna(row['m5']) else 0.0
    m20 = float(row['m20']) if pd.notna(row['m20']) else 0.0
    strength = max(0.0, score - float(style['entry']))
    edge = 1.0 + strength * 0.95 + max(0.0, min(m5, 6.0)) * 0.18 + max(0.0, min(m20, 18.0)) * 0.055
    return max(0.5, min(12.0, edge))


def choose_allocations(candidates: List[dict], cash: float) -> List[tuple]:
    """Waehlt dynamisch die nach Fixkosten sinnvollste Anzahl Positionen.

    Es gibt keine feste Positionszahl. Bei 100 EUR koennen 1-EUR-Gebuehren jedoch mehrere
    Miniorders wirtschaftlich unsinnig machen; deshalb wird die Anzahl aus dem Netto-Signal
    nach Kosten bestimmt.
    """
    if cash <= base.FEE_FIXED or not candidates:
        return []
    best, best_utility = [], 0.0
    # Mehr Kandidaten duerfen bewertet werden; die Kosten entscheiden, wie viele wirklich gekauft werden.
    for n in range(1, len(candidates) + 1):
        group = candidates[:n]
        weights = [max(0.25, c['edge']) for c in group]
        sw = sum(weights)
        proposal, utility = [], 0.0
        valid = True
        for c, w in zip(group, weights):
            budget = cash * w / sw
            if budget <= base.FEE_FIXED + 0.01:
                valid = False
                break
            roundtrip = (2.0 * base.FEE_FIXED / budget) * 100.0 + 2.0 * base.SLIPPAGE * 100.0 + 2.0 * base.FEE_PERCENT
            net = c['edge'] - roundtrip
            # Jede aufgenommene Teilposition muss ihre eigenen angenommenen Kosten decken.
            if net <= 0.15:
                valid = False
                break
            utility += (budget / cash) * net
            proposal.append((c, budget))
        if valid and utility > best_utility + 1e-9:
            best_utility, best = utility, proposal
    return best


def causal_walk_forward(universe: List[dict], eur: Dict[str, object], style_name: str) -> dict:
    """Kausale Tages-Rekonstruktion: Signal T, Ausfuehrung fruehestens T+1."""
    style = base.STYLE[style_name]
    meta = {x['symbol']: x for x in universe}
    entity = {s: entity_key(m) for s, m in meta.items()}
    sig = {sym: continuous_signal_frame(df) for sym, df in eur.items() if len(df) >= 22}
    dates = sorted({d for df in sig.values() for d in df.index})
    cash = base.START_CAPITAL
    holdings = {}
    trades, actions = [], []

    if len(dates) < 2:
        return {
            'title': 'KI haette damals gemacht', 'style': style_name,
            'startCapital': base.START_CAPITAL, 'endCapital': cash, 'profit': 0.0, 'returnPct': 0.0,
            'trades': [], 'actions': [], 'winRate': 0.0,
            'note': 'Zu wenig historische Daten fuer einen kausalen Walk-Forward.'
        }

    for global_i, date in enumerate(dates):
        # EXIT: Entscheidung anhand des vollstaendig abgeschlossenen Vortags, Ausfuehrung heute.
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
            # Stop/Take basiert auf der Kursbewegung seit dem Ausfuehrungspreis, NICHT auf der Fixgebuehr.
            price_return = float(prev['eur']) / h['entryPrice'] - 1.0 if h['entryPrice'] else 0.0
            why = None
            if price_return <= style['stop']:
                why = f"Stop-Signal vom Vortag {price_return*100:.2f}%"
            elif price_return >= style['take']:
                why = f"Gewinnziel-Signal vom Vortag {price_return*100:.2f}%"
            elif float(prev['score']) < 0:
                why = f"Vortagssignal gefallen auf {float(prev['score']):.2f}"
            if why:
                p = float(current['eur'])
                proceeds, fee = base.sell_cash(h['shares'], p)
                cash += proceeds
                pnl = proceeds - h['capitalBefore']
                sell_date = date.strftime('%Y-%m-%d')
                actions.append({'action':'SELL','date':sell_date,'symbol':sym,'name':meta[sym]['name'],'type':meta[sym]['type'],'fee':fee,'reason':why})
                trades.append({
                    'symbol':sym,'name':meta[sym]['name'],'type':meta[sym]['type'],'buyAt':h['buyAt'],'sellAt':sell_date,
                    'capitalBefore':h['capitalBefore'],'capitalAfter':proceeds,'pnl':pnl,
                    'returnPct':pnl/h['capitalBefore']*100.0 if h['capitalBefore'] else 0.0,
                    'buyFee':h['buyFee'],'sellFee':fee,'reason':why,
                })
                del holdings[sym]

        if global_i == len(dates) - 1:
            continue

        held_entities = {h['entity'] for h in holdings.values()}
        # ENTRY: nur Vortagssignale. Pro Unternehmen nur die beste/liquideste Notierung dieses Tages.
        by_entity = {}
        for sym, df in sig.items():
            if sym in holdings or date not in df.index or entity.get(sym) in held_entities:
                continue
            pos = df.index.get_loc(date)
            if isinstance(pos, slice) or pos < 22:
                continue
            prev = df.iloc[pos - 1]
            current = df.loc[date]
            score, conf = float(prev['score']), float(prev['confidence'])
            if score < style['entry'] or conf < 0.55:
                continue
            cand = {
                'sym':sym,'score':score,'conf':conf,'price':float(current['eur']),
                'liq':float(prev.get('liq',0.0) or 0.0),'edge':expected_edge_pct(prev, style),
                'entity':entity[sym],
            }
            old = by_entity.get(cand['entity'])
            # Erst Signalqualitaet, bei nahezu gleichem Signal Liquiditaet bevorzugen.
            rank = cand['score'] + cand['conf'] * 0.7 + math.log10(max(cand['liq'],1.0)) * 0.015
            if old is None or rank > old['rank']:
                cand['rank'] = rank
                by_entity[cand['entity']] = cand

        candidates = sorted(by_entity.values(), key=lambda c:(c['rank'],c['edge']), reverse=True)
        # Kein Portfolio-Limit: 24 ist nur ein Rechenfenster fuer die dynamische Kostenoptimierung.
        candidates = candidates[:24]
        allocations = choose_allocations(candidates, cash)
        if not allocations:
            continue

        starting_cash = cash
        spent = 0.0
        for i, (c, budget) in enumerate(allocations):
            if i == len(allocations) - 1:
                budget = min(budget, max(0.0, starting_cash - spent))
            shares, fee = base.buy_shares(budget, c['price'])
            if shares <= 0:
                continue
            used = shares * c['price'] * (1.0 + base.SLIPPAGE) + fee
            if used > cash + 1e-8:
                continue
            cash -= used
            spent += used
            sym = c['sym']
            holdings[sym] = {
                'shares':shares,'capitalBefore':used,'buyAt':date.strftime('%Y-%m-%d'),'buyFee':fee,
                'entryPrice':c['price'] * (1.0 + base.SLIPPAGE),'entity':c['entity'],
            }
            actions.append({
                'action':'BUY','date':date.strftime('%Y-%m-%d'),'symbol':sym,'name':meta[sym]['name'],'type':meta[sym]['type'],'fee':fee,
                'score':c['score'],'confidence':c['conf'],'allocation':used,
                'reason':f"Vortagssignal: Score {c['score']:.2f}, Konfidenz {c['conf']*100:.0f}%, Kostenfilter netto positiv",
            })

    # Offene Positionen zum letzten verfuegbaren Kurs nur fuer die Vergleichs-Endbewertung glattstellen.
    for sym in list(holdings):
        df = sig[sym]
        date = df.index[-1]
        p = float(df.loc[date,'eur'])
        h = holdings[sym]
        proceeds, fee = base.sell_cash(h['shares'], p)
        cash += proceeds
        pnl = proceeds - h['capitalBefore']
        trades.append({
            'symbol':sym,'name':meta[sym]['name'],'type':meta[sym]['type'],'buyAt':h['buyAt'],'sellAt':date.strftime('%Y-%m-%d'),
            'capitalBefore':h['capitalBefore'],'capitalAfter':proceeds,'pnl':pnl,
            'returnPct':pnl/h['capitalBefore']*100.0 if h['capitalBefore'] else 0.0,
            'buyFee':h['buyFee'],'sellFee':fee,'reason':'Auswertungsende',
        })
        actions.append({'action':'SELL','date':date.strftime('%Y-%m-%d'),'symbol':sym,'name':meta[sym]['name'],'type':meta[sym]['type'],'fee':fee,'reason':'Auswertungsende'})
        del holdings[sym]

    wins = sum(1 for t in trades if float(t.get('pnl') or 0) > 0)
    return {
        'title':'KI haette damals gemacht','style':style_name,
        'startCapital':base.START_CAPITAL,'endCapital':cash,'profit':cash-base.START_CAPITAL,
        'returnPct':(cash/base.START_CAPITAL-1.0)*100.0,
        'trades':trades,'actions':actions,'winRate':wins/len(trades)*100.0 if trades else 0.0,
        'modelVersion':'causal-daily-v2',
        'note':'Kausale KI-Signalrekonstruktion ohne Zukunftsdaten: Signal aus vollstaendig abgeschlossenem Vortag, Ausfuehrung fruehestens am folgenden Handelstag. Kontinuierliche Rangfolge, Mehrfachlistings derselben Firma werden bei der Auswahl zusammengefasst, Fixgebuehren loesen keinen Stop aus. Historische News und historische 1-Minuten-Daten werden nicht rueckwirkend erfunden; deshalb ist dies keine exakte Wiederholung der damaligen Cloudflare-KI, sondern die belastbar rekonstruierbare Markt-/Signal-Komponente.',
    }


# Der Basisskript-Aufruf in build_2026_analysis_safe.py benutzt damit automatisch die korrigierte Rekonstruktion.
base.walk_forward = causal_walk_forward
