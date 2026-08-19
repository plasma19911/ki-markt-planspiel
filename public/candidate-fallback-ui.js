const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const base=v=>String(v||'').toUpperCase().split('.')[0];
const fmt=(v,d=1)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});

const COMPANIES={
 ESLT:'Elbit Systems entwickelt Militär-Elektronik, Drohnen, Sensoren und Verteidigungssysteme.',
 GE:'GE Aerospace baut und wartet Flugzeugtriebwerke sowie Technik für zivile und militärische Luftfahrt.',
 NOC:'Northrop Grumman entwickelt Militärflugzeuge, Raumfahrt-, Raketen- und Verteidigungssysteme.',
 RTX:'RTX produziert Flugzeugtriebwerke, Flugzeugsysteme sowie Raketen- und Luftverteidigungstechnik.',
 LMT:'Lockheed Martin baut Kampfjets, Raketen, Raumfahrt- und andere Verteidigungssysteme.',
 HWM:'Howmet Aerospace produziert Spezialteile und Materialien für Flugzeuge und Triebwerke.',
 AXON:'Axon entwickelt Körperkameras, Taser und digitale Sicherheitssoftware für Polizei und Behörden.',
 PSN:'Parsons entwickelt Technik, Software und Infrastruktur für Verteidigung, Sicherheit und Behörden.',
 CRM:'Salesforce verkauft Cloud-Software für Vertrieb, Kundenservice, Marketing und Datenanalyse.',
 ADBE:'Adobe entwickelt Kreativsoftware, PDF-/Dokumentlösungen und Marketingsoftware.',
 INTU:'Intuit bietet Finanz-, Buchhaltungs- und Steuersoftware wie QuickBooks und TurboTax.',
 SAP:'SAP entwickelt Unternehmenssoftware für Finanzen, Personal, Einkauf, Lieferketten und Cloud.',
 NOW:'ServiceNow liefert Cloud-Software zur Automatisierung von IT- und Geschäftsabläufen.',
 NVDA:'Nvidia entwickelt KI- und Grafikchips sowie Rechenzentrumsplattformen.',
 PLTR:'Palantir entwickelt Daten- und KI-Software für Unternehmen, Behörden und Verteidigung.',
 GEV:'GE Vernova baut Energie- und Stromnetztechnik für Kraftwerke, Netze und Rechenzentren.',
 VRT:'Vertiv liefert Stromversorgung und Kühlung für Rechenzentren.',
 PANW:'Palo Alto Networks verkauft Cybersicherheitssoftware für Netzwerke, Cloud und Unternehmen.',
 '079550':'LIG Nex1 entwickelt Lenkflugkörper, Radar-, Sensor-, Kommunikations- und weitere Verteidigungssysteme.',
 EOS:'Electro Optic Systems entwickelt ferngesteuerte Verteidigungssysteme, Sensorik und Weltraumtechnik.',
 '3690':'Meituan betreibt digitale Plattformen für Essenslieferung, lokale Dienstleistungen sowie Hotel- und Reisebuchungen.',
 '012450':'Hanwha Aerospace produziert Flugzeugtriebwerke, Artillerie-, Raumfahrt- und weitere Verteidigungstechnik.'
};
const THEME={
 DEFENSE:'Das Unternehmen arbeitet im Bereich Luftfahrt, Verteidigung oder Sicherheit.',
 DEFENSE_TECH:'Das Unternehmen arbeitet im Bereich Verteidigung und Sicherheit.',
 RUSSIA_SANCTIONS_DEFENSE:'Das Unternehmen arbeitet im Bereich Verteidigung und Sicherheit.',
 AI_POWER_GRID:'Das Unternehmen hängt vom Ausbau von Rechenzentren und Stromnetzen ab.',
 CYBER_SECURITY:'Das Unternehmen bietet IT- oder Cybersicherheitslösungen an.',
 SEMI_EXPORT_CONTROLS:'Das Unternehmen gehört zur Halbleiter- und Chipindustrie.',
 NUCLEAR_URANIUM:'Das Unternehmen arbeitet im Bereich Kernenergie oder Uran.',
 RATES_MACRO:'Die Aktie reagiert stark auf Zinsen, Konjunktur und Marktstimmung.'
};
const THEME_MOVE={
 DEFENSE:'Defense-/Aerospace-Sektor im Fokus',DEFENSE_TECH:'Defense-/Aerospace-Sektor im Fokus',RUSSIA_SANCTIONS_DEFENSE:'Geopolitik und Defense-Sektor im Fokus',
 AI_POWER_GRID:'KI-Rechenzentren und Stromnetzausbau im Fokus',CYBER_SECURITY:'Cybersecurity-Sektor im Fokus',SEMI_EXPORT_CONTROLS:'Chipsektor und Exportregeln im Fokus',
 NUCLEAR_URANIUM:'Kernenergie-/Uran-Thema im Fokus',RATES_MACRO:'Zinsen und Konjunktur bewegen den Wert'
};

