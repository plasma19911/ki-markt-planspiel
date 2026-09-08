// V31.8 · Chancen- und Entscheidungslogik
//
// KERNBEFUND: Die Exit-Geometrie in EXPECTANCY_CORE_V310 verlangt eine
// Trefferquote, die das System nicht hat - und zwar unabhaengig davon, wie gut
// der Scanner ist.
//
//   hardStopPct: -1.2   trailArmPct: 2.4   trailGivebackPct: 0.9
//
// Ein typischer Verlierer kostet also 1.2% plus Roundtrip. Ein typischer
// Trail-Gewinner bringt (2.4 - 0.9) = 1.5% minus Roundtrip:
//
//   Kosten 0.30%  ->  -1.50% / +1.20%  ->  Break-even-Trefferquote 55.6%
//   Kosten 0.45%  ->  -1.65% / +1.05%  ->                          61.1%
//   Kosten 0.70%  ->  -1.90% / +0.80%  ->                          70.4%
//   Kosten 1.00%  ->  -2.20% / +0.50%  ->                          81.5%
//
// Bei 400 EUR Positionsgroesse (Kosten 0.7%) braucht das System 70% Treffer.
// Intraday-Scanner liegen typisch bei 50-55%. Das ist die eigentliche Ursache
// des negativen CRV - nicht die Signalqualitaet. Der Stop ist zu eng relativ
// zum Ziel, und die Kosten fressen die Differenz.
//
// Zweiter Defekt: hardStopPct ist ein FESTER Prozentwert. Ein Titel mit 1%
// Tagesschwankung und einer mit 5% bekommen denselben Stop. Beim volatilen
// Titel ist -1.2% reines Rauschen; der Stop feuert, bevor die These ueberhaupt
// eine Chance hatte. Systematisch werden so gute Setups in kleinen Verlusten
// ausgestoppt - genau das Muster "viele kleine Verluste".
//
// Dieses Modul ersetzt die feste Geometrie durch eine volatilitaetsskalierte
// und stellt vor jeden BUY einen echten Erwartungswert-Test.

const arr = v => Array.isArray(v) ? v : [];
const finite = v => Number.isFinite(Number(v));
const num = (v, d = 0) => finite(v) ? Number(v) : d;
const clamp = (v, a, b) => Math.min(b, Math.max(a, num(v)));
const key = v => String(v?.symbol || v || '').toUpperCase().trim();

export const OPPORTUNITY_V318 = {
  version: 31.8,
  // Mindest-Chance-Risiko-Verhaeltnis. Unter 1.5 ist gegen Kosten kaum etwas
  // zu verdienen, weil die Trefferquote dann unrealistisch hoch sein muesste.
  minRewardRisk: 1.8,
  maxRewardRisk: 3.2,
  // Stop als Vielfaches der juengsten Schwankungsbreite statt fixer Prozent.
  stopAtrMultiple: 1.3,
  targetAtrMultiple: 2.6,
  minStopPct: 0.8,
  maxStopPct: 4.0,
  // Risiko je Trade in Prozent des Gesamtkapitals. Positionsgroesse folgt
  // daraus, statt aus allocation_pct-Heuristiken.
  riskPerTradePct: 1.0,
  maxPositionPct: 45,
  minPositionEur: 600,
  // Erwartungswert-Schwelle: der Trade muss die Kosten sichtbar schlagen.
  minEdgeOverCostMultiple: 1.5,
  fallbackHitRate: 0.52,
  minCalibrationSamples: 15
};

// ---------------------------------------------------------------------------
// 1. Geometrie-Audit: welche Trefferquote verlangt die aktuelle Konfiguration?
// ---------------------------------------------------------------------------
export function breakEvenHitRateV318({ stopPct, targetPct, roundTripCostPct = 0.45 } = {}) {
  const loser = Math.abs(num(stopPct)) + num(roundTripCostPct);
  const winner = num(targetPct) - num(roundTripCostPct);
  if (!(loser > 0)) return null;
  if (winner <= 0) return 1;                       // mathematisch nicht gewinnbar
  return +(loser / (loser + winner)).toFixed(4);
}

