/* TRADES · Aktien-Chart mit Kauf & Verkauf + Trade-Liste
   Neu gegenüber v1:
   - Rechts neben dem Chart eine Liste aller Trades: Aktie / EK / VK / Ergebnis.
   - Verkaufte Aktien bleiben sichtbar, auch wenn sie nicht mehr im Depot sind.
   - EK und VK werden aus der History rekonstruiert (Stückzahl aus zero_fee_details),
     geprüft gegen statistics.realizedPnl.
   - Klick auf eine Zeile öffnet den Chart der Aktie.
   - Die Infokacheln unter dem Chart zeigen bei geschlossenen Trades EK/VK/Ergebnis
     statt vier Striche.
*/

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const fmt = (v, d = 2) => Number(v || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const price = v => fmt(v, Math.abs(Number(v) || 0) < 10 ? 3 : 2);
const shortTs = s => {
  const t = Date.parse(String(s || ''));
  return Number.isFinite(t) ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
};

let state = null, selected = null, range = '1d', chartData = null, loading = false, trades = [], ledgerFilter = 'all';

const BUY_ACTIONS = ['KAUF', 'BUY'];
const SELL_ACTIONS = ['VERKAUF', 'SELL'];
const isBuy = h => BUY_ACTIONS.includes(String(h?.action || '').toUpperCase());
const isSell = h => SELL_ACTIONS.includes(String(h?.action || '').toUpperCase());

/* ---------- Trades aus der History rekonstruieren ---------- */

// Stückzahl steckt nur in zero_fee_details. Ohne sie bleibt der Stückpreis leer,
// die Beträge und das Ergebnis stimmen trotzdem.
function quantityOf(h) {
  const z = h?.zero_fee_details;
  if (!z) return 0;
  const q = num(z.wholeQuantity, 0) + num(z.fractionalQuantity, 0);
  return q > 0 ? q : 0;
}

// KAUF: amount = Ordervolumen + Gebühr (Cash-Abfluss)
// VERKAUF: amount = Ordervolumen brutto, Gebühr separat
// trade_pnl = Erlös − Verkaufsgebühr − Ordervolumen(Kauf), also ohne Kaufgebühr.
function buildTrades(s) {
  const events = (s?.history || []).filter(h => (isBuy(h) || isSell(h)) && String(h.symbol || '').trim());
  events.sort((a, b) => (Date.parse(a.ts) - Date.parse(b.ts)) || num(a.id) - num(b.id));

  const openLegs = new Map();
  const out = [];

  for (const h of events) {
    const symbol = String(h.symbol).toUpperCase();
    if (isBuy(h)) {
      const fee = num(h.fee), invested = Math.abs(num(h.amount)) - fee, qty = quantityOf(h);
      if (!openLegs.has(symbol)) openLegs.set(symbol, []);
      openLegs.get(symbol).push({
        ts: h.ts, name: h.name || symbol, invested, fee, qty,
        unit: qty > 0 ? invested / qty : null, reason: String(h.reason || '')
      });
      continue;
    }
    const legs = openLegs.get(symbol) || [];
    const buy = legs.length ? legs.shift() : null;
    const fee = num(h.fee), proceeds = num(h.amount), qty = num(buy?.qty, 0);
    const pnl = h.trade_pnl == null ? null : num(h.trade_pnl);
    out.push({
      symbol, name: h.name || buy?.name || symbol, closed: true, qty, buy,
      sell: { ts: h.ts, proceeds, fee, unit: qty > 0 ? proceeds / qty : null, reason: String(h.reason || '') },
      pnl,
      pnlPct: pnl != null && num(buy?.invested) > 0 ? pnl / buy.invested * 100 : null,
      netPnl: pnl != null ? pnl - num(buy?.fee) : null,
      sortTs: Date.parse(h.ts) || 0
    });
  }

  // Noch offene Käufe mit dem aktuellen Depotwert weiterführen
  for (const p of s?.positions || []) {
    const symbol = String(p.symbol || '').toUpperCase();
    const legs = openLegs.get(symbol);
    if (!legs?.length) continue;
    const factor = (num(p.last_price) / Math.max(1e-9, num(p.entry_price))) * (num(p.last_fx, 1) / Math.max(1e-9, num(p.entry_fx, 1)));
    for (const buy of legs) {
      const value = num(buy.invested) * (Number.isFinite(factor) && factor > 0 ? factor : 1);
      // wie statistics.unrealizedPnl: Kaufgebühr ist hier bereits abgezogen
      const pnl = value - num(buy.invested) - num(buy.fee);
      out.push({
        symbol, name: p.name || buy.name || symbol, closed: false, qty: buy.qty, buy, sell: null,
        pnl,
        pnlPct: num(buy.invested) > 0 ? pnl / buy.invested * 100 : null,
        netPnl: null, currentValue: value,
        sortTs: Date.parse(buy.ts) || 0
      });
    }
    openLegs.delete(symbol);
  }

  out.sort((a, b) => b.sortTs - a.sortTs);
  return out;
}

/* ---------- Aufbau ---------- */

function forceVisible(card) {
  if (!card) return card;
  card.style.setProperty('display', 'block', 'important');
  card.style.setProperty('grid-column', '1 / -1', 'important');
  card.style.setProperty('order', '11', 'important');
  card.style.setProperty('width', '100%', 'important');
  card.style.setProperty('max-width', '1180px', 'important');
  card.style.setProperty('justify-self', 'start', 'important');
  return card;
}

function installCompactStyle() {
  if (document.getElementById('compact-trade-chart-style')) return;
  const s = document.createElement('style');
  s.id = 'compact-trade-chart-style';
  s.textContent = `
 #positionTradeChart.positionTradeChart{display:block!important;order:11!important;grid-column:1/-1!important;width:100%!important;max-width:1180px!important;justify-self:start!important;padding:14px!important;min-height:0!important}
 #positionTradeChart .cardTitle{margin-bottom:8px!important}
 #positionTradeChart .cardTitle h2{font-size:17px!important}
 #positionTradeChart .tradeChartSymbols{display:flex!important;flex-wrap:wrap!important;gap:6px!important;margin:0 0 8px!important}
 #positionTradeChart .tradeSymbol{border:1px solid #29445d!important;background:#0c1b29!important;color:#dbe9f5!important;border-radius:9px!important;padding:6px 9px!important;min-height:34px!important;cursor:pointer!important}
 #positionTradeChart .tradeSymbol b{font-size:12px!important}#positionTradeChart .tradeSymbol span{display:block!important;margin-top:1px!important;font-size:9px!important;color:#849ab0!important}
 #positionTradeChart .tradeSymbol.active{border-color:#3d7ca2!important;background:#10283a!important}
 #positionTradeChart .tradeSymbol.sold span{color:#c58aa0!important}

 #positionTradeChart .tradeChartGrid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(290px,340px)!important;gap:12px!important;align-items:start!important}
 #positionTradeChart .tradeChartMain{min-width:0!important}

 #positionTradeChart .tradeChartToolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin:0 0 7px!important}
 #positionTradeChart .tradeChartRanges{display:flex!important;gap:5px!important}#positionTradeChart .tradeChartRanges button{border:1px solid #29445d!important;background:#0b1824!important;color:#9fb5c9!important;border-radius:8px!important;padding:5px 8px!important;font-size:10px!important;cursor:pointer!important}#positionTradeChart .tradeChartRanges button.active{color:#e8f5ff!important;border-color:#3d7ca2!important;background:#10283a!important}
 #positionTradeChart .tradeChartLegend{display:flex!important;gap:10px!important;font-size:10px!important;color:#9eb2c4!important}#positionTradeChart .tradeChartLegend span{display:flex!important;align-items:center!important;gap:4px!important}#positionTradeChart .tradeChartLegend i{display:inline-block!important;width:8px!important;height:8px!important;border-radius:50%!important}#positionTradeChart .tradeChartLegend .buyDot{background:#46d69a!important}#positionTradeChart .tradeChartLegend .sellDot{background:#ff7080!important}
 #positionTradeChart .tradeCanvasWrap{position:relative!important;width:100%!important;height:230px!important;min-height:230px!important;max-height:230px!important;overflow:hidden!important;border:1px solid rgba(74,108,137,.28)!important;border-radius:10px!important;background:#081521!important}
 #positionTradeChart #tradeChartCanvas{display:block!important;width:100%!important;height:230px!important;min-height:230px!important;max-height:230px!important}
 #positionTradeChart .tradeChartEmpty{position:absolute!important;inset:0!important;display:grid!important;place-items:center!important;padding:16px!important;color:#8196aa!important;font-size:12px!important;text-align:center!important}#positionTradeChart .tradeChartEmpty[hidden]{display:none!important}
 #positionTradeChart .tradeChartInfo{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin-top:8px!important}#positionTradeChart .tradeChartInfo>div{padding:7px 9px!important;border:1px solid rgba(67,94,118,.28)!important;border-radius:9px!important;background:#0a1824!important}#positionTradeChart .tradeChartInfo span{display:block!important;font-size:9px!important;color:#8499ad!important}#positionTradeChart .tradeChartInfo b{display:block!important;margin-top:2px!important;font-size:12px!important}

 #positionTradeChart .tradeLedger{border:1px solid rgba(74,108,137,.28)!important;border-radius:10px!important;background:#0a1824!important;padding:9px!important;min-width:0!important}
 #positionTradeChart .tradeLedgerHead{display:flex!important;align-items:baseline!important;justify-content:space-between!important;gap:8px!important;margin-bottom:7px!important}
 #positionTradeChart .tradeLedgerHead h3{margin:0!important;font-size:12px!important;color:#dbe9f5!important;font-weight:700!important}
 #positionTradeChart .tradeLedgerHead b{font-size:12px!important}
 #positionTradeChart .tradeLedgerTabs{display:flex!important;gap:4px!important;margin-bottom:7px!important}
 #positionTradeChart .tradeLedgerTabs button{flex:1 1 0!important;border:1px solid #29445d!important;background:#0b1824!important;color:#9fb5c9!important;border-radius:7px!important;padding:4px 5px!important;font-size:9px!important;cursor:pointer!important;min-height:26px!important}
 #positionTradeChart .tradeLedgerTabs button.active{color:#e8f5ff!important;border-color:#3d7ca2!important;background:#10283a!important}
 #positionTradeChart .tradeLedgerScroll{max-height:262px!important;overflow-y:auto!important;overflow-x:hidden!important;margin:0 -3px!important;padding:0 3px!important}
 #positionTradeChart table.tradeLedgerTable{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important}
 #positionTradeChart table.tradeLedgerTable th{position:sticky!important;top:0!important;z-index:2!important;background:#0a1824!important;text-align:right!important;font-size:8.5px!important;letter-spacing:.05em!important;text-transform:uppercase!important;color:#7d92a7!important;font-weight:600!important;padding:0 3px 4px!important;border-bottom:1px solid rgba(74,108,137,.3)!important}
 #positionTradeChart table.tradeLedgerTable th:first-child{text-align:left!important}
 #positionTradeChart table.tradeLedgerTable td{padding:5px 3px!important;border-bottom:1px solid rgba(74,108,137,.16)!important;font-size:10.5px!important;color:#dbe9f5!important;text-align:right!important;vertical-align:top!important}
 #positionTradeChart table.tradeLedgerTable td:first-child{text-align:left!important;overflow:hidden!important;text-overflow:ellipsis!important}
 #positionTradeChart table.tradeLedgerTable tr.tradeRow{cursor:pointer!important}
 #positionTradeChart table.tradeLedgerTable tr.tradeRow:hover td{background:#10283a!important}
 #positionTradeChart table.tradeLedgerTable tr.tradeRow.active td{background:#122c40!important}
 #positionTradeChart .ledgerSym{display:block!important;font-weight:700!important;font-size:10.5px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
 #positionTradeChart .ledgerName{display:block!important;font-size:8.5px!important;color:#8499ad!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
 #positionTradeChart .ledgerSub{display:block!important;font-size:8.5px!important;color:#8499ad!important;margin-top:1px!important;white-space:nowrap!important}
 #positionTradeChart .ledgerOpen{color:#7fb2d8!important}
 #positionTradeChart .ledgerEmpty{padding:14px 4px!important;text-align:center!important;color:#8196aa!important;font-size:11px!important}
 #positionTradeChart .ledgerFoot{margin-top:7px!important;padding-top:6px!important;border-top:1px solid rgba(74,108,137,.28)!important;font-size:9px!important;color:#7d92a7!important;line-height:1.45!important}
 #positionTradeChart .good{color:#46d69a!important}#positionTradeChart .bad{color:#ff7080!important}

 @media(max-width:1080px){#positionTradeChart .tradeChartGrid{grid-template-columns:1fr!important}#positionTradeChart .tradeLedgerScroll{max-height:320px!important}}
 @media(max-width:900px){#positionTradeChart.positionTradeChart{max-width:none!important}#positionTradeChart .tradeCanvasWrap,#positionTradeChart #tradeChartCanvas{height:200px!important;min-height:200px!important;max-height:200px!important}}
 @media(max-width:520px){#positionTradeChart.positionTradeChart{padding:10px!important}#positionTradeChart .tradeChartToolbar{align-items:flex-start!important;flex-direction:column!important}#positionTradeChart .tradeCanvasWrap,#positionTradeChart #tradeChartCanvas{height:180px!important;min-height:180px!important;max-height:180px!important}#positionTradeChart .tradeChartInfo{grid-template-columns:1fr 1fr!important}#positionTradeChart .tradeChartLegend{font-size:9px!important}#positionTradeChart table.tradeLedgerTable td{font-size:10px!important}}
 `;
  document.head.appendChild(s);
}

function ensure() {
  let card = $('positionTradeChart');
  if (card) return forceVisible(card);
  const pos = $('positions');
  if (!pos) return null;
  card = document.createElement('section');
  card.id = 'positionTradeChart';
  card.className = 'card positionTradeChart';
  card.innerHTML = `<div class="cardTitle"><div><span class="sectionEyebrow">TRADES</span><h2>Aktien-Chart mit Kauf &amp; Verkauf</h2><div id="tradeChartSubtitle" class="muted">Kauf- und Verkaufspunkte im Kursverlauf, daneben jeder Trade mit EK, VK und Ergebnis</div></div><span id="tradeChartPill" class="tag">–</span></div>
<div id="tradeChartSymbols" class="tradeChartSymbols"></div>
<div class="tradeChartGrid">
 <div class="tradeChartMain">
  <div class="tradeChartToolbar"><div class="tradeChartRanges"><button type="button" data-range="1d" class="active">1 Tag</button><button type="button" data-range="5d">5 Tage</button><button type="button" data-range="1mo">1 Monat</button></div><div class="tradeChartLegend"><span><i class="buyDot"></i>Kauf</span><span><i class="sellDot"></i>Verkauf</span></div></div>
  <div class="tradeCanvasWrap"><canvas id="tradeChartCanvas"></canvas><div id="tradeChartEmpty" class="tradeChartEmpty">Noch keine gehandelte Aktie.</div></div>
  <div id="tradeChartInfo" class="tradeChartInfo"></div>
 </div>
 <aside class="tradeLedger" aria-labelledby="tradeLedgerTitle">
  <div class="tradeLedgerHead"><h3 id="tradeLedgerTitle">Trades</h3><b id="tradeLedgerSum">–</b></div>
  <div class="tradeLedgerTabs" role="group" aria-label="Trades filtern"><button type="button" data-filter="all" class="active">Alle</button><button type="button" data-filter="closed">Verkauft</button><button type="button" data-filter="open">Offen</button></div>
  <div class="tradeLedgerScroll"><div id="tradeLedgerBody"></div></div>
  <div class="ledgerFoot" id="tradeLedgerFoot"></div>
 </aside>
</div>`;
  pos.insertAdjacentElement('afterend', card);
  forceVisible(card);
  card.querySelectorAll('[data-range]').forEach(b => b.onclick = () => {
    range = b.dataset.range;
    card.querySelectorAll('[data-range]').forEach(x => x.classList.toggle('active', x === b));
    loadChart(true);
  });
  card.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => {
    ledgerFilter = b.dataset.filter;
    card.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderLedger();
  });
  return card;
}

