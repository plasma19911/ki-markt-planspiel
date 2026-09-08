// V31.8 · Guard-Trace und Plan-Invarianten
//
// ANLASS: Der Entscheidungspfad besteht aus rund 58 Guard-Klassen, die den
// KI-Plan nacheinander umschreiben. Jeder Guard kann die Entscheidung eines
// frueheren Guards wieder aufheben. Die Reihenfolge steckt implizit in einer
// Kette von ~40 compact-portfolio-vN-Dateien.
//
// Dass darin tote Guards stecken, ist keine Vermutung mehr: RotationCostAiGuard
// erkennt Rotations-Verkaeufe per Regex auf "CAPITAL-MOTION-ROTATION", waehrend
// die produktive Rotation "V31.7 RELATIVE-ROTATION" schreibt. Er hat nie
// gefeuert. Ohne Messung ist nicht feststellbar, wie viele weitere so daliegen.
//
// Dieses Modul beantwortet zwei Fragen im laufenden Betrieb:
//   1. Welcher Guard aendert ueberhaupt jemals etwas?
//   2. Welcher Guard hebt die Entscheidung eines anderen wieder auf?
//
// Zusaetzlich prueft es Invarianten, die kein einzelner Guard pruefen kann,
// weil sie erst aus dem Zusammenspiel entstehen.

const arr = v => Array.isArray(v) ? v : [];
const num = (v, d = 0) => (v === null || v === undefined || v === '' || Array.isArray(v) || typeof v === 'boolean')
  ? d : (Number.isFinite(Number(v)) ? Number(v) : d);
const key = v => String(v?.symbol || v || '').toUpperCase().trim();
const act = a => String(a?.action || '').toUpperCase();

export const GUARD_TRACE_V318 = { version: 31.8, storageKey: 'guard-trace-v318', maxHistory: 200 };

// ---------------------------------------------------------------------------
// Plan-Fingerabdruck: erlaubt Vorher/Nachher-Vergleich je Guard
// ---------------------------------------------------------------------------
export function planFingerprintV318(plan) {
  const rows = arr(plan?.actions)
    .map(a => `${key(a)}:${act(a)}:${num(a?.allocation_pct).toFixed(2)}`)
    .sort();
  return rows.join('|');
}

export function diffPlansV318(before, after) {
  const b = new Map(arr(before?.actions).map(a => [key(a), a]));
  const c = new Map(arr(after?.actions).map(a => [key(a), a]));
  const changes = [];
  for (const [sym, a] of c) {
    const prev = b.get(sym);
    if (!prev) { changes.push({ symbol: sym, kind: 'ADDED', to: act(a) }); continue; }
    if (act(prev) !== act(a))
      changes.push({ symbol: sym, kind: 'ACTION', from: act(prev), to: act(a) });
    else if (Math.abs(num(prev.allocation_pct) - num(a.allocation_pct)) > 0.01)
      changes.push({ symbol: sym, kind: 'SIZE', from: num(prev.allocation_pct), to: num(a.allocation_pct) });
  }
  for (const [sym, a] of b) if (!c.has(sym)) changes.push({ symbol: sym, kind: 'REMOVED', from: act(a) });
  return changes;
}

// ---------------------------------------------------------------------------
// Wrapper: legt sich um einen Guard und protokolliert, ob er wirkt
// ---------------------------------------------------------------------------
export function traceGuardV318(guard, name, sink) {
  if (!guard || typeof guard.run !== 'function') return guard;
  const inner = guard.run.bind(guard);
  guard.run = async (model, input) => {
    let before = null;
    try { before = parsePlanLoose(await peek(input)); } catch {}
    const t0 = Date.now();
    const result = await inner(model, input);
    const after = parsePlanLoose(result);
    const entry = { guard: name, ms: Date.now() - t0, changed: false, changes: [] };
    if (before && after) {
      const d = diffPlansV318(before, after);
      entry.changed = d.length > 0;
      entry.changes = d.slice(0, 8);
    }
    try { sink?.(entry); } catch {}
    return result;
  };
  return guard;
}

async function peek() { return null; }   // Platzhalter: Vorzustand kommt vom Aufrufer

function parsePlanLoose(r) {
  const raw = String(r?.response || r?.result?.response || (typeof r === 'string' ? r : ''));
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const j = JSON.parse(raw.slice(a, b + 1)); return Array.isArray(j?.actions) ? j : null; } catch { return null; }
}

// ---------------------------------------------------------------------------
// Einfacher, robuster Weg: Kette sequentiell tracen statt zu dekorieren
// ---------------------------------------------------------------------------
export function traceChainV318(steps = []) {
  // steps: [{ name, apply: (plan) => plan }]
  return function run(plan) {
    const trace = [];
    let current = plan;
    for (const step of steps) {
      const before = current;
      const t0 = Date.now();
      let next = current;
      let error = null;
      try { next = step.apply(current) || current; }
      catch (e) { error = String(e?.message || e); }
      const changes = diffPlansV318(before, next);
      trace.push({ name: step.name, ms: Date.now() - t0, changed: changes.length > 0, changes, error });
      current = next;
    }
    return { plan: current, trace, summary: summarizeTraceV318(trace) };
  };
}

