// V31.8 · Reparatur der Lernschleife
//
// Behebt drei strukturelle Ursachen, warum die Selbstlern-Schleife dauerhaft
// in WARMUP haengt:
//
// 1) REIFUNGS-LECK  matureShadowSnapshots() liest den Vergleichspreis aus der
//    AKTUELLEN Kandidatenliste. Das Universum wird aber in Minuten-Slices
//    rotiert (bis 3.000 Titel) und schwache Kandidaten fallen aus der Liste.
//    Ein Snapshot, dessen Symbol nach 60 Minuten nicht zufaellig wieder in der
//    Liste steht, wird nach 3x Horizont geloescht - ohne Sample.
//    -> Hier: eigener Quote-Resolver fuer faellige Snapshots.
//
// 2) SURVIVORSHIP-BIAS  Genau die Snapshots reifen, deren Symbol dauerhaft
//    stark genug fuer die Kandidatenliste blieb. Die Kalibrierung lernt also
//    auf einer Stichprobe, aus der die Verlierer systematisch entfernt wurden.
//    Punkt 1 behebt das mit; shadowSampleHealthV318() macht es messbar.
//
// 3) EPOCH-WIPE  migrateShadowCalibrationEpochV31729() loescht bei jeder
//    Aenderung der Epoch-Konstante ALLE matured Samples. Jede Logik-Aenderung
//    setzt das Lernen damit auf null zurueck.
//    -> Hier: Samples bleiben erhalten, werden als 'legacy' markiert und
//       gewichtet weiterverwendet, statt vernichtet zu werden.
//
// FX-Basis: Neue Samples rechnen die Rendite in NATIVER Waehrung. Waehrungs-
// bewegung ist ein Depot-Effekt, keine Signalqualitaet. Das eliminiert die
// gesamte fxBasisMismatch-Verlustklasse.

const arr = v => Array.isArray(v) ? v : [];
const finite = v => Number.isFinite(Number(v));
const num = (v, d = 0) => finite(v) ? Number(v) : d;
const key = v => String(v?.symbol || v || '').toUpperCase().trim();

export const SHADOW_MATURATION_V318 = {
  version: 31.8,
  // Wie lange ein faelliger Snapshot auf Aufloesung warten darf, bevor er
  // verfaellt. Vorher: 3x Horizont (180 min) UND nur per Zufallstreffer in der
  // Kandidatenliste. Jetzt: aktiv aufgeloest, Frist grosszuegiger.
  resolveGraceMultiple: 8,
  // Yahoo-Spark vertraegt Batches; klein halten wegen Worker-CPU/Subrequests.
  quoteBatchSize: 40,
  maxResolvePerRun: 160,
  maxPlausibleAbsReturnPct: 35,
  legacySampleWeight: 0.35,
  minNativeSamplesBeforeLegacyDrop: 120
};

// ---------------------------------------------------------------------------
// Quote-Resolver: holt Preise fuer faellige Snapshots unabhaengig vom Scanner
// ---------------------------------------------------------------------------
async function sparkChunk(symbols) {
  const u = new URL('https://query1.finance.yahoo.com/v7/finance/spark');
  u.searchParams.set('symbols', symbols.join(','));
  u.searchParams.set('range', '1d');
  u.searchParams.set('interval', '5m');
  const r = await fetch(u, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; KI-Markt-Planspiel/ShadowMaturation)'
    }
  });
  if (!r.ok) throw new Error(`spark HTTP ${r.status}`);
  const j = await r.json();
  const out = new Map();
  for (const item of arr(j?.spark?.result ?? j)) {
    const res = item?.response?.[0];
    if (!res) continue;
    const sym = String(item?.symbol || res?.meta?.symbol || '').toUpperCase();
    const closes = arr(res?.indicators?.quote?.[0]?.close)
      .map(Number).filter(v => Number.isFinite(v) && v > 0);
    if (!sym || !closes.length) continue;
    out.set(sym, {
      price: closes[closes.length - 1],
      currency: res?.meta?.currency || null
    });
  }
  return out;
}

export async function resolvePendingQuotesV318(symbols, cfg = SHADOW_MATURATION_V318) {
  const list = [...new Set(arr(symbols).map(s => String(s).toUpperCase()).filter(Boolean))]
    .slice(0, cfg.maxResolvePerRun);
  const prices = new Map();
  const errors = [];
  for (let i = 0; i < list.length; i += cfg.quoteBatchSize) {
    const chunk = list.slice(i, i + cfg.quoteBatchSize);
    try {
      const got = await sparkChunk(chunk);
      for (const [k, v] of got) prices.set(k, v);
    } catch (e) {
      errors.push(String(e?.message || e));
    }
  }
  return { prices, requested: list.length, resolved: prices.size, errors };
}