function company(x){
 const direct=String(x?.business_summary||x?.businessSummary||x?.description||'').trim();if(direct)return direct.slice(0,190);
 const b=base(x.symbol);if(COMPANIES[b])return COMPANIES[b];
 const name=String(x.name||'').toLowerCase();
 if(name.includes('aerospace')||name.includes('defense')||name.includes('defence'))return'Das Unternehmen ist in Luftfahrt, Verteidigung oder Sicherheit tätig.';
 if(name.includes('optic'))return'Das Unternehmen entwickelt optische, sensorbasierte oder sicherheitsrelevante Technik.';
 if(name.includes('semiconductor')||name.includes('chip'))return'Das Unternehmen entwickelt oder produziert Halbleiter- und Chiptechnik.';
 return THEME[String(x.theme||'').toUpperCase()]||`${x.name||x.symbol||'Das Unternehmen'} wird als börsennotiertes Unternehmen vom Scanner weiter beobachtet.`;
}
function scoreFromMessage(m){const x=String(m||'').match(/Score\s+(-?\d+(?:[.,]\d+)?)/i);return x?Number(x[1].replace(',','.')):null}
function confFromMessage(m){const x=String(m||'').match(/Konfidenz\s+(\d+)%/i);return x?Number(x[1])/100:null}
function currentNews(symbol,s){const b=base(symbol);const n=arr(s.newsRadar).find(x=>base(x.symbol)===b);if(n?.headline)return String(n.headline);const f=arr(s.futureWatch?.candidates).find(x=>base(x.symbol)===b);if(f?.catalyst||f?.reason)return String(f.catalyst||f.reason);return''}
function movement(x,s){
 const n=currentNews(x.symbol,s);if(n)return n.slice(0,145);
 const theme=THEME_MOVE[String(x.theme||'').toUpperCase()];
 if(x.kind==='IM DEPOT')return theme?`${theme} · Position im Depot wird weiter geprüft.`:'Im Depot · Kurs und News werden laufend neu geprüft.';
 if(x.kind==='NEWS-WATCH')return theme?`${theme} · Kauf wartet noch auf Kursbestätigung.`:'News-/Weltthema auffällig · Kauf wartet noch auf Kursbestätigung.';
 if(theme)return`${theme} · aktuell keine neue starke Firmenmeldung.`;
 return'Beobachtung · wartet auf frische Bestätigung oder einen besseren Rücksetzer.';
}
function rating(x){if(x.kind==='IM DEPOT')return['Im Depot','hold'];const sc=num(x.score,-99);if(sc>=5)return['Sehr interessant','strong'];if(sc>=3.5)return['Interessant','good'];return['Beobachten','watch']}
function risk(x){const e=String(x.event_risk||'').toUpperCase();if(e==='HIGH')return['Event hoch','high'];if(e==='MEDIUM')return['Event mittel','mid'];return['Normal',''];}

function configureHeader(){
 const labels=['Aktie','Bewertung','Heute','Sicherheit','Risiko','Was macht die Firma?','Was bewegt sie gerade?'];
 const th=[...document.querySelectorAll('#signals .candidatesWrap thead th')];
 th.forEach((x,i)=>{if(labels[i])x.textContent=labels[i]});
}
function normalizeIdentity(cell){
 if(!cell||cell.dataset.identityReady==='1')return;
 const symbol=String(cell.querySelector('b')?.textContent||'').trim();
 const oldName=String(cell.querySelector('.muted')?.textContent||'').trim();
 if(!symbol)return;
 const name=oldName&&oldName.toUpperCase()!==symbol.toUpperCase()?oldName:symbol;
 cell.classList.add('candidateIdentity');
 cell.innerHTML=`<b class="candidateName">${esc(name)}</b><span class="candidateSymbol">${esc(symbol)}</span>`;
 cell.dataset.identityReady='1';
}
function normalizeRows(){
 const body=$('candidatesBody');if(!body)return;
 for(const row of body.querySelectorAll('tr')){
   if(row.dataset.candidateOrder==='compact')continue;
   const cells=[...row.children];if(cells.length!==7)continue;
   normalizeIdentity(cells[0]);
   for(const i of [0,3,5,4,6,1,2])row.appendChild(cells[i]);
   row.dataset.candidateOrder='compact';
 }
}
function updateModeCopy(){
 const body=$('candidatesBody'),help=document.querySelector('.candidateHelp'),tag=document.querySelector('#signals .cardTitle .tag');if(!body)return;
 const fallback=Boolean(body.querySelector('.fallbackCandidate'));
 if(fallback){
   if(help)help.innerHTML='<b>Gerade kein neuer BUY durch alle Filter.</b> Deshalb siehst du Depot und Watchlist. Neue echte Kaufkandidaten ersetzen diese Liste automatisch.';
   if(tag)tag.textContent='Depot + Watchlist';
 }else if(!isEmptyState(body)){
   if(help)help.innerHTML='<b>Aktuelle Scanner-Kandidaten.</b> Bewertung, Tagesbewegung, Sicherheit und Risiko stehen zuerst; Firma und Auslöser werden rechts verständlich erklärt.';
   if(tag)tag.textContent='Live-Kandidaten';
 }
}

