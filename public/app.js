/* KI-Markt-Planspiel · Dashboard-Client v3
   Änderungen ggü. v2:
   - Kandidaten-Tabelle wird direkt in der richtigen Spaltenreihenfolge gerendert
     (kein MutationObserver-Umsortieren mehr, kein Aufblitzen falscher Spalten).
   - Fallback-Kandidaten (Depot / News-Watch / Ideen) sind hier integriert,
     candidate-fallback-ui.js wird nicht mehr gebraucht.
   - Poll-Intervall steht als Konstante im Quelltext (kein Server-Regex-Patch mehr),
     pausiert in Hintergrund-Tabs, hat Overlap-Schutz und Fehler-Backoff.
   - Canvas-Charts sind DPR-scharf und passen sich der echten CSS-Größe an.
   - Statuszeile zeigt echten Zustand statt fester "60 SEK."-Angabe.
   - Andere Module bekommen den Status per Event 'planspiel:status' statt eigenem Fetch.
*/

const POLL_MS = 60_000;          // Cloudflare-Cron läuft alle 5 Min. – 60 s reichen dicke
const POLL_MAX_MS = 300_000;     // Obergrenze nach wiederholten Fehlern
const STALE_SCAN_MS = 20 * 60_000;

const $ = id => document.getElementById(id);
const arr = v => Array.isArray(v) ? v : [];
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let currency = 'EUR';
let formInitialized = false;
let lastStatus = null;

const fmt = (v, d = 2) => Number(v || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = v => `${fmt(v)} ${currency === 'EUR' ? '€' : '$'}`;
const pct = v => `${Number(v) >= 0 ? '+' : ''}${fmt(v, 2)} %`;
const dt = s => s ? new Date(s).toLocaleString('de-DE') : '–';
const timeOnly = s => s ? new Date(s).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';

function since(ts) {
  const t = Date.parse(String(ts || ''));
  if (!Number.isFinite(t)) return '–';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  return h < 24 ? `vor ${h} Std.` : `vor ${Math.floor(h / 24)} Tg.`;
}

function setText(id, value, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = value;
  if (cls !== undefined) el.className = cls;
}
function setHtml(id, markup) {
  const el = $(id);
  if (el) el.innerHTML = markup;
}

async function api(path, opts = {}) {
  const init = { ...opts };
  if (typeof AbortSignal?.timeout === 'function') init.signal = AbortSignal.timeout(25_000);
  const r = await fetch(path, init);
  let j = {};
  try { j = await r.json(); } catch { /* leere/kaputte Antwort */ }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/* ---------- Canvas: scharf auf Retina, folgt der echten CSS-Größe ---------- */

function fitCanvas(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || canvas.clientWidth || 300));
  const h = Math.max(1, Math.round(rect.height || canvas.clientHeight || 180));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function drawChart(rows, startCapital) {
  const c = fitCanvas($('chart'));
  if (!c) return;
  const { ctx, w, h } = c;
  const values = arr(rows).map(r => num(r.equity)).filter(Number.isFinite);
  if (!values.length) {
    ctx.fillStyle = '#7890a6';
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.fillText('Noch keine Depot-Scans.', 16, 30);
    return;
  }

  const base = num(startCapital, values[0]);
  const lo0 = Math.min(...values, base), hi0 = Math.max(...values, base);
  const pad = Math.max(0.5, (hi0 - lo0) * 0.18);
  const lo = lo0 - pad, hi = hi0 + pad;
  const left = 8, right = w - 8, top = 18, bottom = h - 16;
  const yOf = v => bottom - (v - lo) / Math.max(1e-9, hi - lo) * (bottom - top);
  const xOf = i => left + (values.length === 1 ? (right - left) / 2 : i / (values.length - 1) * (right - left));

  ctx.strokeStyle = 'rgba(40,67,94,.55)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = top + i * (bottom - top) / 4;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }

  // Startkapital als Nulllinie – man sieht sofort Gewinn oder Verlust
  const baseY = yOf(base);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(143,165,186,.55)';
  ctx.beginPath(); ctx.moveTo(left, baseY); ctx.lineTo(right, baseY); ctx.stroke();
  ctx.setLineDash([]);

  const last = values.at(-1);
  const up = last >= base;
  const line = up ? '#4bd38c' : '#ff6f78';
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, up ? 'rgba(75,211,140,.30)' : 'rgba(255,111,120,.26)');
  grad.addColorStop(1, 'rgba(75,211,140,0)');

  const pts = values.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.lineTo(pts.at(-1).x, bottom); ctx.lineTo(pts[0].x, bottom); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.strokeStyle = line; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

  const end = pts.at(-1);
  ctx.beginPath(); ctx.arc(end.x, end.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = line; ctx.fill();

  ctx.fillStyle = '#8fa5ba';
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText(`${fmt(hi0, 0)} – ${fmt(lo0, 0)} ${currency}`, left + 2, 12);
  ctx.fillStyle = '#7890a6';
  ctx.fillText(`Start ${fmt(base, 0)}`, left + 2, Math.min(bottom - 2, baseY - 4));
}

const pieColor = i => `hsl(${(i * 137.5 + 205) % 360} 68% 62%)`;

function drawAllocation(positions, cash) {
  const c = fitCanvas($('allocationChart'));
  const legend = $('allocationLegend');
  if (!c) return;
  const { ctx, w, h } = c;

  const items = arr(positions).map(p => ({
    name: String(p.symbol || ''),
    value: num(p.invested) * (num(p.last_price) / Math.max(1e-6, num(p.entry_price))) * (num(p.last_fx, 1) / Math.max(1e-6, num(p.entry_fx, 1)))
  })).filter(q => q.value > 0);
  if (num(cash) > 0) items.push({ name: 'CASH', value: num(cash) });

  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) {
    if (legend) legend.innerHTML = '<div class="muted">Noch keine Kapitalverteilung.</div>';
    return;
  }

  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.44, inner = r * 0.62;
  let a = -Math.PI / 2;
  items.forEach((it, i) => {
    const e = a + it.value / total * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, e); ctx.closePath();
    ctx.fillStyle = pieColor(i); ctx.fill();
    a = e;
  });
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.textAlign = 'center';
  ctx.fillStyle = '#edf6ff';
  ctx.font = '700 19px Inter, system-ui, sans-serif';
  ctx.fillText(`${fmt(100 - num(cash) / total * 100, 0)} %`, cx, cy + 1);
  ctx.fillStyle = '#7990a6';
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText('investiert', cx, cy + 16);
  ctx.textAlign = 'start';

  if (legend) legend.innerHTML = items.map((it, i) =>
    `<div class="legendItem"><span class="legendDot" style="background:${pieColor(i)}"></span><span>${esc(it.name)} · ${fmt(it.value / total * 100, 1)} %</span><b>${money(it.value)}</b></div>`
  ).join('');
}

