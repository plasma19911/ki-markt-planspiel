// V31.8 · News-Auswertung
//
// Drei belegte Defekte in der bestehenden Kette:
//
// 1) KURZE TICKER/NAMEN MATCHEN NIE  news-entity-relevance.js filtert
//    companyWords() auf Woerter mit >=4 Zeichen und laesst Symbol-Treffer erst
//    ab 4 Zeichen zu. Fuer "SAP SE" bleibt danach KEIN einziges Wort uebrig,
//    und "sap" ist 3 Zeichen. Getestet:
//       SAP.DE / "SAP raises full-year guidance"  -> false
//       BMW.DE / "BMW cuts guidance"              -> false
//       RWE.DE / "RWE wins contract"              -> false
//    Jede Meldung zu diesen Titeln wird als "nicht firmenbezogen" verworfen
//    und der News-Beitrag per neutralizeCandidate() wieder herausgerechnet.
//
// 2) DIRECTION 0 WIRD ALS FEHLSCHLAG GELERNT  classifyNewsImpact() gibt fuer
//    M&A und EARNINGS direction:0 zurueck. In evaluateNewsEventFromBars gilt
//       alignedAbnormalPct = dir ? abnormalPct*dir : 0
//    und die Trefferquote zaehlt alignedAbnormalPct > 0. Ein Ereignis ohne
//    Richtung ist damit immer ein Miss. Die beiden haeufigsten und stark
//    wirksamsten Klassen druecken so dauerhaft ihre eigene Statistik.
//    Richtig ist: ohne Richtung kein Sample, nicht Sample mit Wert 0.
//
// 3) ZU ENGE PHRASEN  "Apple Q3 results beat on revenue" faellt auf
//    EARNINGS/impact 2 zurueck, weil nur die exakte Phrase "beats estimates"
//    erkannt wird. Der Beat geht verloren.

const txt = v => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
const has = (s, ...xs) => xs.some(x => s.includes(x));
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const normalize = v => String(v || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9äöüß]+/gi, ' ').replace(/\s+/g, ' ').trim();

const LEGAL = new Set(['inc','incorporated','corp','corporation','company','co','plc','ag','se','sa','nv',
  'oyj','ab','asa','ltd','limited','holdings','holding','group','registered','ordinary','shares','ord','shs','the','and']);

// Woerter, die als Firmenname zu generisch sind und Fehltreffer erzeugen.
const AMBIGUOUS = new Set(['global','first','general','national','american','united','micro','systems',
  'technologies','technology','industries','international','solutions','digital','energy','capital','partners']);

export const NEWS_ENTITY_V318 = {
  version: 31.8,
  minNameWordLength: 3,      // vorher 4 - schloss SAP/RWE komplett aus
  minTickerLength: 2,        // vorher 4
  requireUppercaseForShortTicker: true
};

// ---------------------------------------------------------------------------
// Entity-Matching
// ---------------------------------------------------------------------------
function tickerRoot(c = {}) {
  return String(c?.symbol || '').toUpperCase().split('.')[0].replace(/[^A-Z0-9]/g, '');
}
function companyWordsV318(c = {}, cfg = NEWS_ENTITY_V318) {
  return normalize(c?.name || c?.symbol).split(' ')
    .filter(w => w.length >= cfg.minNameWordLength && !LEGAL.has(w));
}