/* ---------- Symbolleiste ---------- */

function symbolsFromStatus(s) {
  const m = new Map();
  for (const p of s?.positions || []) {
    const sym = String(p.symbol || '').toUpperCase();
    if (sym) m.set(sym, { symbol: sym, name: p.name || sym, open: true });
  }
  for (const h of s?.history || []) {
    if (!isBuy(h) && !isSell(h)) continue;
    const sym = String(h.symbol || '').toUpperCase();
    if (!sym) continue;
    const old = m.get(sym) || { symbol: sym, name: h.name || sym, open: false };
    if (!old.name || old.name === sym) old.name = h.name || sym;
    m.set(sym, old);
  }
  return [...m.values()].slice(0, 14);
}

function renderSymbols() {
  const el = $('tradeChartSymbols');
  if (!el || !state) return;
  const rows = symbolsFromStatus(state);
  if (!rows.length) {
    el.innerHTML = '';
    selected = null;
    showEmpty('Noch keine gehandelte Aktie. Sobald die KI kauft, erscheint hier automatisch der Kurs mit Einstieg.');
    return;
  }
  if (!selected || !rows.some(x => x.symbol === selected)) selected = (rows.find(x => x.open) || rows[0]).symbol;
  el.innerHTML = rows.map(x => `<button type="button" class="tradeSymbol ${x.symbol === selected ? 'active' : ''} ${x.open ? '' : 'sold'}" data-symbol="${esc(x.symbol)}"><b>${esc(x.symbol)}</b><span>${x.open ? 'OFFEN' : 'VERKAUFT'}</span></button>`).join('');
  el.querySelectorAll('[data-symbol]').forEach(b => b.onclick = () => selectSymbol(b.dataset.symbol));
}