/* ---------- Textbausteine ---------- */

const COMPANY_INFO = {
  SAP: 'SAP entwickelt Unternehmenssoftware für Finanzen, Personal, Einkauf, Lieferketten und Cloud.',
  CRM: 'Salesforce verkauft Cloud-Software für Vertrieb, Kundenservice, Marketing und Datenanalyse.',
  ADBE: 'Adobe entwickelt Kreativsoftware wie Photoshop sowie PDF-, Dokument- und Marketingsoftware.',
  INTU: 'Intuit bietet Finanz-, Buchhaltungs- und Steuersoftware wie QuickBooks und TurboTax.',
  NOW: 'ServiceNow liefert Cloud-Software zur Automatisierung von IT- und Geschäftsabläufen.',
  NVDA: 'Nvidia entwickelt KI- und Grafikchips sowie Rechenzentrumsplattformen.',
  AMD: 'AMD entwickelt Prozessoren, Grafikchips und Chips für Rechenzentren und KI.',
  AVGO: 'Broadcom entwickelt Halbleiter und Infrastruktur-Software für Netzwerke und Rechenzentren.',
  MU: 'Micron produziert Speicherchips für PCs, Smartphones, Rechenzentren und KI-Systeme.',
  ASML: 'ASML baut Lithografie-Maschinen für die Herstellung moderner Computerchips.',
  ARM: 'Arm entwickelt Prozessor-Architekturen für Smartphones, Rechenzentren und viele Chips.',
  MSFT: 'Microsoft verkauft Windows, Office, Azure-Cloud, Unternehmenssoftware und KI-Dienste.',
  AMZN: 'Amazon betreibt Onlinehandel und mit AWS einen der größten Cloud-Anbieter der Welt.',
  GOOGL: 'Alphabet betreibt Google, YouTube, Werbung, Cloud-Dienste und KI-Produkte.',
  GOOG: 'Alphabet betreibt Google, YouTube, Werbung, Cloud-Dienste und KI-Produkte.',
  META: 'Meta betreibt Facebook, Instagram und WhatsApp und verdient vor allem mit digitaler Werbung.',
  PLTR: 'Palantir entwickelt Daten- und KI-Software für Unternehmen, Behörden und Verteidigung.',
  TSLA: 'Tesla baut Elektroautos, Batteriespeicher und Energieprodukte.',
  LMT: 'Lockheed Martin baut Kampfjets, Raketen, Raumfahrt- und Verteidigungssysteme.',
  NOC: 'Northrop Grumman entwickelt Militärflugzeuge, Raumfahrt-, Raketen- und Verteidigungssysteme.',
  ESLT: 'Elbit Systems entwickelt Militär-Elektronik, Drohnen, Sensoren und Verteidigungssysteme.',
  RTX: 'RTX produziert Triebwerke, Flugzeugsysteme sowie Raketen- und Luftverteidigungstechnik.',
  GD: 'General Dynamics baut Militärfahrzeuge, U-Boote, Geschäftsjets und Verteidigungssysteme.',
  LHX: 'L3Harris entwickelt Kommunikations-, Sensor-, Weltraum- und Verteidigungstechnik.',
  RHM: 'Rheinmetall produziert Munition, Militärfahrzeuge, Luftverteidigung und Rüstungstechnik.',
  GE: 'GE Aerospace baut und wartet Flugzeugtriebwerke für zivile und militärische Luftfahrt.',
  HWM: 'Howmet Aerospace produziert Spezialteile und Materialien für Flugzeuge und Triebwerke.',
  AXON: 'Axon entwickelt Körperkameras, Taser und digitale Sicherheitssoftware für Behörden.',
  PSN: 'Parsons entwickelt Technik, Software und Infrastruktur für Verteidigung und Behörden.',
  SAAB: 'Saab entwickelt Kampfflugzeuge, Radar-, Sensor- und Verteidigungssysteme.',
  SMR: 'NuScale Power entwickelt kleine modulare Kernreaktoren (SMR).',
  OKLO: 'Oklo entwickelt kleine moderne Kernreaktoren für energieintensive Kunden.',
  GEV: 'GE Vernova baut Energie- und Stromnetztechnik, Gasturbinen, Windkraft und Netzausrüstung.',
  ETN: 'Eaton produziert elektrische Systeme für Stromnetze, Industrie und Rechenzentren.',
  VRT: 'Vertiv liefert Stromversorgung und Kühlung für Rechenzentren.',
  PANW: 'Palo Alto Networks verkauft Cybersicherheitssoftware für Netzwerke, Cloud und Unternehmen.',
  CRWD: 'CrowdStrike bietet cloudbasierte Cybersicherheit für Computer und Unternehmensnetze.',
  FTNT: 'Fortinet verkauft Netzwerk- und Cybersicherheitslösungen.',
  JPM: 'JPMorgan Chase ist eine große US-Bank für Privatkunden, Unternehmen und Investmentbanking.',
  BAC: 'Bank of America ist eine große US-Bank für Privat- und Firmenkunden.',
  GS: 'Goldman Sachs ist vor allem im Investmentbanking, Handel und Vermögensmanagement tätig.',
  DBK: 'Deutsche Bank bietet Privat-, Firmen- und Investmentbanking.',
  CBK: 'Commerzbank betreut Privatkunden sowie kleine und große Unternehmen.',
  XOM: 'Exxon Mobil fördert und verarbeitet Öl und Gas und verkauft Energie- und Chemieprodukte.',
  CVX: 'Chevron ist ein großer Öl- und Gaskonzern mit Förderung, Raffinerien und Energiegeschäft.',
  COP: 'ConocoPhillips ist vor allem in der weltweiten Öl- und Gasförderung tätig.',
  NEM: 'Newmont ist einer der größten Goldproduzenten der Welt.',
  '9618': 'JD.com betreibt einen großen chinesischen Onlinehandel mit eigener Logistik.',
  '3690': 'Meituan betreibt Plattformen für Essenslieferung, lokale Dienste und Reisebuchung.',
  '079550': 'LIG Nex1 entwickelt Lenkflugkörper, Radar-, Sensor- und Kommunikationssysteme.',
  '012450': 'Hanwha Aerospace produziert Triebwerke, Artillerie- und Raumfahrttechnik.'
};