// ---------------------------------------------------------------------------
// Reifung mit aktiver Aufloesung
// ---------------------------------------------------------------------------
export async function matureShadowSnapshotsV318(mem, candidates, now, opts = {}) {
  const cfg = { ...SHADOW_MATURATION_V318, ...(opts.cfg || {}) };
  const horizonMs = num(opts.horizonMinutes, 60) * 60000;
  const resolver = opts.resolver || resolvePendingQuotesV318;
  const counters = {
    due: 0, fromCandidates: 0, fromResolver: 0,
    matured: 0, expired: 0, implausible: 0, resolveErrors: 0
  };

  mem.matured = arr(mem.matured);
  mem.stats = mem.stats || {};

  // Preise, die der Scan ohnehin geliefert hat (kostenlos)
  const local = new Map(arr(candidates).map(c => [key(c), num(c?.price, c?.last_price)]));

  const due = [];
  for (const [id, snap] of Object.entries(mem.open || {})) {
    if (now - num(snap?.at, now) < horizonMs) continue;
    counters.due++;
    due.push([id, snap]);
  }
  if (!due.length) return { mem, counters };

  const missing = due
    .filter(([, s]) => !(local.get(s.symbol) > 0))
    .map(([, s]) => s.symbol);

  let fetched = new Map();
  if (missing.length) {
    try {
      const res = await resolver(missing, cfg);
      fetched = res.prices || new Map();
      counters.resolveErrors = arr(res.errors).length;
    } catch (e) {
      counters.resolveErrors++;
    }
  }

  for (const [id, snap] of due) {
    const age = now - num(snap.at, now);
    let price = local.get(snap.symbol);
    let source = 'CANDIDATE';
    if (!(price > 0)) {
      const f = fetched.get(snap.symbol);
      if (f?.price > 0) { price = f.price; source = 'RESOLVER'; }
    }

    if (!(price > 0)) {
      // Noch nicht aufloesbar (Boerse zu, Quelle down). Frist laeuft.
      if (age > horizonMs * cfg.resolveGraceMultiple) {
        delete mem.open[id];
        counters.expired++;
        mem.stats.expired = num(mem.stats.expired) + 1;
      }
      continue;
    }

    source === 'CANDIDATE' ? counters.fromCandidates++ : counters.fromResolver++;

    // NATIVE Basis: kein FX auf beiden Seiten -> kein Mismatch moeglich.
    const from = num(snap.price);
    const retPct = from > 0 ? ((price / from) - 1) * 100 : null;

    if (retPct === null || !Number.isFinite(retPct) ||
        Math.abs(retPct) > cfg.maxPlausibleAbsReturnPct) {
      delete mem.open[id];
      counters.implausible++;
      mem.stats.implausibleReturns = num(mem.stats.implausibleReturns) + 1;
      continue;
    }

    mem.matured.push({
      symbol: snap.symbol,
      score: num(snap.score),
      theme: snap.theme,
      calibrationEpoch: snap.calibrationEpoch || null,
      evidenceQuality: num(snap.evidenceQuality),
      evidencePillars: num(snap.evidencePillars),
      entryScoreV317: finite(snap.entryScoreV317) ? num(snap.entryScoreV317) : null,
      dataQualityV317: finite(snap.dataQualityV317) ? num(snap.dataQualityV317) : null,
      ret: +retPct.toFixed(4),
      basis: 'NATIVE',
      resolvedVia: source,
      weight: 1,
      sampleAt: num(snap.at),
      at: now
    });
    counters.matured++;
    mem.stats.matured = num(mem.stats.matured) + 1;
    delete mem.open[id];
  }

  const cap = num(opts.maxMaturedSamples, 1500);
  if (mem.matured.length > cap) mem.matured = mem.matured.slice(-cap);
  mem.stats.resolverMatured = num(mem.stats.resolverMatured) + counters.fromResolver;
  return { mem, counters };
}