function selectSymbol(symbol) {
  if (!symbol || symbol === selected) return;
  selected = symbol;
  renderSymbols();
  renderLedger();
  loadChart(true);
}

/* ---------- Trade-Liste ---------- */

function signed(v, d = 2) { return `${num(v) >= 0 ? '+' : '−'}${fmt(Math.abs(num(v)), d)}`; }
function cls(v) { return num(v) >= 0 ? 'good' : 'bad'; }

function ledgerRow(t) {
  const ekUnit = t.buy?.unit;
  const vkUnit = t.sell?.unit;
  const result = t.pnl == null
    ? '<b>–</b>'
    : `<b class="${cls(t.pnl)}">${signed(t.pnl)} €</b>${t.pnlPct == null ? '' : `<span class="ledgerSub ${cls(t.pnl)}">${signed(t.pnlPct)} %</span>`}`;
  return `<tr class="tradeRow ${t.symbol === selected ? 'active' : ''}" data-symbol="${esc(t.symbol)}" tabindex="0">
<td><span class="ledgerSym">${esc(t.symbol)}</span><span class="ledgerName">${esc(t.name)}</span></td>
<td>${ekUnit == null ? '–' : price(ekUnit)}<span class="ledgerSub">${fmt(num(t.buy?.invested))} €</span><span class="ledgerSub">${shortTs(t.buy?.ts)}</span></td>
<td>${t.closed ? (vkUnit == null ? '–' : price(vkUnit)) : '<span class="ledgerOpen">offen</span>'}<span class="ledgerSub">${t.closed ? `${fmt(num(t.sell?.proceeds))} €` : `${fmt(num(t.currentValue))} € akt.`}</span><span class="ledgerSub">${t.closed ? shortTs(t.sell?.ts) : '–'}</span></td>
<td>${result}</td></tr>`;
}