const THEME_INFO = {
  DEFENSE: 'Entwickelt oder produziert Technik für Verteidigung, Luftfahrt oder Sicherheit.',
  DEFENSE_TECH: 'Entwickelt elektronische Systeme, Sensorik oder andere Verteidigungstechnik.',
  RUSSIA_SANCTIONS_DEFENSE: 'Ist im Verteidigungs- oder Luftfahrtbereich tätig.',
  SEMI_EXPORT_CONTROLS: 'Gehört zur Halbleiter- und Chipindustrie.',
  TECH_SEMI: 'Gehört zur Halbleiter- und Chipindustrie.',
  TECH_COMMERCE: 'Betreibt digitalen Handel oder Onlineplattformen.',
  AI_POWER_GRID: 'Profitiert vom Ausbau von Rechenzentren und Stromnetzen oder hängt davon ab.',
  NUCLEAR_URANIUM: 'Ist im Bereich Kernenergie oder Uran tätig.',
  CYBER_SECURITY: 'Bietet IT- oder Cybersicherheitslösungen an.',
  CRITICAL_MINERALS: 'Ist im Rohstoff- oder Bergbausektor tätig.',
  SHIPPING_DISRUPTION: 'Ist in Schifffahrt, Tankern oder Logistik tätig.',
  GOLD_GEOPOLITICAL: 'Ist im Gold- oder Edelmetallbereich tätig.',
  RATES_MACRO: 'Reagiert stark auf Zinsen, Konjunktur und allgemeine Marktstimmung.'
};

const THEME_MOVE = {
  DEFENSE: 'Defense-/Aerospace-Sektor im Fokus',
  DEFENSE_TECH: 'Defense-/Aerospace-Sektor im Fokus',
  RUSSIA_SANCTIONS_DEFENSE: 'Geopolitik und Defense-Sektor im Fokus',
  AI_POWER_GRID: 'KI-Rechenzentren und Stromnetzausbau im Fokus',
  CYBER_SECURITY: 'Cybersecurity-Sektor im Fokus',
  SEMI_EXPORT_CONTROLS: 'Chipsektor und Exportregeln im Fokus',
  TECH_SEMI: 'Chipsektor im Fokus',
  NUCLEAR_URANIUM: 'Kernenergie-/Uran-Thema im Fokus',
  RATES_MACRO: 'Zinsen und Konjunktur bewegen den Wert'
};

const baseSymbol = v => String(v || '').toUpperCase().split('.')[0];

function sectorText(x) {
  const raw = [x?.sector, x?.industry, x?.category, x?.business_sector].filter(Boolean).join(' ').toLowerCase();
  if (!raw) return '';
  if (/defen|aerospace|military|weapon|armament/.test(raw)) return 'Entwickelt oder produziert Systeme und Komponenten für Luftfahrt, Verteidigung oder Sicherheit.';
  if (/semiconductor|chip|microelectronic/.test(raw)) return 'Entwickelt oder produziert Halbleiter, Chips oder elektronische Komponenten.';
  if (/software|cloud|information technology|it services/.test(raw)) return 'Entwickelt Software oder digitale Plattformen für Unternehmen und Verbraucher.';
  if (/bank|financial|insurance|capital market/.test(raw)) return 'Bietet Finanzdienstleistungen wie Banking, Finanzierung oder Versicherungen an.';
  if (/energy|oil|gas|petroleum/.test(raw)) return 'Ist im Energiegeschäft tätig – Förderung, Verarbeitung oder Energieinfrastruktur.';
  if (/mining|metal|gold|uranium|mineral/.test(raw)) return 'Fördert oder verarbeitet Rohstoffe und Metalle.';
  if (/retail|e-commerce|internet retail/.test(raw)) return 'Betreibt Handel bzw. Onlinehandel und verkauft Waren oder Dienstleistungen.';
  if (/health|medical|pharma|biotech/.test(raw)) return 'Entwickelt oder vertreibt Produkte für Medizin, Pharma oder Biotechnologie.';
  if (/industrial|machinery|engineering/.test(raw)) return 'Produziert Industrieanlagen, Maschinen oder technische Komponenten.';
  return '';
}