// ---------------------------------------------------------------------------
// Epoch-Migration OHNE Datenvernichtung
// ---------------------------------------------------------------------------
export function migrateShadowEpochPreservingV318(memory, activeEpoch, now = Date.now(), cfg = SHADOW_MATURATION_V318) {
  const mem = { ...(memory || {}) };
  mem.matured = arr(mem.matured);
  mem.open = { ...(mem.open || {}) };
  mem.stats = mem.stats || {};
  const previousEpoch = mem.calibrationEpoch || null;
  const changed = previousEpoch && previousEpoch !== activeEpoch;

  // Unmoegliche Altwerte weiterhin ausmisten - das war richtig.
  const before = mem.matured.length;
  mem.matured = mem.matured.filter(x => {
    const r = Number(x?.ret);
    return Number.isFinite(r) && Math.abs(r) <= cfg.maxPlausibleAbsReturnPct;
  });
  const pruned = before - mem.matured.length;
  if (pruned > 0) mem.stats.prunedImplausible = num(mem.stats.prunedImplausible) + pruned;

  if (changed) {
    // Statt loeschen: abwerten und markieren. Die Kalibrierung darf sie
    // benutzen, bis genug Samples der neuen Epoche vorliegen.
    let downgraded = 0;
    mem.matured = mem.matured.map(x => {
      if (x?.epochStatus === 'legacy') return x;
      downgraded++;
      return { ...x, epochStatus: 'legacy', legacyEpoch: x?.calibrationEpoch || previousEpoch, weight: cfg.legacySampleWeight };
    });
    // Offene Snapshots der Altepoche bleiben offen - sie reifen ohnehin gleich.
    mem.epochHistory = [...arr(mem.epochHistory).slice(-9), {
      from: previousEpoch, to: activeEpoch, at: new Date(now).toISOString(),
      downgraded, mode: 'PRESERVE'
    }];
    mem.stats.epochDowngrades = num(mem.stats.epochDowngrades) + downgraded;
  }

  // Legacy-Samples fallen lassen, sobald genug native Evidenz da ist.
  const nativeCount = mem.matured.filter(x => x?.epochStatus !== 'legacy').length;
  if (nativeCount >= cfg.minNativeSamplesBeforeLegacyDrop) {
    const kept = mem.matured.filter(x => x?.epochStatus !== 'legacy');
    mem.stats.legacyRetired = num(mem.stats.legacyRetired) + (mem.matured.length - kept.length);
    mem.matured = kept;
  }

  mem.calibrationEpoch = activeEpoch;
  return { mem, changed, previousEpoch, activeEpoch, nativeCount };
}

// ---------------------------------------------------------------------------
// Meta-Monitoring: laeuft die Schleife, und ist die Stichprobe verzerrt?
// ---------------------------------------------------------------------------
export function shadowSampleHealthV318(mem, cfg = SHADOW_MATURATION_V318) {
  const matured = arr(mem?.matured);
  const open = Object.keys(mem?.open || {}).length;
  const stats = mem?.stats || {};
  const snapshots = num(stats.snapshots);
  const maturedTotal = num(stats.matured);
  const expired = num(stats.expired);
  const viaResolver = num(stats.resolverMatured);

  // Kernkennzahl: wie viele aufgenommene Snapshots werden je zu Samples?
  const maturationRate = snapshots > 0 ? maturedTotal / snapshots : null;
  // Bias-Proxy: reifen nur die, die im Scanner blieben, ist die Rate niedrig
  // UND die Renditeverteilung nach oben verschoben.
  const rets = matured.map(x => Number(x?.ret)).filter(Number.isFinite);
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null;
  const positives = rets.filter(r => r > 0).length;
  const hitRate = rets.length ? positives / rets.length : null;

  const warnings = [];
  if (maturationRate !== null && maturationRate < 0.35)
    warnings.push(`REIFUNGSLECK: nur ${(maturationRate * 100).toFixed(0)}% der Snapshots werden zu Samples (${expired} verfallen).`);
  if (hitRate !== null && hitRate > 0.72 && rets.length >= 40)
    warnings.push(`SURVIVORSHIP-VERDACHT: ${(hitRate * 100).toFixed(0)}% Treffer in der Shadow-Stichprobe ist unrealistisch hoch.`);
  if (matured.length && matured.every(x => x?.epochStatus === 'legacy'))
    warnings.push('KEINE NATIVEN SAMPLES: alle Samples stammen aus einer alten Kalibrierungs-Epoche.');
  if (open > 0 && maturedTotal === 0)
    warnings.push('NOCH KEIN EINZIGES SAMPLE GEREIFT - Reifung pruefen.');

  return {
    version: cfg.version,
    openSnapshots: open,
    maturedSamples: matured.length,
    maturedTotalEver: maturedTotal,
    expiredTotal: expired,
    maturedViaResolver: viaResolver,
    maturationRate: maturationRate === null ? null : +maturationRate.toFixed(3),
    meanReturnPct: mean === null ? null : +mean.toFixed(3),
    hitRate: hitRate === null ? null : +hitRate.toFixed(3),
    legacySamples: matured.filter(x => x?.epochStatus === 'legacy').length,
    nativeSamples: matured.filter(x => x?.epochStatus !== 'legacy').length,
    warnings
  };
}