function renderLedger() {
  const body = $('tradeLedgerBody'), sumEl = $('tradeLedgerSum'), foot = $('tradeLedgerFoot');
  if (!body) return;
  const rows = trades.filter(t => ledgerFilter === 'all' || (ledgerFilter === 'closed' ? t.closed : !t.closed));

  const closed = trades.filter(t => t.closed && t.pnl != null);
  const realized = closed.reduce((a, t) => a + num(t.pnl), 0);
  const wins = closed.filter(t => num(t.pnl) > 0).length;
  if (sumEl) {
    sumEl.textContent = closed.length ? `${signed(realized)} €` : '–';
    sumEl.className = closed.length ? cls(realized) : '';
  }

  if (!rows.length) {
    body.innerHTML = `<div class="ledgerEmpty">${trades.length ? 'Keine Trades in dieser Ansicht.' : 'Noch kein Kauf ausgeführt.'}</div>`;
  } else {
    body.innerHTML = `<table class="tradeLedgerTable"><thead><tr><th>Aktie</th><th>EK</th><th>VK</th><th>Ergebnis</th></tr></thead><tbody>${rows.map(ledgerRow).join('')}</tbody></table>`;
    body.querySelectorAll('[data-symbol]').forEach(tr => {
      tr.onclick = () => selectSymbol(tr.dataset.symbol);
      tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSymbol(tr.dataset.symbol); } };
    });
  }

  if (foot) {
    const netto = closed.reduce((a, t) => a + num(t.netPnl, num(t.pnl)), 0);
    foot.innerHTML = closed.length
      ? `${closed.length} verkauft · ${wins} im Plus · Trefferquote ${fmt(wins / closed.length * 100, 0)} %<br>Bei verkauften Trades ist die Kaufgebühr nicht abgezogen (so rechnet auch die KPI-Kachel); mit beiden Gebühren wären es <b class="${cls(netto)}">${signed(netto)} €</b>.<br>Kurse je Stück in ${esc(state?.config?.currency || 'EUR')}, aus Ordervolumen und Stückzahl gerechnet.`
      : 'Sobald eine Position verkauft wird, erscheint sie hier mit EK, VK und Ergebnis.';
  }
}