function companySummary(x) {
  const direct = String(x?.business_summary || x?.businessSummary || x?.longBusinessSummary || x?.description || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:is|ist) (?:a |ein )?(?:publicly traded|börsennotiertes?) (?:company|unternehmen)[^.]*\.?/gi, '')
    .trim();
  if (direct) return direct.slice(0, 220);

  const b = baseSymbol(x?.symbol);
  if (COMPANY_INFO[b]) return COMPANY_INFO[b];
  // Nordische Gattungen wie SAAB-B.ST / VOLV-B.ST auf das Basiskürzel zurückführen
  const noClass = b.replace(/-[A-Z]$/, '');
  if (noClass !== b && COMPANY_INFO[noClass]) return COMPANY_INFO[noClass];

  const sector = sectorText(x);
  if (sector) return sector;

  const theme = THEME_INFO[String(x?.theme || '').toUpperCase()];
  if (theme) return theme;

  const name = String(x?.name || '').toLowerCase();
  if (/aerospace|defen|military|systems/.test(name)) return 'Entwickelt technische Systeme für Luftfahrt, Verteidigung oder Sicherheit.';
  if (/semiconductor|microelectronics|chip/.test(name)) return 'Entwickelt oder produziert Halbleiter und elektronische Komponenten.';
  if (/software|digital|technolog/.test(name)) return 'Entwickelt Software oder digitale Produkte.';
  if (/energy|power|solar|wind/.test(name)) return 'Ist im Energiegeschäft tätig.';
  if (/bank|financial|capital|insurance/.test(name)) return 'Bietet Finanz-, Bank- oder Versicherungsdienstleistungen an.';
  if (/mining|minerals|gold|uranium|resources/.test(name)) return 'Fördert oder verarbeitet Rohstoffe.';
  return 'Geschäftsfeld noch nicht eindeutig zugeordnet – wird mit den nächsten Stammdaten ergänzt.';
}

function newsFor(x, s) {
  const b = baseSymbol(x?.symbol);
  return arr(s?.newsRadar).find(n => baseSymbol(n.symbol) === b) || null;
}
function futureFor(x, s) {
  const b = baseSymbol(x?.symbol);
  return arr(s?.futureWatch?.candidates).find(n => baseSymbol(n.symbol) === b) || null;
}

function candidateInfluence(x, s) {
  const n = newsFor(x, s);
  if (n?.headline) {
    const mood = n.tendency === 'BULLISH' ? 'Positiv' : n.tendency === 'BEARISH' ? 'Negativ' : 'Neutral';
    return `${mood}: ${String(n.headline).slice(0, 190)}`;
  }
  const headline = arr(x?.headlines)[0];
  if (headline) return `Aktuelle Meldung: ${String(headline).slice(0, 190)}`;

  const f = futureFor(x, s);
  if (f?.catalyst || f?.reason) return `${f.theme || 'Weltthema'}: ${String(f.catalyst || f.reason).slice(0, 170)}`;
  if (x?.event_text) return `Termin/Ereignis: ${String(x.event_text).slice(0, 180)}`;

  const theme = THEME_MOVE[String(x?.theme || '').toUpperCase()];
  if (x?.kind === 'IM DEPOT') return theme ? `${theme} · Position wird weiter geprüft.` : 'Im Depot · Kurs und News werden laufend geprüft.';
  if (x?.kind === 'NEWS-WATCH') return theme ? `${theme} · Kauf wartet auf Kursbestätigung.` : 'Weltthema auffällig · Kauf wartet auf Kursbestätigung.';
  if (num(x?.news_score) > 0.12) return 'Nachrichtenlage eher positiv, aber keine einzelne dominante Meldung.';
  if (num(x?.news_score) < -0.12) return 'Nachrichtenlage eher negativ, aber keine einzelne dominante Meldung.';
  if (theme) return `${theme} · aktuell keine neue starke Firmenmeldung.`;
  return 'Keine starke neue Firmenmeldung. Bewegung kommt eher aus Branche und Gesamtmarkt.';
}

function rating(x) {
  if (x?.kind === 'IM DEPOT') return ['Im Depot', 'hold'];
  const sc = num(x?.score, -99);
  if (sc >= 5) return ['Sehr interessant', 'strong'];
  if (sc >= 3.5) return ['Interessant', 'good'];
  if (sc >= 2) return ['Beobachten', 'watch'];
  return ['Schwach', 'watch'];
}
function riskInfo(x) {
  const e = String(x?.event_risk || 'NONE').toUpperCase();
  if (e === 'HIGH') return ['Event hoch', 'high'];
  if (e === 'MEDIUM') return ['Event mittel', 'mid'];
  return ['Normal', ''];
}
const typeName = t => String(t || 'EQUITY').toUpperCase() === 'ETF' ? 'ETF' : 'Aktie';
const trendClass = v => v === 'BULLISH' ? 'bullish' : v === 'BEARISH' ? 'bearish' : 'neutral';
const actionClass = a => a === 'KAUF' ? 'good' : a === 'VERKAUF' ? 'yellow' : a === 'FEHLER' ? 'bad' : '';