export function expectancyGeometryAuditV318({
  stopPct, targetPct, roundTripCostPct = 0.45, measuredHitRate = null, cfg = OPPORTUNITY_V318
} = {}) {
  const be = breakEvenHitRateV318({ stopPct, targetPct, roundTripCostPct });
  const loser = Math.abs(num(stopPct)) + num(roundTripCostPct);
  const winner = num(targetPct) - num(roundTripCostPct);
  const rr = loser > 0 ? +(winner / loser).toFixed(3) : null;
  const warnings = [];

  if (be === 1) warnings.push('Ziel liegt unter den Roundtrip-Kosten. Diese Geometrie kann grundsaetzlich nicht gewinnen.');
  else if (be > 0.6) warnings.push(`Break-even-Trefferquote ${(be * 100).toFixed(1)}% - fuer Intraday unrealistisch hoch.`);
  if (rr !== null && rr < cfg.minRewardRisk)
    warnings.push(`Chance-Risiko-Verhaeltnis ${rr} liegt unter dem Minimum ${cfg.minRewardRisk}.`);
  if (measuredHitRate !== null && be !== null && num(measuredHitRate) < be)
    warnings.push(`Gemessene Trefferquote ${(num(measuredHitRate) * 100).toFixed(1)}% liegt UNTER dem Break-even ${(be * 100).toFixed(1)}%. Das System verliert strukturell, unabhaengig von der Signalqualitaet.`);

  // Welches Ziel waere noetig, damit die gemessene Trefferquote traegt?
  let requiredTargetPct = null;
  const p = measuredHitRate === null ? null : clamp(measuredHitRate, 0.01, 0.99);
  if (p !== null && p < 1) {
    // p*W = (1-p)*L  ->  W = (1-p)/p * L, plus Kosten wieder aufschlagen
    requiredTargetPct = +(((1 - p) / p) * loser + num(roundTripCostPct)).toFixed(2);
  }

  return {
    stopPct: +num(stopPct).toFixed(2), targetPct: +num(targetPct).toFixed(2),
    roundTripCostPct: +num(roundTripCostPct).toFixed(2),
    avgLoserPct: +(-loser).toFixed(2), avgWinnerPct: +winner.toFixed(2),
    rewardRisk: rr, breakEvenHitRate: be,
    measuredHitRate: measuredHitRate === null ? null : +num(measuredHitRate).toFixed(3),
    requiredTargetPct, viable: be !== null && (measuredHitRate === null ? be <= 0.6 : num(measuredHitRate) > be),
    warnings
  };
}

// ---------------------------------------------------------------------------
// 2. Volatilitaetsskalierte Exits statt fester Prozentwerte
// ---------------------------------------------------------------------------
export function volatilityScaledExitsV318(candidate = {}, cfg = OPPORTUNITY_V318) {
  // Bevorzugt echte ATR, sonst aus Tagesspanne oder Momentum-Streuung schaetzen.
  let atrPct = num(candidate?.atrPct, NaN);
  let basis = 'ATR';
  if (!Number.isFinite(atrPct) || atrPct <= 0) {
    const high = num(candidate?.dayHigh, NaN), low = num(candidate?.dayLow, NaN), price = num(candidate?.price, NaN);
    if (Number.isFinite(high) && Number.isFinite(low) && price > 0 && high > low) {
      atrPct = ((high - low) / price) * 100; basis = 'DAY_RANGE';
    }
  }
  if (!Number.isFinite(atrPct) || atrPct <= 0) {
    const m20 = Math.abs(num(candidate?.momentum20Pct, candidate?.momentum20));
    atrPct = Math.max(1.0, m20 * 3); basis = 'MOMENTUM_PROXY';
  }

  const stopPct = clamp(atrPct * cfg.stopAtrMultiple, cfg.minStopPct, cfg.maxStopPct);
  // Ziel ebenfalls kappen: wenn der Stop an die Obergrenze stoesst, darf das
  // Ziel nicht davonlaufen - sonst entsteht ein CRV, das nie erreicht wird.
  const targetPct = clamp(atrPct * cfg.targetAtrMultiple,
    stopPct * cfg.minRewardRisk, stopPct * cfg.maxRewardRisk);
  return {
    atrPct: +atrPct.toFixed(3), basis,
    stopPct: +stopPct.toFixed(2), targetPct: +targetPct.toFixed(2),
    rewardRisk: +(targetPct / stopPct).toFixed(2)
  };
}