/* ---------- Chart ---------- */

function showEmpty(text) {
  const e = $('tradeChartEmpty'), c = $('tradeChartCanvas');
  if (e) { e.textContent = text; e.hidden = false; }
  if (c) c.style.visibility = 'hidden';
  if ($('tradeChartInfo')) $('tradeChartInfo').innerHTML = '';
}
function showCanvas() {
  const e = $('tradeChartEmpty'), c = $('tradeChartCanvas');
  if (e) e.hidden = true;
  if (c) c.style.visibility = 'visible';
}
function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(300, Math.round(rect.width || 700)), h = Math.max(175, Math.round(rect.height || 230));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const x = canvas.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { x, w, h };
}
function nearestBar(bars, ts) {
  let best = null, dist = Infinity;
  for (const b of bars) { const d = Math.abs(Number(b.ts) - Number(ts)); if (d < dist) { dist = d; best = b; } }
  return best;
}

function lastTradeFor(symbol) {
  return trades.find(t => t.symbol === symbol) || null;
}

function draw() {
  const canvas = $('tradeChartCanvas');
  if (!canvas || !chartData?.bars?.length) return showEmpty('Keine Kursdaten für diesen Zeitraum verfügbar.');
  showCanvas();
  const { x, w, h } = setupCanvas(canvas), bars = chartData.bars;
  const prices = bars.map(b => num(b.close)).filter(v => v > 0);
  if (!prices.length) return showEmpty('Keine Kursdaten verfügbar.');

  const padL = 58, padR = 18, padT = 25, padB = 32, plotW = w - padL - padR, plotH = h - padT - padB;
  const min0 = Math.min(...prices), max0 = Math.max(...prices), span = Math.max(max0 - min0, max0 * .004);
  const min = min0 - span * .12, max = max0 + span * .12;
  const t0 = Number(bars[0].ts), t1 = Number(bars.at(-1).ts) || t0 + 1;
  const px = t => padL + (Number(t) - t0) / Math.max(1, t1 - t0) * plotW;
  const py = p => padT + (max - Number(p)) / Math.max(.000001, max - min) * plotH;

  x.clearRect(0, 0, w, h);
  x.font = '11px system-ui, sans-serif';
  x.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + i * plotH / 4, v = max - i * (max - min) / 4;
    x.strokeStyle = 'rgba(122,171,255,.12)';
    x.beginPath(); x.moveTo(padL, y); x.lineTo(w - padR, y); x.stroke();
    x.fillStyle = '#8fa3bd'; x.textAlign = 'right';
    x.fillText(fmt(v, v < 10 ? 3 : 2), padL - 8, y + 4);
  }

  x.strokeStyle = '#78d6ff'; x.lineWidth = 2; x.beginPath();
  bars.forEach((b, i) => { const xx = px(b.ts), yy = py(b.close); i ? x.lineTo(xx, yy) : x.moveTo(xx, yy); });
  x.stroke();

  const entry = num(chartData?.position?.entryPrice, 0);
  if (entry > 0) {
    const y = py(entry);
    x.setLineDash([5, 5]); x.strokeStyle = 'rgba(70,214,154,.42)';
    x.beginPath(); x.moveTo(padL, y); x.lineTo(w - padR, y); x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#46d69a'; x.textAlign = 'left';
    x.fillText(`Einstieg ${fmt(entry, entry < 10 ? 3 : 2)}`, padL + 7, Math.max(14, y - 6));
  }

  for (const e of chartData.events || []) {
    const ts = Date.parse(e.ts), b = nearestBar(bars, ts), p = num(e.price, b?.close);
    if (!b || !(p > 0)) continue;
    const xx = px(b.ts), yy = py(p), buy = BUY_ACTIONS.includes(String(e.action).toUpperCase());
    x.fillStyle = buy ? '#46d69a' : '#ff7080';
    x.strokeStyle = '#07101b'; x.lineWidth = 2; x.beginPath();
    if (buy) { x.moveTo(xx, yy - 11); x.lineTo(xx - 7, yy + 3); x.lineTo(xx + 7, yy + 3); }
    else { x.moveTo(xx, yy + 11); x.lineTo(xx - 7, yy - 3); x.lineTo(xx + 7, yy - 3); }
    x.closePath(); x.fill(); x.stroke();
    x.fillStyle = buy ? '#79e7b5' : '#ff9aa6';
    x.font = '700 10px system-ui, sans-serif';
    x.textAlign = xx > w * .72 ? 'right' : 'left';
    x.fillText(buy ? 'KAUF' : 'VERKAUF', xx + (xx > w * .72 ? -10 : 10), buy ? yy - 7 : yy + 14);
  }

  x.fillStyle = '#8fa3bd'; x.font = '10px system-ui, sans-serif'; x.textAlign = 'left';
  x.fillText(new Date(t0).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), padL, h - 9);
  x.textAlign = 'right';
  x.fillText(new Date(t1).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), w - padR, h - 9);

  const last = prices.at(-1), first = prices[0], change = first ? (last / first - 1) * 100 : 0;
  const p = chartData.position || {};
  if ($('tradeChartPill')) {
    $('tradeChartPill').textContent = `${change >= 0 ? '+' : ''}${fmt(change)} % · ${range === '1d' ? '1T' : range === '5d' ? '5T' : '1M'}`;
    $('tradeChartPill').className = `tag ${change >= 0 ? 'good' : 'bad'}`;
  }
  if ($('tradeChartSubtitle')) $('tradeChartSubtitle').textContent = `${chartData.name || chartData.symbol} · ${chartData.symbol}${p.open ? '' : ' · nicht mehr im Depot'}`;

  const info = $('tradeChartInfo');
  if (!info) return;
  const t = lastTradeFor(chartData.symbol);

  if (p.open) {
    const pnl = p.entryPrice > 0 && last > 0 ? (last / p.entryPrice - 1) * 100 : null;
    info.innerHTML = `<div><span>Letzter Kurs</span><b>${price(last)}</b></div>
<div><span>Einstieg</span><b>${p.entryPrice ? price(p.entryPrice) : '–'}</b></div>
<div><span>Seit Einstieg</span><b class="${pnl == null ? '' : cls(pnl)}">${pnl == null ? '–' : `${signed(pnl)} %`}</b></div>
<div><span>Kauf/Verkauf-Punkte</span><b>${(chartData.events || []).length}</b></div>`;
    return;
  }

  // Geschlossen: EK, VK und Ergebnis des letzten Round Trips statt vier Striche
  info.innerHTML = `<div><span>Einkauf ${t?.buy?.ts ? esc(shortTs(t.buy.ts)) : ''}</span><b>${t?.buy?.unit == null ? '–' : `${price(t.buy.unit)} €`}</b></div>
<div><span>Verkauf ${t?.sell?.ts ? esc(shortTs(t.sell.ts)) : ''}</span><b>${t?.sell?.unit == null ? '–' : `${price(t.sell.unit)} €`}</b></div>
<div><span>Ergebnis</span><b class="${t?.pnl == null ? '' : cls(t.pnl)}">${t?.pnl == null ? '–' : `${signed(t.pnl)} € · ${t.pnlPct == null ? '' : `${signed(t.pnlPct)} %`}`}</b></div>
<div><span>Letzter Kurs</span><b>${price(last)}</b></div>`;
}