function sourceList(v) {
  try { return JSON.parse(v || '[]').join(' + ') || '–'; }
  catch { return Array.isArray(v) ? v.join(' + ') : String(v || '–'); }
}
function historyTime(h) {
  if (h.action === 'HALTEN') {
    const s = num(h.start_scan), e = num(h.end_scan);
    const scan = s > 0 ? (e > s ? `Scan ${s}–${e}` : `Scan ${s}`) : 'HALTEN';
    return `${scan}<br><span class="muted">${dt(h.ts)} → ${dt(h.end_ts || h.ts)}</span>`;
  }
  return dt(h.ts);
}
function ageText(n) {
  if (n.waiting_for_open) return 'wartet auf Öffnung';
  const h = num(n.trading_age_hours, NaN);
  if (!Number.isFinite(h)) return '–';
  return h < 1 ? `${Math.round(h * 60)} Handelsmin.` : `${fmt(h, 1)} Handelsstd.`;
}
const miniCard = (label, value, cls = '') => `<div class="mini ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

/* ---------- Kandidaten: eine Renderfunktion, richtige Spaltenreihenfolge ---------- */

function fallbackCandidates(s) {
  const map = new Map();
  for (const p of arr(s.positions)) {
    const k = baseSymbol(p.symbol);
    if (!k) continue;
    map.set(k, { ...p, kind: 'IM DEPOT', priority: 100 + num(p.invested) / 1000, confidence: num(p.signal_confidence || p.confidence), score: num(p.score) });
  }
  for (const f of arr(s.futureWatch?.candidates)) {
    const k = baseSymbol(f.symbol);
    if (!k || map.has(k)) continue;
    map.set(k, { ...f, kind: 'NEWS-WATCH', priority: 75 + num(f.watchScore) / 10, confidence: num(f.confidence || f.signal_confidence), score: num(f.score, num(f.watchScore) / 15) });
  }
  for (const l of arr(s.aiLog)) {
    if (String(l.kind || '').toUpperCase() !== 'IDEA' || !l.symbol) continue;
    const k = baseSymbol(l.symbol);
    if (!k || map.has(k)) continue;
    const scoreMatch = String(l.message || '').match(/Score\s+(-?\d+(?:[.,]\d+)?)/i);
    const confMatch = String(l.message || '').match(/Konfidenz\s+(\d+)%/i);
    const sc = scoreMatch ? Number(scoreMatch[1].replace(',', '.')) : 0;
    const cf = num(l.confidence, confMatch ? Number(confMatch[1]) / 100 : 0);
    map.set(k, { symbol: l.symbol, name: l.name || '', kind: 'BEOBACHTEN', priority: 60 + sc + cf * 10, confidence: cf, score: sc });
  }
  return [...map.values()].sort((a, b) => num(b.priority) - num(a.priority)).slice(0, 8);
}

function candidateRow(x, s, isFallback) {
  const [label, cls] = rating(x);
  const [riskLabel, riskCls] = riskInfo(x);
  const conf = num(x.confidence);
  const day = Number(x.day_change);
  const state = x.kind ? `<span class="candidateState ${esc(String(x.kind).toLowerCase().replace(/\s+/g, '-'))}">${esc(x.kind)}</span>` : '';
  const score = Number.isFinite(Number(x.score)) ? `<span class="candidateScore">Score ${fmt(x.score, 2)}</span>` : '';
  const dayCls = Number.isFinite(day) ? (day >= 0 ? 'good' : 'bad') : '';

  return `<tr${isFallback ? ' class="fallbackCandidate"' : ''}>
    <td class="candidateIdentity"><b class="candidateName">${esc(x.name || x.symbol)}</b><span class="candidateSymbol">${esc(x.symbol)}</span>${state}</td>
    <td><span class="fallbackRating ${cls}">${esc(label)}</span>${score}</td>
    <td class="${dayCls}"><b>${Number.isFinite(day) ? `${day >= 0 ? '+' : ''}${fmt(day, 2)} %` : '–'}</b></td>
    <td><b>${conf > 0 ? `${Math.round(conf * 100)} %` : '–'}</b></td>
    <td><span class="eventPill ${riskCls}">${esc(riskLabel)}</span></td>
    <td class="plainCell">${esc(companySummary(x))}</td>
    <td class="plainCell influenceCell">${esc(candidateInfluence(x, s))}</td>
  </tr>`;
}

function renderCandidates(s) {
  const body = $('candidatesBody');
  if (!body) return;
  const help = document.querySelector('.candidateHelp');
  const tag = document.querySelector('#signals .cardTitle .tag');

  const live = arr(s.candidates);
  if (live.length) {
    body.innerHTML = live.map(x => candidateRow(x, s, false)).join('');
    if (tag) tag.textContent = 'Live-Kandidaten';
    if (help) help.innerHTML = '<b>Aktuelle Scanner-Kandidaten.</b> Bewertung, Tagesbewegung, Sicherheit und Risiko stehen zuerst; Firma und Auslöser werden rechts erklärt.';
    return;
  }

  const rows = fallbackCandidates(s);
  if (rows.length) {
    body.innerHTML = rows.map(x => candidateRow(x, s, true)).join('');
    if (tag) tag.textContent = 'Depot + Watchlist';
    if (help) help.innerHTML = '<b>Gerade kein neuer BUY durch alle Filter.</b> Deshalb siehst du Depot und Watchlist. Neue echte Kaufkandidaten ersetzen diese Liste automatisch.';
    return;
  }

  body.innerHTML = `<tr><td colspan="7"><div class="candidateFallbackEmpty"><b>Gerade kein Kaufkandidat.</b><span>Der Scanner läuft weiter. Sobald ein Wert die Mindestqualität erreicht oder ein sauberer Rücksetzer entsteht, erscheint er hier.</span></div></td></tr>`;
  if (tag) tag.textContent = 'Scanner läuft';
}

/* ---------- restliche Panels ---------- */

function renderHeader(s, c) {
  const marketOpen = c.market_mode !== 'NEWS_ONLY';
  setText('marketHeaderStatus', marketOpen ? 'Market Open' : 'News Only', marketOpen ? 'good' : 'yellow');

  const agent = s.pcAgent || {};
  const seen = Date.parse(String(agent.lastSeenAt || agent.last_seen_at || agent.updatedAt || ''));
  const online = agent.online === true || agent.fresh === true || (Number.isFinite(seen) && Date.now() - seen < 180_000);
  setText('pcHeaderStatus', online ? 'Online' : 'Offline', online ? 'good' : 'bad');

  setText('cloudHeaderStatus', 'Synchronisiert', 'good');

  const scanTs = Date.parse(String(c.last_scan || ''));
  const stale = Number.isFinite(scanTs) && Date.now() - scanTs > STALE_SCAN_MS;
  setText('scanHeaderStatus', `${timeOnly(c.last_scan)} · ${since(c.last_scan)}`, stale ? 'yellow' : '');
}

function renderPositionCards(ps) {
  const el = $('positionCards');
  if (!el) return;
  el.innerHTML = arr(ps).map(p => {
    const invested = num(p.invested);
    const value = invested * (num(p.last_price) / Math.max(1e-6, num(p.entry_price))) * (num(p.last_fx, 1) / Math.max(1e-6, num(p.entry_fx, 1)));
    const pl = value - invested - num(p.entry_fee);
    const plPct = invested ? pl / invested * 100 : 0;
    return `<article class="positionCard ${pl < 0 ? 'loss' : ''}">
      <div class="positionHead"><div><div class="positionSymbol">${esc(p.symbol)}</div><div class="positionName">${esc(p.name || '')}</div></div><div class="positionPnl">${pl >= 0 ? '+' : ''}${fmt(plPct, 2)} %</div></div>
      <div class="positionMetrics"><span>Einsatz<b>${money(invested)}</b></span><span>Aktuell<b>${money(value)}</b></span><span>Ø Kauf<b>${fmt(p.entry_price, 2)}</b></span><span>Kurs<b>${fmt(p.last_price, 2)}</b></span></div>
    </article>`;
  }).join('') || '<div class="emptyState">Keine offene Position.</div>';
}

function renderFutureWatch(s) {
  const fw = s.futureWatch || {};
  const chips = $('futureThemeChips');
  if (chips) {
    const themes = arr(fw.activeThemes).slice(0, 7);
    chips.innerHTML = themes.length ? themes.map(t => {
      const id = String(t.id || '');
      const cls = id.includes('RATE') ? 'macro' : (id.includes('DEFENSE') || id.includes('RUSSIA')) ? 'defense' : id.includes('CYBER') ? 'risk' : '';
      return `<span class="themeChip ${cls}">${esc(t.label || t.id || 'Thema')} · ${Math.round(num(t.issueStrength))}</span>`;
    }).join('') : '<span class="themeChip">Noch kein starkes Weltthema</span>';
  }
  const list = $('futureCatalystList');
  if (!list) return;
  const candidates = arr(fw.candidates).slice(0, 6);
  list.innerHTML = candidates.length ? candidates.map(c => `<article class="catalystItem">
    <div class="catalystIcon">↗</div>
    <div><b>${esc(c.symbol)} · ${esc(c.theme || 'Katalysator')}</b><p>${esc(c.catalyst || c.reason || 'Live-Bestätigung abwarten.')}</p></div>
    <div class="catalystScore">${Math.round(num(c.watchScore))}<br><span>${esc(c.horizon || '')}</span></div>
  </article>`).join('') : '<div class="emptyState">Aktuell kein ausreichend starkes Forward-Signal. News und Termine werden weiter beobachtet.</div>';
}

function renderReplay(s) {
  const raw = s.dayReplayLearning || s.dayReplay || s.replayLearning || {};
  const report = raw.report || raw;
  const summary = report.summary || raw.summary || {};
  const mistakes = summary.mistakes || {};
  const churn = summary.churn || {};
  const metric = (key, label, desc) => `<div class="replayMetric"><span>${label}</span><b>${num(mistakes[key])}</b><small>${desc}</small></div>`;

  setHtml('replaySummary',
    metric('PEAK_ENTRY', 'Peak Entry', 'Zu nah am lokalen Hoch gekauft.') +
    metric('LATE_EXPENSIVE_ENTRY', 'Late Entry', 'Guter Einstieg wurde zu spät genutzt.') +
    metric('MISSED_SAFE_MOVE', 'Missed Safe Move', 'Erkennbares Setup wurde verpasst.') +
    `<div class="replayMetric"><span>Rotation Churn</span><b>${num(churn.rapidRoundTrips)}</b><small>${num(churn.fees) > 0 ? `${money(churn.fees)} Gebühren in schnellen Wechseln.` : 'Schnelle Rotationen werden auf Kosten geprüft.'}</small></div>`
  );

  const done = String(report.status || '').includes('COMPLETE');
  const analysed = num(summary.symbolsAnalysed, num(report.processed));
  setText('replayFocus', done
    ? `Replay abgeschlossen · ${analysed} Aktien analysiert. Die Learnings fließen konservativ in den nächsten Handelstag ein.`
    : `Replay sammelt heute Kandidaten und Trades · bisher ${analysed} ausgewertet.`);
}

function renderActivity(history) {
  const el = $('activityTimeline');
  if (!el) return;
  el.innerHTML = arr(history).slice(0, 8).map(h => {
    const a = String(h.action || '').toUpperCase();
    const sell = a === 'VERKAUF', hold = a === 'HALTEN';
    const amount = num(h.amount);
    return `<div class="activityItem">
      <span class="activityTime">${timeOnly(h.ts)}</span>
      <span class="activityDot ${sell ? 'sell' : hold ? 'hold' : ''}">${sell ? 'S' : hold ? '•' : 'B'}</span>
      <div class="activityMain"><b>${esc(a || 'EVENT')}</b><span>${esc(h.symbol || String(h.reason || '').slice(0, 48) || 'Scanner')}</span></div>
      <span class="activityValue">${amount ? `${amount > 0 ? '+' : ''}${money(amount)}` : ''}</span>
    </div>`;
  }).join('') || '<div class="emptyState">Noch keine Aktivität.</div>';
}

function render(s) {
  const c = s.config || {};
  const m = s.executionModel || {};
  const st = s.statistics || {};
  const r = s.risk || {};
  currency = c.currency || 'EUR';
  document.body.classList.add('dataReady');

  const scanTs = Date.parse(String(c.last_scan || ''));
  const stale = Number.isFinite(scanTs) && Date.now() - scanTs > STALE_SCAN_MS;
  setText('statusPill',
    !c.running ? 'GESTOPPT' : stale ? `VERZÖGERT · Scan ${since(c.last_scan)}` : `LIVE · Scan ${since(c.last_scan)}`,
    'pill ' + (!c.running ? 'off' : stale ? 'stale' : 'on'));

  renderHeader(s, c);

  setText('equity', money(s.equity));
  setText('cash', money(c.cash));
  setText('pnl', `${num(s.pnl) >= 0 ? '+' : ''}${money(s.pnl)} · ${pct(s.pnl_pct)}`, num(s.pnl) >= 0 ? 'good' : 'bad');
  setText('positionCount', String(arr(s.positions).length));
  setText('marketMode', c.market_mode === 'NEWS_ONLY' ? 'NEWS ONLY' : 'MARKT + NEWS');
  setText('dailyRisk', pct(r.dailyPct || 0), num(r.dailyPct) >= 0 ? 'good' : 'bad');

  const equity = Math.max(1e-4, num(s.equity));
  const cash = num(c.cash);
  setText('cashShare', `${fmt(cash / equity * 100, 1)} % des Depotwerts`);
  setText('investedShare', `${fmt(Math.max(0, equity - cash) / equity * 100, 1)} % investiert`);

  setText('sideStartCapital', money(c.start_capital || 0));
  setText('sideEquity', money(s.equity));
  setText('sideCash', money(c.cash));

  setText('endTime', c.ends_at ? `Ende ${dt(c.ends_at)}` : 'Live');
  setText('scanInfo', `Scans ${num(c.scan_count)} · Letzter ${dt(c.last_scan)} · Universum ${c.universe_count || '–'} · Gebühren ${money(c.total_fees)}`);
  setText('aiSummary', `KI: ${c.ai_last_summary || 'noch keine Marktentscheidung'}`);
  setText('executionInfo', `${money(m.feeFixed ?? 0)} je Kauf/Verkauf · Ausführungspuffer ${fmt(m.slippagePercent ?? 0.1, 2)} % · nur Aktien · Paper Trading.`);

  const errorBox = $('errorBox');
  if (errorBox) {
    errorBox.style.display = c.last_error ? 'block' : 'none';
    errorBox.textContent = c.last_error ? `Letzter Fehler: ${c.last_error}` : '';
  }

  if (!formInitialized) {
    if ($('startCapital')) $('startCapital').value = c.start_capital || 100;
    if ($('currency')) $('currency').value = c.currency || 'EUR';
    if ($('riskMode')) $('riskMode').value = c.risk_mode || 'offensiv';
    if ($('aiEnabled')) $('aiEnabled').checked = Boolean(c.ai_enabled);
    if ($('feeFixed')) $('feeFixed').value = num(c.fee_fixed, 0).toFixed(2);
    if ($('feePercent')) $('feePercent').value = num(c.fee_percent, 0).toFixed(2);
    formInitialized = true;
  }

  renderPositionCards(s.positions);
  setHtml('positionsBody', arr(s.positions).map(p => {
    const value = num(p.invested) * (num(p.last_price) / Math.max(1e-6, num(p.entry_price))) * (num(p.last_fx, 1) / Math.max(1e-6, num(p.entry_fx, 1)));
    const pl = value - num(p.invested) - num(p.entry_fee);
    return `<tr><td><b>${esc(p.symbol)}</b><br><span class="muted">${esc(p.name || '')}</span></td><td>${esc(typeName(p.instrument_type))}</td><td>${money(p.invested)}</td><td>${fmt(p.last_fx || 1, 5)}</td><td>${fmt(p.last_price, 3)}</td><td class="${pl >= 0 ? 'good' : 'bad'}">${pl >= 0 ? '+' : ''}${money(pl)}</td></tr>`;
  }).join('') || '<tr><td colspan="6">Keine offene Position.</td></tr>');

  renderCandidates(s);
  renderFutureWatch(s);
  renderReplay(s);
  renderActivity(s.history);

  const trend = c.news_tendency_label || 'NEUTRAL';
  setText('newsTrendPill', `${trend} · ${fmt(c.news_tendency_score || 0, 2)}`, `trend ${trendClass(trend)}`);
  setText('newsTrendSummary', c.news_tendency_summary || 'Noch keine ausreichende Nachrichtenbasis.');
  setText('newsRadarInfo', c.market_mode === 'NEWS_ONLY'
    ? 'Börsen geschlossen: News werden weiter gesammelt.'
    : 'Offene Märkte: News und aktuelle Kursreaktion werden gemeinsam bewertet.');

  setHtml('newsRadarBody', arr(s.newsRadar).map(n => `<tr>
    <td><b>${esc(n.symbol)}</b></td>
    <td><span class="trend ${trendClass(n.tendency)}">${esc(n.tendency)}</span></td>
    <td>${Math.round(num(n.confidence) * 100)} %</td>
    <td>${ageText(n)}</td>
    <td>${esc(sourceList(n.sources))}<br><span class="muted">${num(n.cluster_count)} Cluster · ${num(n.confirmation_count)} Bestätigungen</span></td>
    <td>${esc(n.headline || '')}<br><span class="muted">${dt(n.news_at)}</span></td>
  </tr>`).join('') || '<tr><td colspan="6">News-Radar sammelt Daten.</td></tr>');

  setHtml('statsGrid', [
    miniCard('Geschlossene Trades', num(st.closedTrades)),
    miniCard('Trefferquote', `${fmt(st.winRate || 0, 1)} %`),
    miniCard('Realisiert', money(st.realizedPnl || 0), num(st.realizedPnl) >= 0 ? 'good' : 'bad'),
    miniCard('Unrealisiert', money(st.unrealizedPnl || 0), num(st.unrealizedPnl) >= 0 ? 'good' : 'bad'),
    miniCard('Profit-Faktor', fmt(st.profitFactor || 0, 2)),
    miniCard('Max. Drawdown', pct(st.maxDrawdownPct || 0), 'bad'),
    miniCard('Ø Gewinn', money(st.avgWin || 0), 'good'),
    miniCard('Ø Verlust', money(st.avgLoss || 0), 'bad')
  ].join(''));

  setText('riskBox', `Verfügbares Cash ${money(r.availableCash ?? c.cash)} · Tages-P/L ${pct(r.dailyPct || 0)} · Pullback/Peak-, Kosten- und Venue-Schutz bleiben aktiv.`);

  setHtml('healthGrid', arr(s.sourceHealth).map(h => {
    const status = String(h.status).toLowerCase();
    const cls = status === 'ok' ? 'ok' : status === 'degraded' ? 'degraded' : 'down';
    return `<div class="healthItem ${cls}"><b>${esc(h.source)}</b><span>${esc(h.status)}</span><small>${h.fail_count ? `${num(h.fail_count)} Fehler · ${esc(h.last_error || '')}` : `OK · ${esc(h.latency_ms ?? '–')} ms`}</small></div>`;
  }).join('') || '<div class="muted">Noch keine Quellenmessung.</div>');

  setHtml('aiLog', arr(s.aiLog).map(x => `<article class="msg">
    <div><b>${esc(x.title)}</b>${x.symbol ? ` · ${esc(x.symbol)}` : ''}</div>
    <p>${esc(x.message)}</p>
    <small>${dt(x.ts)}${x.confidence != null ? ` · Konfidenz ${Math.round(num(x.confidence) * 100)} %` : ''}</small>
  </article>`).join('') || '<div class="muted">Noch keine KI-Notizen.</div>');

  setHtml('historyBody', arr(s.history).map(h => `<tr>
    <td>${historyTime(h)}</td>
    <td class="${actionClass(h.action)}"><b>${esc(h.action)}</b></td>
    <td>${esc(h.symbol || '–')}</td>
    <td>${h.amount ? `${h.amount > 0 ? '+' : ''}${money(h.amount)}` : '–'}</td>
    <td>${h.fee ? money(h.fee) : '–'}</td>
    <td>${money(h.cash_after)}</td>
    <td>${money(h.equity)}</td>
    <td class="${num(h.total_pnl) >= 0 ? 'good' : 'bad'}">${num(h.total_pnl) >= 0 ? '+' : ''}${money(h.total_pnl)}</td>
    <td>${esc(h.reason || '')}</td>
  </tr>`).join('') || '<tr><td colspan="9">Noch keine History.</td></tr>');

  drawChart(s.snapshots, c.start_capital);
  drawAllocation(s.positions, c.cash);

  // Andere UI-Module bedienen sich hier, statt /api/status noch einmal zu laden.
  document.dispatchEvent(new CustomEvent('planspiel:status', { detail: s }));
}

/* ---------- Polling: pausiert im Hintergrund, kein Overlap, Backoff ---------- */

let inFlight = false;
let failures = 0;
let timer = null;

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(load, ms);
}

async function load() {
  if (inFlight) return;
  if (document.hidden) { schedule(POLL_MS); return; }
  inFlight = true;
  try {
    const s = await api('/api/status?view=dashboard');
    lastStatus = s;
    failures = 0;
    render(s);
    schedule(POLL_MS);
  } catch (e) {
    failures++;
    const box = $('errorBox');
    if (box) {
      box.style.display = 'block';
      box.textContent = `Status konnte nicht geladen werden (${e.message}). Nächster Versuch automatisch.`;
    }
    schedule(Math.min(POLL_MS * 2 ** Math.min(failures, 3), POLL_MAX_MS));
  } finally {
    inFlight = false;
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
window.addEventListener('online', load);

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!lastStatus) return;
    drawChart(lastStatus.snapshots, lastStatus.config?.start_capital);
    drawAllocation(lastStatus.positions, lastStatus.config?.cash);
  }, 180);
});

/* ---------- Aktionen ---------- */

function feedback(message, isError) {
  const box = $('errorBox');
  if (!box) return;
  box.style.display = 'block';
  box.className = isError ? 'error' : 'error notice-ok';
  box.textContent = message;
}

function wire(id, label, handler, confirmText) {
  const btn = $(id);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (confirmText && !confirm(confirmText)) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = `${label} …`;
    try {
      await handler();
      window.dispatchEvent(new Event('portfolio-status-invalidate'));
      await load();
    } catch (e) {
      feedback(`${label} fehlgeschlagen: ${e.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

wire('startBtn', 'Neustart', async () => {
  const body = {
    startCapital: num($('startCapital')?.value),
    currency: $('currency')?.value,
    durationValue: num($('durationValue')?.value),
    durationUnit: $('durationUnit')?.value,
    riskMode: $('riskMode')?.value,
    includeEtfs: false,
    includeLeverage: false,
    aiEnabled: Boolean($('aiEnabled')?.checked),
    feeFixed: num($('feeFixed')?.value),
    feePercent: num($('feePercent')?.value)
  };
  await api('/api/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  formInitialized = false;
}, 'Planspiel neu starten? Das aktuelle Depot wird ersetzt.');

wire('scanBtn', 'Scan', () => api('/api/scan', { method: 'POST' }));

wire('stopBtn', 'Stop', () => api('/api/stop', { method: 'POST' }));
wire('resetBtn', 'Reset', async () => {
  await api('/api/reset', { method: 'POST' });
  formInitialized = false;
}, 'Depot, History und KI-Log wirklich löschen?');

/* ---------- Seitenleiste markiert den sichtbaren Abschnitt ---------- */

(function scrollSpy() {
  const links = [...document.querySelectorAll('.sideNav a[href^="#"]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const targets = [...byId.keys()].map(id => $(id)).filter(Boolean);
  if (!targets.length) return;

  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
    const first = targets.find(t => visible.has(t.id));
    if (!first) return;
    for (const [id, a] of byId) a.classList.toggle('active', id === first.id);
  }, { rootMargin: '-90px 0px -60% 0px', threshold: 0 });

  targets.forEach(t => observer.observe(t));
})();

load();