// ---------------------------------------------------------------------------
// 3. Erwartungswert-Gate fuer jeden BUY
// ---------------------------------------------------------------------------
function hitRateForScore(score, calibration, cfg) {
  const usable = arr(calibration)
    .filter(b => num(b?.samples) >= cfg.minCalibrationSamples && finite(b?.hitRate))
    .sort((a, b) => num(a.bucket) - num(b.bucket));
  if (!usable.length) return { p: cfg.fallbackHitRate, source: 'FALLBACK', samples: 0 };
  let pick = usable[0];
  for (const b of usable) if (num(score) >= num(b.bucket)) pick = b;
  return { p: clamp(pick.hitRate, 0.05, 0.95), source: 'CALIBRATED', samples: num(pick.samples) };
}

export function opportunityExpectedValueV318({
  candidate = {}, score = null, calibration = [], roundTripCostPct = 0.45,
  cfg = OPPORTUNITY_V318
} = {}) {
  const pick = [score, candidate?.daytradeLiveScore, candidate?.score]
    .find(v => v !== null && v !== undefined && finite(v));
  const s = pick === undefined ? 50 : Number(pick);
  const exits = volatilityScaledExitsV318(candidate, cfg);
  const { p, source, samples } = hitRateForScore(s, calibration, cfg);
  const cost = num(roundTripCostPct, 0.45);

  const winner = exits.targetPct - cost;
  const loser = exits.stopPct + cost;
  const ev = p * winner - (1 - p) * loser;
  const required = cost * cfg.minEdgeOverCostMultiple;
  const be = breakEvenHitRateV318({ stopPct: exits.stopPct, targetPct: exits.targetPct, roundTripCostPct: cost });

  const pass = ev >= required && exits.rewardRisk >= cfg.minRewardRisk;
  return {
    symbol: key(candidate), score: +s.toFixed(1),
    ...exits, hitRate: +p.toFixed(3), hitRateSource: source, hitRateSamples: samples,
    roundTripCostPct: +cost.toFixed(3),
    expectedValuePct: +ev.toFixed(3), requiredEvPct: +required.toFixed(3),
    breakEvenHitRate: be, pass,
    reason: pass
      ? `EV +${ev.toFixed(2)}% bei ${(p * 100).toFixed(0)}% Trefferquote (${source}), Ziel ${exits.targetPct}% / Stop ${exits.stopPct}% = CRV ${exits.rewardRisk}.`
      : exits.rewardRisk < cfg.minRewardRisk
        ? `CRV ${exits.rewardRisk} unter Minimum ${cfg.minRewardRisk} - Ziel traegt den Stop nicht.`
        : `EV ${ev.toFixed(2)}% unter Schwelle ${required.toFixed(2)}%. Bei ${(p * 100).toFixed(0)}% Treffer waeren ${(be * 100).toFixed(0)}% noetig.`
  };
}