export function newsHeadlineMatchesEntityV318(c = {}, headline = '', cfg = NEWS_ENTITY_V318) {
  const original = String(headline || '');
  const t = normalize(original);
  if (!t) return false;
  const tokens = new Set(t.split(' '));
  const words = companyWordsV318(c, cfg);

  // 1) Mehrwort-Firmenname als zusammenhaengende Phrase
  if (words.length >= 2 && t.includes(words.slice(0, 2).join(' '))) return true;

  // 2) Einzelnes, hinreichend spezifisches Namenswort
  const lead = words[0];
  if (lead && lead.length >= 5 && !AMBIGUOUS.has(lead) && tokens.has(lead)) return true;

  // 3) Ticker-Wurzel. Kurze Ticker (SAP, BMW, RWE) nur akzeptieren, wenn sie in
  //    der Original-Headline auch GROSS geschrieben stehen. "sap" in einem
  //    Fliesstext ist Zufall, "SAP" ist die Firma.
  const root = tickerRoot(c);
  if (root.length >= cfg.minTickerLength) {
    const lower = root.toLowerCase();
    if (tokens.has(lower)) {
      if (root.length >= 4) return true;
      if (!cfg.requireUppercaseForShortTicker) return true;
      if (new RegExp(`\\b${root}\\b`).test(original)) return true;
    }
  }

  // 4) Akronym aus den Namensinitialen (Bayerische Motoren Werke -> BMW)
  const all = normalize(c?.name).split(' ').filter(w => w && !LEGAL.has(w));
  if (all.length >= 2) {
    const acr = all.map(w => w[0]).join('').toUpperCase();
    if (acr.length >= 2 && new RegExp(`\\b${acr}\\b`).test(original)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Impact-Klassifikation mit Richtungserkennung
// ---------------------------------------------------------------------------
function maDirection(h) {
  // Uebernahmeziel steigt, Kaeufer meist leicht negativ. Passivkonstruktionen
  // ("to be acquired by", "agrees to be bought") kennzeichnen das Ziel.
  const target = /\b(to be (acquired|bought|taken over)|agrees to be|receives (a )?(takeover|buyout) (bid|offer)|uebernahmeangebot fuer|wird uebernommen)\b/.test(h);
  const acquirer = /\b(acquires|to acquire|agrees to buy|to buy|buys|uebernimmt|kauft)\b/.test(h);
  if (target) return { direction: 1, role: 'TARGET' };
  if (acquirer) return { direction: -1, role: 'ACQUIRER' };
  return { direction: 0, role: 'UNKNOWN' };
}

export function classifyNewsImpactV318(headline = '') {
  const h = txt(headline);
  if (!h) return { type: 'NONE', direction: 0, impact: 0, binary: false, structural: false, directionKnown: false };

  const wrap = x => ({ ...x, directionKnown: x.direction !== 0 });

  if (/phase\s*(2|ii|3|iii)\b/.test(h) || has(h, 'clinical trial', 'klinische studie', 'primary endpoint', 'trial meets')) {
    const pos = has(h, 'met primary', 'meets primary', 'met its primary', 'positive', 'significant reduction',
      'improved', 'success', 'achieved', 'erreicht', 'signifikant', 'risk reduction', 'met key endpoint');
    const neg = has(h, 'failed', 'missed primary', 'did not meet', 'no benefit', 'futility', 'safety concern', 'verfehlt', 'gescheitert');
    return wrap({ type: 'CLINICAL_TRIAL', direction: pos ? 1 : neg ? -1 : 0,
      impact: /phase\s*(3|iii)\b/.test(h) ? 5 : 4, binary: true, structural: true });
  }
  if (has(h, 'fda approval', 'fda approves', 'ema approval', 'approved by fda', 'zulassung erteilt', 'regulatory approval'))
    return wrap({ type: 'REGULATORY_APPROVAL', direction: 1, impact: 5, binary: true, structural: true });
  if (has(h, 'complete response letter', 'fda rejects', 'approval denied', 'zulassung abgelehnt'))
    return wrap({ type: 'REGULATORY_REJECTION', direction: -1, impact: 5, binary: true, structural: true });
  if (has(h, 'raises guidance', 'raised guidance', 'raises outlook', 'hebt prognose', 'prognose angehoben',
    'guidance above', 'raises full-year', 'forecast raised', 'lifts outlook', 'lifts guidance'))
    return wrap({ type: 'GUIDANCE_RAISE', direction: 1, impact: 4, binary: false, structural: true });
  if (has(h, 'cuts guidance', 'cut guidance', 'lowers guidance', 'senkt prognose', 'gewinnwarnung',
    'profit warning', 'lowers full-year', 'trims outlook', 'slashes forecast'))
    return wrap({ type: 'GUIDANCE_CUT', direction: -1, impact: 5, binary: false, structural: true });

  if (has(h, 'strategic investment', 'strategic stake', 'takes a stake', 'takes stake', 'equity investment', 'invests in'))
    return wrap({ type: 'STRATEGIC_STAKE', direction: 1, impact: 4, binary: false, structural: true });

  if (has(h, 'acquisition', 'acquire', 'takeover', 'merger', 'übernahme', 'uebernahme', 'fusion', 'buyout', 'to buy')) {
    const d = maDirection(h);
    // Richtung unbekannt -> NICHT als Sample mit Richtung 0 verbuchen.
    return { type: 'M&A', direction: d.direction, maRole: d.role, impact: 4,
      binary: true, structural: true, directionKnown: d.direction !== 0 };
  }

  if (has(h, 'major contract', 'contract award', 'wins contract', 'large order', 'record order',
    'großauftrag', 'grossauftrag', 'auftrag erhalten', 'multi-year agreement', 'secures order'))
    return wrap({ type: 'MAJOR_CONTRACT', direction: 1, impact: 3, binary: false, structural: false });
  if (has(h, 'capital increase', 'rights issue', 'secondary offering', 'share offering', 'dilution', 'kapitalerhöhung'))
    return wrap({ type: 'DILUTION_FINANCING', direction: -1, impact: 4, binary: false, structural: true });
  if (has(h, 'fraud', 'accounting irregular', 'sec investigation', 'criminal investigation', 'bankrupt',
    'insolven', 'default', 'recall', 'data breach', 'cyberattack'))
    return wrap({ type: 'SEVERE_NEGATIVE', direction: -1, impact: 5, binary: true, structural: true });

  // Ergebnis-Meldungen: erst Richtung suchen, dann erst neutral einordnen.
  const earningsish = has(h, 'earnings', 'quarter', 'quartal', 'results', 'ergebnis', 'eps', 'revenue',
    'umsatz', 'profit', 'gewinn', 'q1', 'q2', 'q3', 'q4');
  if (earningsish) {
    const beat = /\b(beat|beats|tops|topped|exceeds|exceeded|above (estimates|expectations|consensus))\b/.test(h)
      || has(h, 'übertrifft erwartungen', 'uebertrifft erwartungen', 'besser als erwartet');
    const miss = /\b(miss|misses|missed|falls short|below (estimates|expectations|consensus)|disappoint)\w*\b/.test(h)
      || has(h, 'verfehlt erwartungen', 'schlechter als erwartet');
    if (beat && !miss) return wrap({ type: 'EARNINGS_BEAT', direction: 1, impact: 3, binary: false, structural: false });
    if (miss && !beat) return wrap({ type: 'EARNINGS_MISS', direction: -1, impact: 3, binary: false, structural: false });
    return { type: 'EARNINGS', direction: 0, impact: 2, binary: false, structural: false, directionKnown: false };
  }

  if (has(h, 'buyback', 'share repurchase', 'aktienrückkauf', 'dividend increase', 'dividende erhöht'))
    return wrap({ type: 'CAPITAL_RETURN', direction: 1, impact: 2, binary: false, structural: false });
  if (has(h, 'upgrade', 'price target raised', 'kursziel erhöht'))
    return wrap({ type: 'ANALYST_POSITIVE', direction: 1, impact: 1, binary: false, structural: false });
  if (has(h, 'downgrade', 'price target cut', 'kursziel gesenkt'))
    return wrap({ type: 'ANALYST_NEGATIVE', direction: -1, impact: 1, binary: false, structural: false });

  return { type: 'OTHER', direction: 0, impact: 1, binary: false, structural: false, directionKnown: false };
}

// ---------------------------------------------------------------------------
// Sample-Guard: richtungslose Ereignisse duerfen die Statistik nicht senken
// ---------------------------------------------------------------------------
export function isLearnableNewsEventV318(event = {}) {
  if (event?.directionKnown === false) return false;
  if (num(event?.direction) === 0) return false;
  return true;
}

// Richtung nachtraeglich aus der beobachteten abnormalen Reaktion ableiten.
// Nur fuer Klassen mit hoher Materialitaet sinnvoll: dort IST die Bewegung
// das Ereignis, und die Klasse laesst sich trotzdem lernen.
export function inferDirectionFromReactionV318(event = {}, horizon = '30m', threshold = 0.6) {
  const r = event?.results?.[horizon];
  const abn = num(r?.abnormalPct, NaN);
  if (!Number.isFinite(abn) || Math.abs(abn) < threshold) return null;
  return { direction: abn > 0 ? 1 : -1, basis: `INFERRED_${horizon}`, abnormalPct: +abn.toFixed(3) };
}

// ---------------------------------------------------------------------------
// Diagnose: wie viel verliert die Kette aktuell?
// ---------------------------------------------------------------------------
export function newsPipelineDiagnosticsV318(events = []) {
  const rows = Array.isArray(events) ? events : [];
  const total = rows.length;
  const directionless = rows.filter(e => num(e?.direction) === 0).length;
  const byType = {};
  for (const e of rows) {
    const t = String(e?.type || 'UNKNOWN');
    const x = byType[t] || (byType[t] = { type: t, samples: 0, directionless: 0 });
    x.samples++;
    if (num(e?.direction) === 0) x.directionless++;
  }
  const warnings = [];
  const share = total ? directionless / total : 0;
  if (share > 0.25)
    warnings.push(`${(share * 100).toFixed(0)}% der News-Ereignisse haben Richtung 0 und werden als Fehlschlag gezaehlt statt ausgeschlossen.`);
  for (const x of Object.values(byType)) {
    if (x.samples >= 10 && x.directionless / x.samples > 0.8)
      warnings.push(`Klasse ${x.type}: ${x.directionless}/${x.samples} ohne Richtung - die Statistik dieser Klasse ist wertlos.`);
  }
  return { totalEvents: total, directionlessEvents: directionless,
    directionlessShare: +share.toFixed(3), byType: Object.values(byType), warnings };
}