export function summarizeTraceV318(trace = []) {
  const rows = arr(trace);
  const silent = rows.filter(x => !x.changed && !x.error).map(x => x.name);
  const errored = rows.filter(x => x.error).map(x => ({ name: x.name, error: x.error }));

  // Wer hebt wen auf? Ein Guard revidiert einen frueheren, wenn er dasselbe
  // Symbol erneut auf eine andere Aktion setzt.
  const lastTouch = new Map();
  const reversals = [];
  for (const step of rows) {
    for (const c of arr(step.changes)) {
      if (c.kind !== 'ACTION') continue;
      const prev = lastTouch.get(c.symbol);
      if (prev && prev.to !== c.to)
        reversals.push({ symbol: c.symbol, first: prev.name, firstSet: prev.to, then: step.name, thenSet: c.to });
      lastTouch.set(c.symbol, { name: step.name, to: c.to });
    }
  }
  return {
    steps: rows.length,
    active: rows.filter(x => x.changed).length,
    silent: silent.length,
    silentGuards: silent,
    errored,
    reversals,
    totalMs: rows.reduce((a, x) => a + num(x.ms), 0)
  };
}

// ---------------------------------------------------------------------------
// Invarianten, die kein einzelner Guard pruefen kann
// ---------------------------------------------------------------------------
export function checkPlanInvariantsV318(plan, { state = {}, cash = null } = {}) {
  const actions = arr(plan?.actions);
  const violations = [];
  const held = new Set(arr(state?.positions).map(key));

  // 1. Dasselbe Symbol darf nicht gleichzeitig BUY und SELL sein.
  const bySymbol = new Map();
  for (const a of actions) {
    const s = key(a); if (!s) continue;
    const set = bySymbol.get(s) || new Set(); set.add(act(a)); bySymbol.set(s, set);
  }
  for (const [s, set] of bySymbol)
    if (set.has('BUY') && set.has('SELL'))
      violations.push({ kind: 'BUY_AND_SELL', symbol: s, detail: 'Gegensaetzliche Aktionen fuer dasselbe Symbol im selben Plan.' });

  // 2. Summe der BUY-Allokationen darf 100% nicht ueberschreiten.
  const buySum = actions.filter(a => act(a) === 'BUY').reduce((x, a) => x + Math.max(0, num(a?.allocation_pct)), 0);
  if (buySum > 100.5)
    violations.push({ kind: 'OVER_ALLOCATION', detail: `BUY-Allokationen summieren auf ${buySum.toFixed(1)}%.` });

  // 3. Gepaarte Rotation: BUY, dessen Gegenfinanzierung gestrichen wurde.
  for (const a of actions) {
    const paired = a?.pairedReplacementSymbol;
    if (!paired || act(a) !== 'BUY') continue;
    const counter = actions.find(x => key(x) === key({ symbol: paired }));
    if (counter && act(counter) !== 'SELL')
      violations.push({ kind: 'UNFUNDED_ROTATION_BUY', symbol: key(a),
        detail: `Kauf verweist auf Verkauf von ${key(counter)}, der auf ${act(counter)} steht.` });
  }

  // 4. Verkauf eines Titels, der nicht im Depot ist.
  for (const a of actions)
    if (act(a) === 'SELL' && !held.has(key(a)))
      violations.push({ kind: 'SELL_WITHOUT_POSITION', symbol: key(a) });

  // 5. Kauf ohne Deckung, wenn kein Verkauf Kapital freisetzt.
  if (cash !== null) {
    const sells = actions.filter(a => act(a) === 'SELL').length;
    const buys = actions.filter(a => act(a) === 'BUY').length;
    if (buys > 0 && num(cash) <= 2 && sells === 0)
      violations.push({ kind: 'BUY_WITHOUT_CASH', detail: `${buys} Kauf/Kaeufe bei ${num(cash).toFixed(2)} Cash und ohne Verkauf.` });
  }

  return { ok: violations.length === 0, violations, buyAllocationSum: +buySum.toFixed(2) };
}

// ---------------------------------------------------------------------------
// Persistente Guard-Statistik: welcher Guard war seit Tagen stumm?
// ---------------------------------------------------------------------------
export function updateGuardStatsV318(memory = {}, trace = [], now = Date.now()) {
  const mem = { guards: {}, updatedAt: null, ...(memory || {}) };
  for (const step of arr(trace)) {
    const g = mem.guards[step.name] || (mem.guards[step.name] = { runs: 0, changes: 0, errors: 0, lastChangeAt: null });
    g.runs++;
    if (step.changed) { g.changes++; g.lastChangeAt = now; }
    if (step.error) { g.errors++; g.lastError = step.error; }
  }
  mem.updatedAt = new Date(now).toISOString();
  return mem;
}

export function deadGuardReportV318(memory = {}, { minRuns = 200, now = Date.now() } = {}) {
  const rows = Object.entries(memory?.guards || {}).map(([name, g]) => ({
    name, runs: num(g.runs), changes: num(g.changes), errors: num(g.errors),
    changeRate: num(g.runs) > 0 ? +(num(g.changes) / num(g.runs)).toFixed(4) : null,
    daysSinceChange: g.lastChangeAt ? +((now - num(g.lastChangeAt)) / 86400000).toFixed(1) : null
  }));
  const dead = rows.filter(x => x.runs >= minRuns && x.changes === 0);
  const rare = rows.filter(x => x.runs >= minRuns && x.changes > 0 && x.changeRate < 0.002);
  return {
    total: rows.length,
    dead: dead.map(x => x.name),
    rare: rare.map(x => ({ name: x.name, changeRate: x.changeRate })),
    erroring: rows.filter(x => x.errors > 0).map(x => ({ name: x.name, errors: x.errors })),
    note: dead.length
      ? `${dead.length} Guard(s) haben in ueber ${minRuns} Laeufen nie etwas veraendert. Entweder wirkungslos wie RotationCostAiGuard oder ihre Bedingung greift nie.`
      : 'Kein Guard dauerhaft stumm.'
  };
}
