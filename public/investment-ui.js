const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const dt=s=>s?new Date(s).toLocaleString('de-DE'):'–';
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v,2)}%`;

const COMPANY={
 AXON:'Axon entwickelt Körperkameras, Taser und digitale Beweis-/Polizeisoftware für Sicherheitsbehörden.',
 ADBE:'Adobe entwickelt Kreativsoftware wie Photoshop sowie PDF-, Dokument- und Marketingsoftware.',
 HWM:'Howmet Aerospace produziert Bauteile für Flugzeugtriebwerke, Flugzeuge und andere Luftfahrtanwendungen.',
 ESLT:'Elbit Systems entwickelt Militär-Elektronik, Drohnen, Sensoren und andere Verteidigungssysteme.',
 SAP:'SAP entwickelt Unternehmenssoftware für Finanzen, Personal, Einkauf, Lieferketten und Cloud.',
 CRM:'Salesforce verkauft Cloud-Software für Vertrieb, Kundenservice, Marketing und Datenanalyse.',
 INTU:'Intuit bietet Finanz-, Buchhaltungs- und Steuersoftware wie QuickBooks, TurboTax und Credit Karma.',
 NOW:'ServiceNow liefert Cloud-Software, mit der Unternehmen IT- und Geschäftsabläufe automatisieren.',
 NVDA:'Nvidia entwickelt KI- und Grafikchips sowie Rechenzentrumsplattformen.',
 AMD:'AMD entwickelt Prozessoren, Grafikchips und Chips für Rechenzentren und KI.',
 PLTR:'Palantir entwickelt Daten- und KI-Software für Unternehmen, Behörden und Verteidigung.',
 LMT:'Lockheed Martin ist ein großer US-Rüstungskonzern für Kampfjets, Raketen, Raumfahrt und Verteidigung.',
 NOC:'Northrop Grumman entwickelt Militärflugzeuge, Raumfahrt-, Raketen- und Verteidigungssysteme.',
 RTX:'RTX produziert Triebwerke, Flugzeugsysteme sowie Raketen- und Luftverteidigungstechnik.',
 SMR:'NuScale Power entwickelt kleine modulare Kernreaktoren (SMR).',
 OKLO:'Oklo entwickelt kleine moderne Kernreaktoren und Stromversorgung für energieintensive Kunden.',
 GEV:'GE Vernova baut Energie- und Stromnetztechnik, darunter Gasturbinen, Windkraft und Netzausrüstung.',
 ETN:'Eaton produziert elektrische Systeme und Komponenten für Stromnetze, Industrie und Rechenzentren.',
 VRT:'Vertiv liefert Stromversorgung und Kühlung für Rechenzentren.',
 PANW:'Palo Alto Networks verkauft Cybersicherheitssoftware für Netzwerke, Cloud und Unternehmen.',
 CRWD:'CrowdStrike bietet cloudbasierte Cybersicherheit und Schutz von Computern und Unternehmensnetzen.',
 XOM:'Exxon Mobil fördert und verarbeitet Öl und Gas und verkauft Energie- und Chemieprodukte.',
 CVX:'Chevron ist ein großer Öl- und Gaskonzern mit Förderung, Raffinerien und Energiegeschäft.'
};
function base(v){return String(v||'').toUpperCase().split('.')[0]}
function companyText(d){
 const co=d.company||{},direct=String(co.businessSummary||co.description||'').trim();if(direct)return direct.slice(0,220);
 if(COMPANY[base(d.symbol)])return COMPANY[base(d.symbol)];
 const sector=String(co.sector||co.industry||d.theme||'').replace(/_/g,' ').trim();
 return sector?`${d.name||d.symbol} ist in diesem Bereich tätig: ${sector}.`:`${d.name||d.symbol} ist ein börsennotiertes Unternehmen. Die KI beobachtet Nachrichten, Geschäftslage und Kursreaktion.`;
}
function plainFactor(x){
 let t=String(x||'');
 t=t.replace(/EMA9 über EMA21/gi,'Kurzfristiger Trend zeigt nach oben')
    .replace(/Kurs über EMA21/gi,'Kurs hält sich über seinem kurzfristigen Durchschnitt')
    .replace(/RSI\s*\d+(?:\.\d+)?\s*(?:konstruktiv|stark|schwach)?/gi,'Kursbewegung wirkt derzeit nicht extrem')
    .replace(/Momentum[^·,;]*/gi,'Kursbewegung')
    .replace(/20T/gi,'mehrwöchig')
    .replace(/Intraday/gi,'kurzfristig');
 return t.trim();
}
function cleanList(items,limit=3){
 const a=(items||[]).map(plainFactor).filter(Boolean).filter((x,i,all)=>all.indexOf(x)===i).slice(0,limit);
 return a.length?`<ul class="dossierList">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<span class="muted">Keine klare Zusatzinformation.</span>';
}
function ratingText(d){const r=String(d.rating||'BEOBACHTEN').toUpperCase();if(/KAUF|STARK/.test(r))return'INTERESSANT';if(/MEID|SCHWACH/.test(r))return'VORSICHT';return'BEOBACHTEN'}
function newsTone(d){const n=Number(d.live?.newsScore||0);if(n>.12)return'positiv';if(n<-.12)return'negativ';return'neutral'}
function riskText(d){const r=String(d.riskLevel||'MITTEL').toUpperCase();return r==='HOCH'?'höher':r==='NIEDRIGER'?'niedriger':'mittel'}
function dossierCard(d){
 const live=d.live||{},co=d.company||{},catalyst=String(d.catalyst||'Keine einzelne starke Meldung erkannt.').trim();
 const sources=(d.newsSources||[]).slice(0,3).join(' + ');
 return `<article class="dossierCard">
  <div class="dossierHead"><div><div class="eyebrow">AKTIE${co.size?` · ${esc(co.size)}`:''}</div><h3>${esc(d.symbol)} · ${esc(d.name||'')}</h3><span class="dossierBadge">${ratingText(d)}</span></div><div><div class="dossierScore">${fmt(d.qualityScore,0)}</div><div class="muted">/100 Gesamteindruck</div></div></div>
  <div class="companyPlain"><span>Was macht die Firma?</span><b>${esc(companyText(d))}</b></div>
  <div class="newsPlain"><b>Was bewegt die Aktie gerade?</b><br>${esc(catalyst)}${sources?`<div class="muted">Quellen: ${esc(sources)}</div>`:''}</div>
  <div class="dossierMetrics">
   <div class="dossierMetric"><span>Aktuelle Einschätzung</span><b>${ratingText(d)}</b></div>
   <div class="dossierMetric"><span>News-Lage</span><b class="${Number(live.newsScore)>0?'good':Number(live.newsScore)<0?'bad':''}">${newsTone(d)}</b></div>
   <div class="dossierMetric"><span>Risiko</span><b>${riskText(d)}</b></div>
  </div>
  <div class="dossierBlock"><b>Warum gerade interessant?</b>${cleanList(d.positives,2)}</div>
  <div class="dossierBlock"><b>Was spricht dagegen?</b>${cleanList(d.negatives,2)}</div>
  <div class="plainRisk">Live-Bewertung ${fmt(live.score,2)} · Sicherheit ${Math.round(Number(live.confidence||0)*100)}% · technische Detailwerte laufen nur im Hintergrund.</div>
 </article>`;
}

async function loadIntelligence(){
 if(document.hidden)return;const grid=$('dossierGrid'),pill=$('regimePill'),meta=$('intelligenceMeta');if(!grid||!pill||!meta)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json();
  const regime=s.marketRegime||{},rows=s.investmentDossiers||[];
  pill.textContent=`Marktlage ${regime.label||'–'}`;
  meta.textContent=`Stand ${dt(s.intelligenceUpdatedAt)} · einfache Erklärung statt Technik-Wand. News, Geschäft und Risiko stehen im Vordergrund.`;
  grid.innerHTML=rows.length?rows.slice(0,4).map(dossierCard).join(''):'<div class="analysisStatus"><b>Noch keine verständlichen Aktien-Dossiers.</b><br>Sie werden nach einem vollständigen Markt-Scan aufgebaut.</div>';
 }catch(e){grid.innerHTML=`<div class="analysisStatus"><b>Anlage-Analyse derzeit nicht verfügbar.</b><br>${esc(e.message)}</div>`}
}
loadIntelligence();setInterval(loadIntelligence,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadIntelligence()});
