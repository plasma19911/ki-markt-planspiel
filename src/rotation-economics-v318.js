// V31.8 · Rotations-Oekonomie
//
// Ersetzt die Score-Punkt-Heuristik und den faktisch wirkungslosen
// RotationCostAiGuard durch einen einzigen wirtschaftlichen Test:
//
//   Rotation nur, wenn  ErwarteteNettokante(neu) - ErwarteteNettokante(gehalten)
//   groesser ist als die Roundtrip-Kosten mal Sicherheitsfaktor.
//
// Warum das noetig ist (Befunde aus dem Repo):
//
// 1) EINHEITENBRUCH  relative-rotation-v304 arbeitet in Score-PUNKTEN
//    (rotateMinScoreGap: 8 von 100). rotation-cost-guard vergleicht gegen
//    minGap ~0.8-1.5, also PROZENT. Zwei unvereinbare Skalen.
//
// 2) TOTER GUARD  rotationSell() matcht nur CAPITAL-MOTION-ROTATION oder
//    OPPORTUNITY-COST-ROTATION. V304 schreibt "V31.7 RELATIVE-ROTATION".
//    Der Kostenwaechter feuert auf V304-Rotationen nie. Zusaetzlich liefert
//    reasonGap() bei V304-Texten null, und economicEdge behandelt null als
//    "erlaubt" - der Guard ist also doppelt fail-open.
//
// 3) DISPOSITIONSEFFEKT  lossRotationBlocked sperrt Rotation bei pnl<0,
//    waehrend profitableStagnationRotationV317 Gewinner aktiv herausrotiert.
//    Ergebnis: Gewinner werden verkauft, Verlierer gehalten. Genau das
//    erzeugt "durchschnittlicher Verlierer groesser als Gewinner".
//
// 4) GLOBALER COOLDOWN  mem.lastRotationAt ist ein einziger Zeitstempel.
//    Eine Rotation sperrt 20 Minuten lang jede andere, auch in einem voellig
//    anderen Titel.
//
// Entscheidungen werden ueber STRUKTURIERTE FLAGS gelesen, nicht per Regex
// ueber deutschen Fliesstext.

const arr = v => Array.isArray(v) ? v : [];
const finite = v => Number.isFinite(Number(v));
const num = (v, d = 0) => finite(v) ? Number(v) : d;
const clamp = (v, a, b) => Math.min(b, Math.max(a, num(v)));
const key = x => String(x?.symbol || x || '').toUpperCase().trim();

export const ROTATION_ECONOMICS_V318 = {
  version: 31.8,
  // Rotation zahlt Ausstieg + Einstieg. Der Vorteil muss die Kosten deutlich
  // uebersteigen, sonst frisst Reibung die Differenz.
  requiredCostMultiple: 2.0,
  // Junge Positionen: hoehere Huerde, weil der Score dort noch verrauscht ist.
  youngPositionMinutes: 45,
  youngCostMultiple: 3.5,
  // Ohne belastbare Kalibrierung faellt der Proxy zurueck - konservativ.
  fallbackEdgePerScorePoint: 0.035,   // % erwartete Netto-Rendite je Scorepunkt
  minCalibrationSamples: 15,
  perSymbolCooldownMinutes: 30,
  maxRotationsPerDay: 6,
  hardExitAlwaysAllowed: true
};

// ---------------------------------------------------------------------------
// Score -> erwartete Nettokante in Prozent
// ---------------------------------------------------------------------------
export function expectedNetEdgeV318(score, calibration = [], cost = 0.291, cfg = ROTATION_ECONOMICS_V318) {
  const s = clamp(score, 0, 100);
  const usable = arr(calibration)
    .filter(b => num(b?.samples) >= cfg.minCalibrationSamples && finite(b?.expectedNetEdgePct))
    .sort((a, b) => num(a.bucket) - num(b.bucket));

  if (usable.length >= 2) {
    // Lineare Interpolation zwischen den beiden umgebenden Buckets.
    let lo = usable[0], hi = usable[usable.length - 1];
    for (let i = 0; i < usable.length - 1; i++) {
      if (s >= num(usable[i].bucket) && s <= num(usable[i + 1].bucket)) {
        lo = usable[i]; hi = usable[i + 1]; break;
      }
    }
    const span = num(hi.bucket) - num(lo.bucket);
    const t = span > 0 ? clamp((s - num(lo.bucket)) / span, 0, 1) : 0;
    const edge = num(lo.expectedNetEdgePct) + t * (num(hi.expectedNetEdgePct) - num(lo.expectedNetEdgePct));
    return { edgePct: +edge.toFixed(4), source: 'CALIBRATED', samples: num(lo.samples) + num(hi.samples) };
  }

  // Fallback: Score-Punkte grob in Prozent uebersetzen, abzueglich Kosten.
  const edge = (s - 60) * cfg.fallbackEdgePerScorePoint - cost;
  return { edgePct: +edge.toFixed(4), source: 'PROXY', samples: 0 };
}

