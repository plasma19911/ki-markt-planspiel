const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const dt=s=>s?new Date(s).toLocaleString('de-DE'):'–';
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v,2)}%`;
const base=v=>String(v||'').toUpperCase().split('.')[0];

// Kurze, verständliche Geschäftsmodelle für häufig auftauchende Kandidaten.
// Kein Fülltext wie „börsennotiertes Unternehmen“ – wenn wir es nicht wissen,
// sagen wir das offen statt so zu tun, als hätten wir die Firma erklärt.
const COMPANY={
 ASELS:'ASELSAN entwickelt Verteidigungselektronik: unter anderem Radar, Luftverteidigung, elektronische Kampfführung, Kommunikation, Avionik, Elektrooptik sowie Führungs- und Waffensysteme.',
 OTKAR:'Otokar baut Busse und Nutzfahrzeuge sowie gepanzerte Rad- und Kettenfahrzeuge für Militär- und Sicherheitskunden.',
 DYVOX:'Dynavox Group entwickelt Kommunikationshilfen für Menschen mit Sprach- oder Bewegungsbeeinträchtigungen, darunter Sprachcomputer, Software und Augensteuerung.',
 SAF:'Safran ist ein Luftfahrt- und Verteidigungskonzern. Das Unternehmen baut Flugzeug- und Hubschraubertriebwerke sowie Fahrwerke, Bremsen, Avionik, Kabinenausrüstung und weitere sicherheitskritische Systeme.',
 R3NK:'RENK entwickelt und fertigt Getriebe, Antriebssysteme und Power-Packs für gepanzerte Fahrzeuge, Schiffe und industrielle Anwendungen.',
 DATAPATTNS:'Data Patterns entwickelt und fertigt Elektronik für Verteidigung und Luft- und Raumfahrt, darunter Radar-, Avionik-, Kommunikations-, Navigations- und Testsysteme.',
 PARAS:'Paras Defence entwickelt Komponenten und Systeme für Verteidigung und Raumfahrt, vor allem Optik und Optronik, Militärelektronik, EMP-Schutz und Spezialfertigung.',
 BLACKBUCK:'BlackBuck betreibt eine digitale Plattform für Lkw-Unternehmer in Indien mit Maut- und Tankzahlungen, Fahrzeugtelematik, Frachtvermittlung und Finanzierung.',
 KOG:'Kongsberg Gruppen entwickelt Technologie für Verteidigung, Raumfahrt und Schifffahrt, darunter Raketen-, Luftverteidigungs-, Sensor- und maritime Systeme.',
 HAG:'HENSOLDT entwickelt Sensoren für Verteidigung und Sicherheit, vor allem Radar, Optronik, elektronische Kampfführung und Avionik.',
 AXON:'Axon entwickelt Körperkameras, Taser und digitale Beweis- und Polizeisoftware für Sicherheitsbehörden.',
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
 LMT:'Lockheed Martin entwickelt und baut unter anderem Kampfjets, Raketen, Raumfahrt- und Verteidigungssysteme.',
 NOC:'Northrop Grumman entwickelt Militärflugzeuge, Raumfahrt-, Raketen- und Verteidigungssysteme.',
 RTX:'RTX produziert Triebwerke, Flugzeugsysteme sowie Raketen- und Luftverteidigungstechnik.',
 SMR:'NuScale Power entwickelt kleine modulare Kernreaktoren.',
 OKLO:'Oklo entwickelt kleine moderne Kernreaktoren und Stromversorgung für energieintensive Kunden.',
 GEV:'GE Vernova baut Energie- und Stromnetztechnik, darunter Gasturbinen, Windkraft und Netzausrüstung.',
 ETN:'Eaton produziert elektrische Systeme und Komponenten für Stromnetze, Industrie und Rechenzentren.',
 VRT:'Vertiv liefert Stromversorgung und Kühlung für Rechenzentren.',
 PANW:'Palo Alto Networks verkauft Cybersicherheitssoftware für Netzwerke, Cloud und Unternehmen.',
 CRWD:'CrowdStrike bietet cloudbasierte Cybersicherheit für Computer und Unternehmensnetze.',
 XOM:'Exxon Mobil fördert und verarbeitet Öl und Gas und verkauft Energie- und Chemieprodukte.',
 CVX:'Chevron ist ein Öl- und Gaskonzern mit Förderung, Raffinerien und Energiegeschäft.'
};

function sectorFallback(co){
 const raw=`${co?.sector||''} ${co?.industry||''}`.toLowerCase();
 if(!raw.trim())return'';
 if(/aerospace|defen|defence|military|rüstung|raumfahrt/.test(raw))return'Das Unternehmen ist im Luftfahrt-, Raumfahrt- oder Verteidigungssektor tätig und entwickelt bzw. fertigt dafür technische Produkte und Systeme.';
 if(/software|information tech|technology|internet/.test(raw))return'Das Unternehmen verdient sein Geld mit Technologie- bzw. Softwareprodukten und digitalen Dienstleistungen.';
 if(/semiconductor|chip/.test(raw))return'Das Unternehmen entwickelt oder produziert Halbleiter und elektronische Komponenten.';
 if(/bank|financial|finance|insurance/.test(raw))return'Das Unternehmen bietet Finanz- oder Versicherungsdienstleistungen an.';
 if(/health|medical|pharma|biotech/.test(raw))return'Das Unternehmen ist im Gesundheitsbereich tätig und bietet medizinische, pharmazeutische oder biotechnologische Produkte an.';
 if(/industrial|machinery|manufactur/.test(raw))return'Das Unternehmen entwickelt und fertigt Industrieprodukte, Maschinen oder technische Komponenten.';
 if(/energy|oil|gas|utility/.test(raw))return'Das Unternehmen ist im Energiegeschäft tätig und verdient Geld mit Energieerzeugung, Infrastruktur oder Rohstoffen.';
 return`Geschäftsbereich: ${String(co?.industry||co?.sector||'').replace(/_/g,' ')}.`;
}
function companyText(d){
 const known=COMPANY[base(d.symbol)];if(known)return known;
 const co=d.company||{},direct=String(co.businessSummary||co.description||'').trim();if(direct)return direct.slice(0,300);
 const fallback=sectorFallback(co);if(fallback)return fallback;
 return'Für diese Aktie liegt aktuell noch keine verlässliche kurze Firmenbeschreibung vor.';
}
function plainFactor(x){
 let t=String(x||'');
 t=t.replace(/EMA9 über EMA21/gi,'Kurzfristiger Trend zeigt nach oben')
    .replace(/Kurs über EMA21/gi,'Kurs hält sich über seinem kurzfristigen Durchschnitt')
    .replace(/Kurs über EMA20 und EMA20 über EMA50/gi,'Mehrtagetrend zeigt nach oben')
    .replace(/Mehrtagetrend klar abwärts/gi,'Mehrtagetrend zeigt nach unten')
    .replace(/Momentum 5T ([^/]+) \/ 20T ([^·,;]+)/gi,'Kurs war in den letzten Tagen und Wochen stärker')
    .replace(/20-Tage-Momentum/gi,'Bewegung der letzten Wochen')
    .replace(/Live-Score[^·,;]*/gi,'Kurzfristige Kursdaten sind konstruktiv')
    .replace(/Signalkonfidenz/gi,'Signalsicherheit')
    .replace(/RSI\s*\d+(?:\.\d+)?\s*(?:konstruktiv|stark|schwach|sehr schwach|überhitzt)?/gi,'Kursbewegung ist kurzfristig auffällig')
    .replace(/Momentum[^·,;]*/gi,'Kursbewegung')
    .replace(/20T/gi,'mehrwöchig')
    .replace(/Intraday/gi,'kurzfristig');
 return t.trim();
}
function cleanList(items,limit=2,empty='Keine zusätzliche Auffälligkeit.'){
 const a=(items||[]).map(plainFactor).filter(Boolean).filter((x,i,all)=>all.indexOf(x)===i).slice(0,limit);
 return a.length?`<ul class="dossierList">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<span class="muted">${esc(empty)}</span>`;
}
function ratingText(d){const r=String(d.rating||'BEOBACHTEN').toUpperCase();if(/STARKES|INTERESSANTES|KAUF|STARK/.test(r))return'INTERESSANT';if(/ZURÜCK|MEID|SCHWACH/.test(r))return'VORSICHT';return'BEOBACHTEN'}
function newsTone(d){const n=Number(d.live?.newsScore||0);if(n>.12)return'positiv';if(n<-.12)return'negativ';return'neutral'}
function riskText(d){const r=String(d.riskLevel||'MITTEL').toUpperCase();return r==='HOCH'?'hoch':r==='NIEDRIGER'?'eher niedrig':'mittel'}
function moveText(d){
 const live=d.live||{},raw=String(d.catalyst||'').trim();
 if(raw&&!/kein klarer einzel-katalysator|keine einzelne starke meldung/i.test(raw))return raw;
 const day=Number(live.dayPct||0),news=newsTone(d);
 if(news==='positiv')return`Die Nachrichtenlage ist aktuell positiv. Die Aktie liegt heute bei ${pct(day)}.`;
 if(news==='negativ')return`Die Nachrichtenlage belastet aktuell. Die Aktie liegt heute bei ${pct(day)}.`;
 if(Math.abs(day)>=1)return`Keine einzelne neue Meldung sticht heraus. Auffällig ist derzeit vor allem die heutige Kursbewegung von ${pct(day)}.`;
 return'Kein einzelner neuer Auslöser erkannt; aktuell bestimmen vor allem Markt- und kurzfristiger Kurstrend die Bewegung.';
}
function shortConclusion(d){
 const r=ratingText(d),risk=riskText(d),news=newsTone(d),day=Number(d.live?.dayPct||0);
 if(r==='INTERESSANT')return`Interessant, aber nicht blind kaufen: ${news==='positiv'?'News unterstützen das Bild; ':''}Risiko ${risk}, heute ${pct(day)}.`;
 if(r==='VORSICHT')return`Aktuell eher vorsichtig: Risiko ${risk}, heute ${pct(day)}. Erst bei besserem Kursbild erneut prüfen.`;
 return`Beobachten: Risiko ${risk}, News ${news}, heute ${pct(day)}. Auf einen besseren Einstieg oder klaren Auslöser warten.`;
}
function dossierCard(d){
 const live=d.live||{},co=d.company||{};
 return `<article class="dossierCard">
  <div class="dossierHead"><div><div class="eyebrow">AKTIE${co.size&&co.size!=='–'?` · ${esc(co.size)}`:''}</div><h3>${esc(d.symbol)} · ${esc(d.name||'')}</h3><span class="dossierBadge">${ratingText(d)}</span></div></div>
  <div class="companyPlain"><span>Was macht die Firma?</span><b>${esc(companyText(d))}</b></div>
  <div class="newsPlain"><b>Was bewegt die Aktie gerade?</b><br>${esc(moveText(d))}</div>
  <div class="dossierMetrics">
   <div class="dossierMetric"><span>Heute</span><b class="${Number(live.dayPct)>0?'good':Number(live.dayPct)<0?'bad':''}">${pct(live.dayPct||0)}</b></div>
   <div class="dossierMetric"><span>News</span><b class="${Number(live.newsScore)>0?'good':Number(live.newsScore)<0?'bad':''}">${newsTone(d)}</b></div>
   <div class="dossierMetric"><span>Risiko</span><b>${riskText(d)}</b></div>
  </div>
  <div class="dossierBlock"><b>Was spricht dafür?</b>${cleanList(d.positives,2,'Aktuell kein zusätzlicher Pluspunkt.')}</div>
  <div class="dossierBlock"><b>Was spricht dagegen?</b>${cleanList(d.negatives,2,'Aktuell kein besonderer Gegenpunkt.')}</div>
  <div class="plainRisk"><b>Kurzfazit:</b> ${esc(shortConclusion(d))}</div>
 </article>`;
}

async function loadIntelligence(){
 if(document.hidden)return;const grid=$('dossierGrid'),pill=$('regimePill'),meta=$('intelligenceMeta');if(!grid||!pill||!meta)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json();
  const regime=s.marketRegime||{},rows=s.investmentDossiers||[];
  pill.textContent=`Marktlage ${regime.label||'–'}`;
  meta.textContent=`Stand ${dt(s.intelligenceUpdatedAt)} · Geschäft, aktueller Kurstreiber, Chance und Risiko – ohne interne Roh-Scores.`;
  grid.innerHTML=rows.length?rows.slice(0,4).map(dossierCard).join(''):'<div class="analysisStatus"><b>Noch keine verständlichen Aktien-Dossiers.</b><br>Sie werden nach einem vollständigen Markt-Scan aufgebaut.</div>';
 }catch(e){grid.innerHTML=`<div class="analysisStatus"><b>Anlage-Analyse derzeit nicht verfügbar.</b><br>${esc(e.message)}</div>`}
}
loadIntelligence();setInterval(loadIntelligence,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadIntelligence()});
