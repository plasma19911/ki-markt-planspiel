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
 PANW:'Palo Alto Networks verkauft Cybersicherheitssoftware für Netzwerke, Cloud und Unternehmen.'
};
const THEME={
 DEFENSE:'Das Unternehmen arbeitet im Bereich Luftfahrt, Verteidigung oder Sicherheit.',
 DEFENSE_TECH:'Das Unternehmen arbeitet im Bereich Verteidigung und Sicherheit.',
 AI_POWER_GRID:'Das Unternehmen hängt vom Ausbau von Rechenzentren und Stromnetzen ab.',
 CYBER_SECURITY:'Das Unternehmen bietet IT- oder Cybersicherheitslösungen an.',
 RATES_MACRO:'Die Aktie reagiert stark auf Zinsen, Konjunktur und Marktstimmung.'
};

function company(x){return COMPANIES[base(x.symbol)]||THEME[String(x.theme||'').toUpperCase()]||`${x.name||x.symbol||'Das Unternehmen'} ist ein börsennotiertes Unternehmen, das vom Scanner weiter beobachtet wird.`}
function scoreFromMessage(m){const x=String(m||'').match(/Score\s+(-?\d+(?:[.,]\d+)?)/i);return x?Number(x[1].replace(',','.')):null}
function confFromMessage(m){const x=String(m||'').match(/Konfidenz\s+(\d+)%/i);return x?Number(x[1])/100:null}
function currentNews(symbol,s){const b=base(symbol);const n=arr(s.newsRadar).find(x=>base(x.symbol)===b);if(n?.headline)return String(n.headline);const f=arr(s.futureWatch?.candidates).find(x=>base(x.symbol)===b);if(f?.catalyst||f?.reason)return String(f.catalyst||f.reason);return''}
function movement(x,s){const n=currentNews(x.symbol,s);if(n)return n.slice(0,190);if(x.kind==='IM DEPOT')return'Die Position ist bereits im Depot. Kurs, News und ein möglicher besserer Wechsel werden laufend neu geprüft.';if(x.kind==='NEWS-WATCH')return'Aktuelles Weltthema oder Unternehmensereignis macht die Aktie interessant. Für einen Kauf fehlt noch die Kursbestätigung.';return'Zuletzt ein stärkerer Beobachtungskandidat. Ein neuer Einstieg wartet auf frische Kursdaten, einen Rücksetzer oder eine neue Bestätigung.'}
function rating(x){if(x.kind==='IM DEPOT')return['Im Depot','hold'];const sc=num(x.score,-99);if(sc>=5)return['Sehr interessant','strong'];if(sc>=3.5)return['Interessant','good'];return['Beobachten','watch']}
function risk(x){const e=String(x.event_risk||'').toUpperCase();if(e==='HIGH')return['Hohes Event-Risiko','high'];if(e==='MEDIUM')return['Mittleres Event-Risiko','mid'];return['Wird laufend geprüft',''];}

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
   const sc=scoreFromMessage(l.message);const cf=num(l.confidence,confFromMessage(l.message)||0);
   map.set(k,{symbol:l.symbol,name:l.name||'',kind:'BEOBACHTEN',priority:60+num(sc)+cf*10,confidence:cf,score:sc??0,message:l.message});
 }
 return [...map.values()].sort((a,b)=>num(b.priority)-num(a.priority)).slice(0,8);
}

function isEmptyState(body){if(!body)return false;const rows=[...body.querySelectorAll('tr')];return rows.length===1&&/keine frischen handelbaren signale/i.test(rows[0].textContent||'')}
function renderFallback(s){
 const body=$('candidatesBody');if(!isEmptyState(body))return;
 const rows=buildRows(s);if(!rows.length){body.innerHTML='<tr><td colspan="7"><div class="candidateFallbackEmpty"><b>Gerade kein neuer Kaufkandidat.</b><span>Der Scanner läuft weiter. Sobald ein Wert die Mindestqualität erreicht oder ein sauberer Rücksetzer entsteht, erscheint er hier.</span></div></td></tr>';return}
 body.innerHTML=rows.map(x=>{const [label,cls]=rating(x),[rt,rcls]=risk(x);const conf=num(x.confidence);const day=Number(x.day_change);return `<tr class="fallbackCandidate"><td><b>${esc(x.symbol)}</b><br><span class="candidateState ${esc(x.kind.toLowerCase().replace(/\s+/g,'-'))}">${esc(x.kind==='IM DEPOT'?'IM DEPOT':x.kind==='NEWS-WATCH'?'NEWS-WATCH':'BEOBACHTEN')}</span><br><span class="muted">${esc(x.name||'')}</span></td><td class="plainCell">${esc(company(x))}</td><td class="plainCell influenceCell">${esc(movement(x,s))}</td><td><span class="fallbackRating ${cls}">${esc(label)}</span>${Number.isFinite(Number(x.score))?`<br><span class="muted">Score ${fmt(x.score,2)}</span>`:''}</td><td><b>${conf>0?`${Math.round(conf*100)}%`:'–'}</b></td><td class="${Number.isFinite(day)?(day>=0?'good':'bad'):''}"><b>${Number.isFinite(day)?`${day>=0?'+':''}${fmt(day,2)}%`:'–'}</b></td><td><span class="eventPill ${rcls}">${esc(rt)}</span></td></tr>`}).join('');
 const help=document.querySelector('.candidateHelp');if(help)help.innerHTML='<b>Gerade kein neuer BUY durch alle Filter.</b> Deshalb siehst du hier trotzdem die wichtigsten offenen Positionen und zuletzt interessanten Beobachtungen. Neue echte Kaufkandidaten ersetzen diese Liste automatisch.';
 const tag=document.querySelector('#signals .cardTitle .tag');if(tag)tag.textContent='Depot + Watchlist';
}

let loading=false;
async function refresh(){const body=$('candidatesBody');if(!isEmptyState(body)||loading)return;loading=true;try{const r=await fetch('/api/status',{cache:'no-store'});if(r.ok)renderFallback(await r.json())}catch{}finally{loading=false}}
function install(){const body=$('candidatesBody');if(!body)return;new MutationObserver(()=>{if(isEmptyState(body))queueMicrotask(refresh)}).observe(body,{childList:true,subtree:true});refresh()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