// ---------------------------------------------------------------------------
// Kernentscheidung
// ---------------------------------------------------------------------------
export function rotationEconomicsDecisionV318({
  heldSymbol, candidateSymbol,
  heldScore, candidateScore,
  heldPnlPct = 0, heldAgeMinutes = 0,
  notional = 0,
  calibration = [],
  roundTripCostPct = null,
  hardExit = false,
  thesisInvalidated = false,
  memory = {},
  now = Date.now(),
  cfg = ROTATION_ECONOMICS_V318
} = {}) {
  // Kosten: Fixgebuehr auf das Volumen umgelegt plus Spread/Slippage.
  const cost = (roundTripCostPct !== null && roundTripCostPct !== undefined && finite(roundTripCostPct) && Number(roundTripCostPct) > 0)
    ? Number(roundTripCostPct)
    : (notional > 0 ? (2 / notional) * 100 + 0.20 : 0.45);

  if (hardExit && cfg.hardExitAlwaysAllowed) {
    return { allow: true, kind: 'HARD_EXIT', cost: +cost.toFixed(3),
      reason: 'Harter Risikoexit der gehaltenen Position - Kostenpruefung entfaellt.' };
  }

  const eHeld = expectedNetEdgeV318(heldScore, calibration, cost, cfg);
  const eCand = expectedNetEdgeV318(candidateScore, calibration, cost, cfg);
  const edgeGain = eCand.edgePct - eHeld.edgePct;

  const young = heldAgeMinutes < cfg.youngPositionMinutes;
  const multiple = young ? cfg.youngCostMultiple : cfg.requiredCostMultiple;
  const required = cost * multiple;

  // Per-Symbol-Cooldown statt globaler Sperre.
  const lastBySymbol = memory?.lastRotationBySymbol || {};
  const lastOut = num(lastBySymbol[key(heldSymbol)], 0);
  const lastIn = num(lastBySymbol[key(candidateSymbol)], 0);
  const cooldownMs = cfg.perSymbolCooldownMinutes * 60000;
  const cooling = (now - Math.max(lastOut, lastIn)) < cooldownMs;

  // Tagesbudget gegen Churn.
  const today = new Date(now).toISOString().slice(0, 10);
  const usedToday = num(memory?.rotationsByDay?.[today], 0);
  const budgetLeft = usedToday < cfg.maxRotationsPerDay;

  const base = {
    kind: 'ECONOMIC',
    heldEdgePct: eHeld.edgePct, candidateEdgePct: eCand.edgePct,
    edgeGainPct: +edgeGain.toFixed(4),
    requiredGainPct: +required.toFixed(4),
    cost: +cost.toFixed(3), costMultiple: multiple,
    edgeSource: eCand.source, heldAgeMinutes: +num(heldAgeMinutes).toFixed(1),
    heldPnlPct: +num(heldPnlPct).toFixed(2),
    usedToday, cooling
  };

  if (cooling) return { ...base, allow: false,
    reason: `ROTATIONS-COOLDOWN: ${heldSymbol} oder ${candidateSymbol} war vor unter ${cfg.perSymbolCooldownMinutes} Min. an einer Rotation beteiligt.` };

  if (!budgetLeft) return { ...base, allow: false,
    reason: `ROTATIONSBUDGET: bereits ${usedToday} Rotationen heute. Weitere Wechsel kosten mehr, als der Scoreabstand hergibt.` };

  // BEWUSST symmetrisch: der Buchgewinn oder -verlust der gehaltenen Position
  // geht NICHT in die Entscheidung ein. Er ist versunken. Nur die erwartete
  // Kante ab jetzt zaehlt. Das beseitigt den Dispositionseffekt.
  if (edgeGain < required) return { ...base, allow: false,
    reason: `KEIN NETTOVORTEIL: erwartete Kante ${eCand.edgePct.toFixed(2)}% vs. gehalten ${eHeld.edgePct.toFixed(2)}% = ${edgeGain.toFixed(2)}% Gewinn, noetig sind ${required.toFixed(2)}% (${multiple}x Roundtrip-Kosten ${cost.toFixed(2)}%${young ? ', Position noch jung' : ''}).` };

  return { ...base, allow: true,
    reason: `ROTATION WIRTSCHAFTLICH: erwartete Kante steigt um ${edgeGain.toFixed(2)}% netto (noetig ${required.toFixed(2)}%). Quelle ${eCand.source}. Buch-P/L ${num(heldPnlPct).toFixed(2)}% bewusst ignoriert.` };
}

