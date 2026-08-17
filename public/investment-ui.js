const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v,2)}%`;
const dt=s=>s?new Date(s).toLocaleString('de-DE'):'–';

function cap(v){
 const n=Number(v||0);if(!n)return'–';
 if(n>=1e12)return`${fmt(n/1e12,2)} Bio. $`;
 if(n>=1e9)return`${fmt(n/1e9,1)} Mrd. $`;
 return`${fmt(n/1e6,0)} Mio. $`;
}
function regimeClass(v){return v==='RISK_ON'?'regimeRiskOn':v==='RISK_OFF'?'regimeRiskOff':'regimeNeutral'}
function list(items,empty='–'){return items?.length?`<ul class="dossierList">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<span class="muted">${esc(empty)}</span>`}
function modelText(d){const l=d.learning||{};if(!l.usable||l.expected3dPct==null)return'kein belastbarer Lernwert';return `${pct(l.expected3dPct)} · statistisch, keine Wahrscheinlichkeit`}
function riskClass(v){return v==='HOCH'?'bad':v==='NIEDRIGER'?'good':'yellow'}

function dossierCard(d){
 const t=d.technical||{},live=d.live||{},co=d.company||{};
 return `<article class="dossierCard">
  <div class="dossierHead"><div><div class="eyebrow">${esc(d.type==='ETF'?'ETF':'AKTIE')} · ${esc(co.size||'')}</div><h3>${esc(d.symbol)} · ${esc(d.name||'')}</h3><span class="dossierBadge">${esc(d.rating||'BEOBACHTEN')}</span></div><div><div class="dossierScore">${fmt(d.qualityScore,0)}</div><div class="muted">/100 Signalqualität</div></div></div>
  <div class="dossierMetrics">
   <div class="dossierMetric"><span>Unabhängige Säulen</span><b>${fmt(d.pillarCount,0)} · ${esc((d.pillars||[]).join(', ')||'keine')}</b></div>
   <div class="dossierMetric"><span>Risiko</span><b class="${riskClass(d.riskLevel)}">${esc(d.riskLevel||'–')}</b></div>
   <div class="dossierMetric"><span>Überhitzt?</span><b class="${d.overheated?'bad':'good'}">${d.overheated?'JA':'NEIN'}</b></div>
   <div class="dossierMetric"><span>RSI 14</span><b>${t.rsi==null?'–':fmt(t.rsi,1)}</b></div>
   <div class="dossierMetric"><span>Momentum 20T</span><b class="${Number(t.mom20Pct)>=0?'good':'bad'}">${t.mom20Pct==null?'–':pct(t.mom20Pct)}</b></div>
   <div class="dossierMetric"><span>Historisches 3T-Modell</span><b>${esc(modelText(d))}</b></div>
   <div class="dossierMetric"><span>Live-Score</span><b>${fmt(live.score,2)} · ${Math.round(Number(live.confidence||0)*100)}%</b></div>
   <div class="dossierMetric"><span>News</span><b class="${Number(live.newsScore)>0?'good':Number(live.newsScore)<0?'bad':''}">${fmt(live.newsScore,2)} · ${Math.round(Number(live.newsConfidence||0)*100)}%</b></div>
   <div class="dossierMetric"><span>Größe</span><b>${cap(co.marketCapUSD)}</b></div>
  </div>
  <div class="dossierBlock"><b>Warum aktuell interessant?</b>${list(d.positives,'Noch keine ausreichend starken positiven Faktoren.')}</div>
  <div class="dossierBlock"><b>Aktueller Katalysator / Auslöser</b><div>${esc(d.catalyst||'Kein klarer Katalysator erkannt.')}</div>${d.newsSources?.length?`<div class="muted">News-Quellen: ${esc(d.newsSources.join(' + '))}</div>`:''}</div>
  <div class="dossierBlock"><b>Was spricht dagegen?</b>${list(d.negatives,'Kein starkes Gegenargument erkannt – trotzdem bleibt Marktrisiko.')}</div>
  <div class="dossierBlock"><b>These ungültig / neu prüfen wenn</b>${list(d.invalidation)}</div>
  <div class="muted">Regime ${esc(d.marketRegime||'–')} · Volatilität ${t.volatilityAnnualizedPct==null?'–':`${fmt(t.volatilityAnnualizedPct,0)}% p.a.`} · 20T-Hoch-Abstand ${t.distanceHigh20Pct==null?'–':pct(t.distanceHigh20Pct)} · Börse ${esc(co.exchange||'–')} ${esc(co.region||'')}</div>
 </article>`;
}

async function loadIntelligence(){
 if(document.hidden)return;
 const grid=$('dossierGrid'),pill=$('regimePill'),meta=$('intelligenceMeta');if(!grid||!pill||!meta)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json();
  const regime=s.marketRegime||{},model=s.intelligenceModel||{},rows=s.investmentDossiers||[];
  pill.textContent=`Marktregime ${regime.label||'–'}`;pill.className=`tag ${regimeClass(regime.label)}`;
  const components=(regime.components||[]).slice(0,4).join(' · '),modelPart=model.available?`Kausalmodell ${model.version||''} · ${fmt(model.sampleCount,0)} Beispiele`:'Kausalmodell noch nicht verfügbar';
  meta.textContent=`Stand ${dt(s.intelligenceUpdatedAt)} · ${components||'Marktregime wird noch aufgebaut'} · ${modelPart}. ${s.analysisNotice||''}`;
  grid.innerHTML=rows.length?rows.map(dossierCard).join(''):'<div class="analysisStatus"><b>Noch keine Anlage-Dossiers.</b><br>Sie werden nach einem vollständigen Markt-Scan aufgebaut. Bei geschlossenen Märkten bleibt der News-Radar aktiv.</div>';
 }catch(e){grid.innerHTML=`<div class="analysisStatus"><b>Anlage-Analyse derzeit nicht verfügbar.</b><br>${esc(e.message)}</div>`}
}

loadIntelligence();
setInterval(loadIntelligence,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadIntelligence()});
