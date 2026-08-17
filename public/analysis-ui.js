import './investment-ui.js';
import './news-learning-ui.js';
import './macro-ui.js';

const byId=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const eur=v=>`${fmt(v)} €`;
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v)}%`;
const date=v=>v?new Date(`${v}T12:00:00Z`).toLocaleDateString('de-DE'):'–';
let cache=null;

function assetType(t){return t==='ETF'?'ETF':'Aktie'}
function kpi(label,value,cls=''){return `<div class="mini ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`}
function statusBox(title,text){return `<section class="card"><div class="cardTitle"><h2>${esc(title)}</h2><span class="tag">wird geladen</span></div><div class="analysisStatus">${esc(text)}</div></section>`}

function tradeRows(trades){
  if(!trades?.length)return '<tr><td colspan="7">Keine abgeschlossenen Trades in dieser Auswertung.</td></tr>';
  return trades.map((t,i)=>`<tr>
    <td>${i+1}</td>
    <td><b>${esc(t.symbol)}</b><br><span class="muted">${esc(t.name||'')} · ${assetType(t.type)}</span></td>
    <td>${date(t.buyAt)}</td>
    <td>${date(t.sellAt)}</td>
    <td>${eur((Number(t.buyFee)||0)+(Number(t.sellFee)||0))}</td>
    <td class="${Number(t.pnl)>=0?'good':'bad'}">${Number(t.pnl)>=0?'+':''}${eur(t.pnl)}<br><span class="muted">${pct(t.returnPct)}</span></td>
    <td>${eur(t.capitalAfter)}</td>
  </tr>`).join('');
}

function resultCard(title,badge,r,noteExtra=''){
  const good=Number(r.profit)>=0;
  return `<section class="card compareResult">
    <div class="cardTitle"><h2>${esc(title)}</h2><span class="tag">${esc(badge)}</span></div>
    <div class="compareKpis">
      ${kpi('Start',eur(r.startCapital))}
      ${kpi('Endkapital',eur(r.endCapital),good?'good':'bad')}
      ${kpi('Gewinn',`${good?'+':''}${eur(r.profit)}`,good?'good':'bad')}
      ${kpi('Rendite',pct(r.returnPct),good?'good':'bad')}
      ${kpi('Trades',String(r.trades?.length||0))}
    </div>
    <div class="trendSummary">${esc(r.note||'')} ${esc(noteExtra)}</div>
    <div class="tableWrap weekActions"><table><thead><tr><th>#</th><th>Wert</th><th>Kauf</th><th>Verkauf</th><th>Gebühren</th><th>Trade P/L</th><th>Kapital/Erlös</th></tr></thead><tbody>${tradeRows(r.trades)}</tbody></table></div>
  </section>`;
}

function actionRows(actions){
  if(!actions?.length)return '<tr><td colspan="7">Die KI hätte in dieser Rekonstruktion keine Order ausgeführt.</td></tr>';
  return actions.map((a,i)=>`<tr>
    <td>${i+1}</td>
    <td>${date(a.date)}</td>
    <td class="${a.action==='BUY'?'good':'yellow'}"><b>${a.action==='BUY'?'KAUF':'VERKAUF'}</b></td>
    <td><b>${esc(a.symbol)}</b><br><span class="muted">${esc(a.name||'')} · ${assetType(a.type)}</span></td>
    <td>${a.score==null?'–':fmt(a.score,2)}</td>
    <td>${a.confidence==null?'–':`${Math.round(Number(a.confidence)*100)}%`}</td>
    <td>${esc(a.reason||'')}</td>
  </tr>`).join('');
}

function timelineCard(walk){
  return `<section class="card analysisTimeline">
    <div class="cardTitle"><h2>KI-Trading-Timeline 2026</h2><span class="tag">chronologisch · alle simulierten Orders</span></div>
    <div class="notice">Hier siehst du konkret, <b>wann</b> die damalige KI-Rekonstruktion gekauft oder verkauft hätte. Die Entscheidung verwendet beim kausalen Walk-Forward nur bereits abgeschlossene vorherige Marktdaten; keine spätere 2026-Information wird rückwirkend benutzt.</div>
    <div class="tableWrap historyWrap"><table><thead><tr><th>#</th><th>Datum</th><th>Aktion</th><th>Wert</th><th>Score</th><th>Konf.</th><th>Warum?</th></tr></thead><tbody>${actionRows(walk.actions)}</tbody></table></div>
  </section>`;
}