// ---------------------------------------------------------------------------
// Plan-Durchsetzung ueber strukturierte Flags
// ---------------------------------------------------------------------------
export function enforceRotationEconomicsV318(plan, {
  state = {}, calibration = [], memory = {}, now = Date.now(), cfg = ROTATION_ECONOMICS_V318
} = {}) {
  if (!plan || !Array.isArray(plan.actions)) return { plan, counters: {}, memory };

  const mem = {
    lastRotationBySymbol: {}, rotationsByDay: {},
    ...(memory || {})
  };
  const counters = { pairs: 0, allowed: 0, blocked: 0, hardExits: 0 };
  const actions = plan.actions.map(a => ({ ...a }));
  const posMap = new Map(arr(state?.positions).map(p => [key(p), p]));
  const candMap = new Map(arr(state?.candidates).map(c => [key(c), c]));

  // Rotationspaare an FLAGS erkennen, nicht am Text.
  const pairs = [];
  actions.forEach((a, i) => {
    const isRotationSell = String(a?.action || '').toUpperCase() === 'SELL'
      && (a?.relativeRotationV304 === true || a?.weakestPositionReplacementV3061 === true
          || a?.rotationSell === true)
      && a?.pairedReplacementSymbol;
    if (!isRotationSell) return;
    const bi = actions.findIndex(x => key(x) === key({ symbol: a.pairedReplacementSymbol })
      && String(x?.action || '').toUpperCase() === 'BUY');
    pairs.push({ sellIdx: i, buyIdx: bi, sell: a });
  });

  const today = new Date(now).toISOString().slice(0, 10);

  for (const pair of pairs) {
    counters.pairs++;
    const sell = actions[pair.sellIdx];
    const heldSymbol = key(sell);
    const candidateSymbol = key({ symbol: sell.pairedReplacementSymbol });
    const pos = posMap.get(heldSymbol) || {};
    const cand = candMap.get(candidateSymbol) || {};

    const openedAt = Date.parse(String(pos?.opened_at ?? pos?.openedAt ?? ''));
    const ageMinutes = Number.isFinite(openedAt) ? (now - openedAt) / 60000 : num(pos?.ageMinutes);

    const d = rotationEconomicsDecisionV318({
      heldSymbol, candidateSymbol,
      heldScore: num(pos?.decisionScore, num(pos?.score, 50)),
      candidateScore: num(cand?.daytradeLiveScore, num(cand?.score, 50)),
      heldPnlPct: num(pos?.pnlPct, num(pos?.pnl_pct)),
      heldAgeMinutes: ageMinutes,
      notional: num(pos?.invested, num(pos?.amount)),
      calibration,
      hardExit: sell?.hardExit === true || String(pos?.momentumSellSignal || '').toUpperCase() === 'STRONG',
      memory: mem, now, cfg
    });

    if (d.allow) {
      counters.allowed++;
      if (d.kind === 'HARD_EXIT') counters.hardExits++;
      mem.lastRotationBySymbol[heldSymbol] = now;
      mem.lastRotationBySymbol[candidateSymbol] = now;
      mem.rotationsByDay[today] = num(mem.rotationsByDay[today]) + 1;
      actions[pair.sellIdx] = { ...sell, rotationEconomicsV318: d };
      continue;
    }

    counters.blocked++;
    actions[pair.sellIdx] = {
      ...sell, action: 'HOLD', allocation_pct: 0,
      rotationEconomicsV318: d, rotationBlockedV318: true,
      reason: `V31.8 ${d.reason}`
    };
    // Der gepaarte BUY muss mit fallen, sonst entsteht ein Kauf ohne Deckung.
    if (pair.buyIdx >= 0) {
      actions[pair.buyIdx] = {
        ...actions[pair.buyIdx], action: 'HOLD', allocation_pct: 0,
        rotationBlockedV318: true,
        reason: `V31.8 GEPAARTER ROTATIONS-BUY GESTOPPT: ${heldSymbol} wird nicht verkauft, also steht kein Kapital bereit.`
      };
    }
  }

  // Alte Tage aufraeumen.
  for (const day of Object.keys(mem.rotationsByDay)) {
    if (day < new Date(now - 7 * 86400000).toISOString().slice(0, 10)) delete mem.rotationsByDay[day];
  }

  plan.actions = actions;
  if (counters.blocked) {
    plan.summary = `${String(plan.summary || '').slice(0, 150)} · V31.8 ROTATION: ${counters.blocked} von ${counters.pairs} Rotation(en) ohne Nettovorteil gestoppt.`;
  }
  return { plan, counters, memory: mem };
}