function buildRows(s){
 const map=new Map();
 for(const p of arr(s.positions)){
   const k=base(p.symbol);if(!k)continue;
   map.set(k,{...p,kind:'IM DEPOT',priority:100+num(p.invested)/1000,confidence:num(p.signal_confidence||p.confidence),score:num(p.score),day_change:p.day_change});
 }
 for(const f of arr(s.futureWatch?.candidates)){
   const k=base(f.symbol);if(!k||map.has(k))continue;
   map.set(k,{...f,kind:'NEWS-WATCH',priority:75+num(f.watchScore)/10,confidence:num(f.confidence||f.signal_confidence),score:num(f.score,f.watchScore?num(f.watchScore)/15:0)});
 }
 const logs=arr(s.aiLog||s.recentAiLog);
 for(const l of logs){
   if(String(l.kind||'').toUpperCase()!=='IDEA'||!l.symbol)continue;
   const k=base(l.symbol);if(!k||map.has(k))continue;
   const sc=scoreFromMessage(l.message),cf=num(l.confidence,confFromMessage(l.message)||0);
   map.set(k,{symbol:l.symbol,name:l.name||'',kind:'BEOBACHTEN',priority:60+num(sc)+cf*10,confidence:cf,score:sc??0,message:l.message});
 }
 return [...map.values()].sort((a,b)=>num(b.priority)-num(a.priority)).slice(0,8);
}

function isEmptyState(body){if(!body)return false;const rows=[...body.querySelectorAll('tr')];return rows.length===1&&/keine frischen handelbaren signale/i.test(rows[0].textContent||'')}
function identityHtml(x){const symbol=String(x.symbol||''),name=String(x.name||symbol),state=x.kind==='IM DEPOT'?'IM DEPOT':x.kind==='NEWS-WATCH'?'NEWS-WATCH':'BEOBACHTEN',stateClass=String(x.kind||'').toLowerCase().replace(/\s+/g,'-');return `<td class="candidateIdentity"><b class="candidateName">${esc(name||symbol)}</b><span class="candidateSymbol">${esc(symbol)}</span><span class="candidateState ${esc(stateClass)}">${esc(state)}</span></td>`}
function renderFallback(s){
 const body=$('candidatesBody');if(!isEmptyState(body))return;
 const rows=buildRows(s);if(!rows.length){body.innerHTML='<tr><td colspan="7"><div class="candidateFallbackEmpty"><b>Gerade kein neuer Kaufkandidat.</b><span>Der Scanner läuft weiter. Sobald ein Wert die Mindestqualität erreicht oder ein sauberer Rücksetzer entsteht, erscheint er hier.</span></div></td></tr>';return}
 body.innerHTML=rows.map(x=>{const [label,cls]=rating(x),[rt,rcls]=risk(x),conf=num(x.confidence),day=Number(x.day_change);return `<tr class="fallbackCandidate" data-candidate-order="compact">${identityHtml(x)}<td><span class="fallbackRating ${cls}">${esc(label)}</span>${Number.isFinite(Number(x.score))?`<span class="candidateScore">Score ${fmt(x.score,2)}</span>`:''}</td><td class="${Number.isFinite(day)?(day>=0?'good':'bad'):''}"><b>${Number.isFinite(day)?`${day>=0?'+':''}${fmt(day,2)}%`:'–'}</b></td><td><b>${conf>0?`${Math.round(conf*100)}%`:'–'}</b></td><td><span class="eventPill ${rcls}">${esc(rt)}</span></td><td class="plainCell">${esc(company(x))}</td><td class="plainCell influenceCell">${esc(movement(x,s))}</td></tr>`}).join('');
 configureHeader();updateModeCopy();
}

let loading=false,normalizing=false;
async function refresh(){const body=$('candidatesBody');if(!isEmptyState(body)||loading)return;loading=true;try{const r=await fetch('/api/status',{cache:'no-store'});if(r.ok)renderFallback(await r.json())}catch{}finally{loading=false}}
function syncTable(){if(normalizing)return;normalizing=true;try{configureHeader();const body=$('candidatesBody');if(!body)return;if(isEmptyState(body))queueMicrotask(refresh);else{normalizeRows();updateModeCopy()}}finally{normalizing=false}}
function install(){const body=$('candidatesBody');if(!body)return;configureHeader();new MutationObserver(()=>queueMicrotask(syncTable)).observe(body,{childList:true,subtree:true});syncTable();refresh()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