// ---------------------------------------------------------------------------
// 4. Positionsgroesse aus Risiko statt aus allocation_pct
// ---------------------------------------------------------------------------
export function riskBasedSizeV318({ equity = 0, stopPct = 1.5, cfg = OPPORTUNITY_V318 } = {}) {
  const cap = Math.max(0, num(equity));
  if (!(cap > 0) || !(stopPct > 0)) return { eur: 0, pct: 0, blocked: 'NO_CAPITAL' };
  const riskEur = cap * (cfg.riskPerTradePct / 100);
  let eur = riskEur / (stopPct / 100);
  const maxEur = cap * (cfg.maxPositionPct / 100);
  let capped = null;
  if (eur > maxEur) { eur = maxEur; capped = 'MAX_POSITION_PCT'; }
  if (eur < cfg.minPositionEur) {
    return { eur: 0, pct: 0, riskEur: +riskEur.toFixed(2),
      blocked: 'BELOW_MIN_POSITION',
      note: `Risikogerechte Groesse waere ${eur.toFixed(0)} EUR, Minimum ist ${cfg.minPositionEur} EUR. Darunter fressen Fixkosten die Kante.` };
  }
  return { eur: +eur.toFixed(2), pct: +((eur / cap) * 100).toFixed(2),
    riskEur: +riskEur.toFixed(2), capped, blocked: null };
}

// ---------------------------------------------------------------------------
// 5. Durchsetzung im Plan
// ---------------------------------------------------------------------------
export function enforceOpportunityGateV318(plan, {
  state = {}, calibration = [], roundTripCostPct = null, equity = null,
  cfg = OPPORTUNITY_V318
} = {}) {
  if (!plan || !Array.isArray(plan.actions)) return { plan, counters: {}, assessments: [] };

  const candidates = new Map(arr(state?.candidates).map(c => [key(c), c]));
  const cap = num(equity, num(state?.equity, num(state?.totalValue)));
  const counters = { buys: 0, passed: 0, blockedEv: 0, blockedSize: 0 };
  const assessments = [];

  const actions = plan.actions.map(a => {
    if (String(a?.action || '').toUpperCase() !== 'BUY') return { ...a };
    counters.buys++;
    const c = candidates.get(key(a)) || {};
    const notional = cap > 0 ? cap * (num(a?.allocation_pct, 20) / 100) : 0;
    const cost = (roundTripCostPct !== null && num(roundTripCostPct) > 0)
      ? num(roundTripCostPct)
      : (notional > 0 ? (2 / notional) * 100 + 0.20 : 0.45);

    const ev = opportunityExpectedValueV318({ candidate: c, calibration, roundTripCostPct: cost, cfg });
    assessments.push(ev);

    if (!ev.pass) {
      counters.blockedEv++;
      return { ...a, action: 'HOLD', allocation_pct: 0, opportunityGateV318: ev,
        reason: `V31.8 KEIN POSITIVER ERWARTUNGSWERT: ${ev.reason}` };
    }

    const size = riskBasedSizeV318({ equity: cap, stopPct: ev.stopPct, cfg });
    if (size.blocked) {
      counters.blockedSize++;
      return { ...a, action: 'HOLD', allocation_pct: 0, opportunityGateV318: { ...ev, size },
        reason: `V31.8 POSITIONSGROESSE: ${size.note || size.blocked}` };
    }

    counters.passed++;
    return { ...a, allocation_pct: size.pct, opportunityGateV318: { ...ev, size },
      stopLossPct: -ev.stopPct, takeProfitPct: ev.targetPct,
      reason: `V31.8 CHANCE: ${ev.reason} Groesse ${size.pct}% (Risiko ${cfg.riskPerTradePct}% des Kapitals). ${String(a?.reason || '').slice(0, 200)}` };
  });

  plan.actions = actions;
  if (counters.blockedEv || counters.blockedSize) {
    plan.summary = `${String(plan.summary || '').slice(0, 140)} · V31.8 CHANCE-GATE: ${counters.passed}/${counters.buys} BUYs mit positivem Erwartungswert.`;
  }
  return { plan, counters, assessments };
}