async function loadChart(force = false) {
  if (!selected || loading) return;
  loading = true;
  try {
    const r = await fetch(`/api/position-chart?symbol=${encodeURIComponent(selected)}&range=${encodeURIComponent(range)}${force ? `&t=${Date.now()}` : ''}`, { cache: 'no-store' });
    if (!r.ok) { let e = {}; try { e = await r.json(); } catch {} throw new Error(e.error || `HTTP ${r.status}`); }
    chartData = await r.json();
    draw();
  } catch (e) {
    showEmpty(`Chart konnte nicht geladen werden: ${e.message}`);
  } finally {
    loading = false;
  }
}

function applyStatus(s) {
  state = s;
  trades = buildTrades(s);
  renderSymbols();
  renderLedger();
}

async function refresh() {
  const card = forceVisible(ensure());
  if (!card || document.hidden) return;
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    if (!r.ok) return;
    applyStatus(await r.json());
    if (selected) await loadChart(false);
  } catch {}
}

function install() {
  installCompactStyle();
  forceVisible(ensure());
  // app.js v3 verteilt den Status per Event – dann sparen wir uns den eigenen Fetch.
  document.addEventListener('planspiel:status', e => {
    if (!e?.detail) return;
    applyStatus(e.detail);
    if (selected && !chartData) loadChart(false);
  });
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('resize', () => { if (chartData) draw(); });
}

install();
