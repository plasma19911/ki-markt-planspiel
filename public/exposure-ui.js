const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v,2)}%`;
const dt=v=>v?new Date(v).toLocaleString('de-DE'):'–';

function ensure(){
 if($('exposureNetwork'))return $('exposureNetwork');
 const anchor=$('macroRadar')||$('analysis');if(!anchor)return null;
 const s=document.createElement('section');s.id='exposureNetwork';s.className='card';
 s.innerHTML=`<div class="cardTitle"><h2>Unternehmens-Expositionsnetz</h2><span id="exposurePill" class="tag">Frühindikator</span></div>
 <div id="exposureMeta" class="muted">Welt-/Makroereignisse werden auf konkrete Unternehmens-Expositionen und relative Kursreaktionen abgebildet.</div>
 <div id="exposureSummary" class="miniGrid exposureSummary"></div>
 <div id="exposureCards" class="exposureCards"></div>
 <div class="notice"><b>„Noch nicht eingepreist“ ist keine Gewinnwahrscheinlichkeit.</b> Die Kennzahl sucht nach einer plausiblen Wirkungskette, bestätigter Weltlage und einer Aktie, die relativ dazu noch wenig reagiert hat. Ohne aktuelle Kurs-/Trendbestätigung darf das Signal keinen Trade allein auslösen.</div>`;
 anchor.insertAdjacentElement('afterend',s);
 const nav=document.querySelector('.mobileNav');
 if(nav&&!nav.querySelector('a[href="#exposureNetwork"]')){
  const a=document.createElement('a');a.href='#exposureNetwork';a.textContent='Exposition';
  const after=nav.querySelector('a[href="#macroRadar"]')||nav.querySelector('a[href="#analysis"]');after?.insertAdjacentElement('afterend',a)||nav.appendChild(a);
 }
 return s;
}

function stateClass(o){
 if(o.alreadyPriced)return'yellow';
 if(o.direction==='POSITIV'&&o.notPricedInScore>=62)return'good';
 if(o.direction==='NEGATIV'&&o.notPricedInScore>=62)return'bad';
 return'';
}

function opportunity(o){
 const tags=(o.exposureTags||[]).map(t=>`${esc(t.label)} ${Math.round(Number(t.confidence||0)*100)}%`).join(' · ');
 const news=o.directCompanyNews?`Direkte News: ${esc(o.directNews?.headline||'vorhanden')}`:'Noch keine frische direkte Unternehmensnews gefunden';
 return `<article class="exposureCard">
  <div class="exposureHead"><div><div class="eyebrow">${esc(o.eventLabel||'Weltlage')} · ${esc(o.direction||'')}</div><h3>${esc(o.symbol)} · ${esc(o.name||'')}</h3><span class="dossierBadge ${stateClass(o)}">${esc(o.stateLabel||'BEOBACHTEN')}</span></div><div class="exposureScore"><b>${fmt(o.notPricedInScore,0)}</b><span>/100 Frühindikator</span></div></div>
  <div class="dossierMetrics">
   <div class="dossierMetric"><span>Exposition</span><b>${fmt(o.exposureScore,0)}/100</b></div>
   <div class="dossierMetric"><span>Makro bestätigt</span><b class="${o.macroConfirmed?'good':'yellow'}">${o.macroConfirmed?'JA':'NOCH NICHT'} · ${fmt(o.macroConfirmationScore,0)}/100</b></div>
   <div class="dossierMetric"><span>Direkte Firmen-News</span><b>${o.directCompanyNews?'JA':'NEIN · PRE-NEWS'}</b></div>
   <div class="dossierMetric"><span>Aktie heute</span><b class="${Number(o.companyDayPct)>=0?'good':'bad'}">${pct(o.companyDayPct)}</b></div>
   <div class="dossierMetric"><span>Referenzbewegung</span><b>${fmt(o.referenceDirectionalMovePct,2)}% erwartete Richtung</b></div>
   <div class="dossierMetric"><span>Reaktionslücke</span><b class="${Number(o.notPricedGapPct)>0?'yellow':''}">${fmt(o.notPricedGapPct,2)}%</b></div>
  </div>
  <div class="dossierBlock"><b>Warum ist die Aktie betroffen?</b><div>${tags||'Keine belastbare Expositionszuordnung.'}</div></div>
  <div class="dossierBlock"><b>Auslöser</b><div>${esc(o.eventHeadline||o.eventLabel||'')}</div><div class="muted">Quellen: ${esc((o.eventSources||[]).join(' + ')||'–')}</div></div>
  <div class="dossierBlock"><b>Preisreaktion / Schlussfolgerung</b><div>${esc(o.explanation||'')}</div></div>
  <div class="muted">${news} · Trend ${o.trendAligned?'bestätigt/neutral':'nicht bestätigt'}${o.alreadyPriced?' · möglicher Preis bereits weit gelaufen':''}${o.learnedMacro?` · Makro-Lernen ${o.learnedMacro.samples} Fälle / Score ${fmt(o.learnedMacro.reliabilityScore,0)}`:''}</div>
 </article>`;
}

async function load(){
 if(document.hidden)return;const section=ensure();if(!section)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),x=s.exposureNetwork;
  if(!x){$('exposureMeta').textContent='Expositionsnetz wird nach dem nächsten vollständigen Scan aufgebaut.';$('exposureSummary').innerHTML='';$('exposureCards').innerHTML='<div class="analysisStatus">Noch keine Expositionsdaten.</div>';return}
  $('exposurePill').textContent=`${Number(x.preNewsCount||0)} PRE-NEWS`;
  $('exposureMeta').textContent=`Stand ${dt(x.updatedAt)} · ${Number(x.profilesAnalyzed||0)} Live-Kandidaten analysiert · ${Number(x.activeEvents||0)} relevante Welt-/Makroereignisse · ${Number(x.activeLinks||0)} Expositionsverbindungen.`;
  $('exposureSummary').innerHTML=`<div class="mini"><span>Analysierte Unternehmen</span><b>${Number(x.profilesAnalyzed||0)}</b></div><div class="mini"><span>Mit Expositionsprofil</span><b>${Number(x.taggedCompanies||0)}</b></div><div class="mini"><span>Aktive Verbindungen</span><b>${Number(x.activeLinks||0)}</b></div><div class="mini"><span>PRE-NEWS Hinweise ≥62</span><b>${Number(x.preNewsCount||0)}</b></div>`;
  const rows=(x.opportunities||[]).slice(0,10);$('exposureCards').innerHTML=rows.length?rows.map(opportunity).join(''):'<div class="analysisStatus">Aktuell keine ausreichend starke Expositions-/Nachholkonstellation erkannt.</div>';
 }catch(e){$('exposureMeta').textContent=`Expositionsnetz derzeit nicht verfügbar: ${e.message}`}
}

load();setInterval(load,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