function render(data){
  cache=data;
  const style=byId('analysisStyle')?.value||byId('riskMode')?.value||'offensiv';
  const walk=data.walkForward?.[style]||data.walkForward?.offensiv;
  const perfect=data.perfect;
  const causal=Boolean(data.walkForwardCalibration?.causalExecution);
  const dq=Number(data.dataQuality?.excludedCount||0);

  byId('analysisMeta').innerHTML=`Zeitraum <b>${date(data.period?.from)} – ${date(data.period?.to)}</b> · ${Number(data.usableSymbols||0)} nutzbare Werte · ${Number(data.universe?.equities||0)} Aktien + ${Number(data.universe?.etfs||0)} normale ETFs · ${dq} fehlerhafte Kursserien ausgeschlossen · Datenstand ${data.generatedAt?new Date(data.generatedAt).toLocaleString('de-DE'):'–'}`;

  if(perfect)byId('perfectResult').innerHTML=resultCard('Perfekter Rückblick','vollständiges Zukunftswissen',perfect,'Theoretische Obergrenze im verwendeten Tagesdaten-Modell – nicht realistisch vorhersagbar.');
  else byId('perfectResult').innerHTML=statusBox('Perfekter Rückblick','Die perfekte Rückschau wird gerade erstellt.');

  if(walk&&causal){
    byId('walkResult').innerHTML=resultCard('KI hätte damals gehandelt',`kausaler Walk-Forward · ${style}`,walk,'Jede Order wird erst nach einem bereits abgeschlossenen Signal-Tag ausgeführt.');
    byId('walkTimeline').innerHTML=timelineCard(walk);
  }else{
    byId('walkResult').innerHTML=statusBox('KI hätte damals täglich gehandelt','Die kausale 2026-KI-Auswertung wird gerade neu berechnet. Sie wird hier als vollständige Gegenüberstellung erscheinen – nicht nur der perfekte Rückblick.');
    byId('walkTimeline').innerHTML='<section class="card analysisTimeline"><div class="cardTitle"><h2>KI-Trading-Timeline 2026</h2><span class="tag">Berechnung läuft</span></div><div class="analysisStatus">Käufe, Verkäufe, Datum und Begründung werden nach Abschluss der historischen Walk-Forward-Berechnung hier angezeigt.</div></section>';
  }

  if(perfect&&walk&&causal){
    const gap=Number(perfect.endCapital)-Number(walk.endCapital),share=Number(perfect.endCapital)>0?Number(walk.endCapital)/Number(perfect.endCapital)*100:0;
    byId('analysisCompare').innerHTML=`<b>Direkter Vergleich:</b> Perfekt ${eur(perfect.endCapital)} vs. damalige KI ${eur(walk.endCapital)} · Abstand ${eur(gap)} · KI erreicht ${fmt(share,4)}% der theoretischen Zukunftswissen-Obergrenze.`;
  }else byId('analysisCompare').innerHTML='<b>Direkter Vergleich:</b> Die KI-Seite wird gerade aktualisiert. Beide Seiten bleiben sichtbar.';
}

async function loadAnalysis(force=false){
  const btn=byId('analysisRunBtn');
  if(btn){btn.disabled=true;btn.textContent='2026-Daten werden geladen …'}
  if(byId('analysisError'))byId('analysisError').textContent='';
  try{
    const r=await fetch(`/analysis-2026.json${force?`?t=${Date.now()}`:''}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`2026-Auswertung noch nicht verfügbar (HTTP ${r.status}).`);
    const j=await r.json();
    render(j);
  }catch(e){
    if(byId('analysisError'))byId('analysisError').textContent=String(e?.message||e);
    if(!cache){
      byId('perfectResult').innerHTML=statusBox('Perfekter Rückblick','Historische Ergebnisdatei wird geladen.');
      byId('walkResult').innerHTML=statusBox('KI hätte damals täglich gehandelt','Historische Walk-Forward-Ergebnisdatei wird geladen. Beide Ansichten bleiben getrennt sichtbar.');
    }
  }finally{
    if(btn){btn.disabled=false;btn.textContent='2026-Auswertung neu laden'}
  }
}

function install(){
  const style=byId('analysisStyle');
  if(style)style.value=byId('riskMode')?.value||'offensiv';
  if(style)style.onchange=()=>cache&&render(cache);
  if(byId('analysisRunBtn'))byId('analysisRunBtn').onclick=()=>loadAnalysis(true);
  byId('weekTabBtn')?.addEventListener('click',()=>loadAnalysis(false));
}

function updateSignalsVisibility(){
  const section=byId('signals'),body=byId('candidatesBody');
  if(!section||!body)return;
  const hasRealSignal=[...body.querySelectorAll('tr')].some(row=>!row.querySelector('td[colspan]'));
  section.hidden=!hasRealSignal;
  const nav=document.querySelector('.mobileNav a[href="#signals"]');
  if(nav)nav.hidden=!hasRealSignal;
}

function installSignalsVisibility(){
  const body=byId('candidatesBody');
  if(!body)return;
  updateSignalsVisibility();
  new MutationObserver(updateSignalsVisibility).observe(body,{childList:true,subtree:true});
}

install();
installSignalsVisibility();