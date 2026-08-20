// V28.3 UI / Live integration patch.
// Makes the V28.1/V28.2 research score unmistakably visible, fixes the old
// scanner-score "Schwach" label, shows gettex trading hours, and completes the changelog.

const norm=v=>String(v||'').toUpperCase().trim();
const num=(v,d=NaN)=>Number.isFinite(Number(v))?Number(v):d;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let latestStatus=null;
let applying=false;

function tier(score,blocked=false){
 if(blocked)return{cls:'blocked',label:'Block'};
 const n=num(score);
 if(!Number.isFinite(n))return{cls:'missing',label:'Noch kein Score'};
 if(n>=72)return{cls:'ready',label:'Kaufbereit'};
 if(n>=64)return{cls:'confirm',label:'Bestätigen'};
 if(n>=58)return{cls:'watch',label:'Beobachten'};
 if(n>=40)return{cls:'building',label:'Aufbau'};
 return{cls:'weak',label:'Schwach'};
}

function policyMaps(status={}){
 const p=status?.researchSignalFusionPolicy||{};
 const ranking=Array.isArray(p.ranking)?p.ranking:[];
 const positions=Array.isArray(p.positionScores)?p.positionScores:[];
 return{
  ranking:new Map(ranking.map(x=>[norm(x?.symbol),x]).filter(([s])=>s)),
  positions:new Map(positions.map(x=>[norm(x?.symbol),x]).filter(([s])=>s))
 };
}

function scoreHtml(row,{compact=false}={}){
 const score=num(row?.fusionScore),t=tier(score,Boolean(row?.hardBlocked));
 const shown=Number.isFinite(score)?Math.round(score):'–';
 const title=Number.isFinite(score)?`Research-Fusion ${score.toFixed(1)}/100. Der Wert bündelt Qualität, Sicherheit, Momentum, Reclaim, Volumen, News, Multi-Scan, Marktregime und Forward-Lernen.`:'Für diesen Wert wurde im aktuellen/letzten Research-Lauf noch kein Research-Score gespeichert.';
 return `<span class="v283Research ${t.cls}${compact?' compact':''}" title="${esc(title)}"><b>Research ${shown}</b><small>${esc(t.label)}</small></span>`;
}

function ensureStyles(){
 if(document.getElementById('v283-ui-style'))return;
 const s=document.createElement('style');s.id='v283-ui-style';s.textContent=`
 .v283Research{display:inline-flex;align-items:center;gap:6px;margin-left:7px;padding:5px 8px;border-radius:9px;border:1px solid rgba(117,145,170,.28);background:rgba(9,25,40,.82);vertical-align:middle;white-space:nowrap}
 .v283Research b{font-size:10px;color:#e4eef8}.v283Research small{font-size:9px;color:#91a7ba}
 .v283Research.ready{border-color:rgba(70,214,154,.45);background:rgba(70,214,154,.13)}.v283Research.ready small{color:#75e5b2}
 .v283Research.confirm{border-color:rgba(91,170,255,.42);background:rgba(91,170,255,.12)}.v283Research.confirm small{color:#9bc7ef}
 .v283Research.watch{border-color:rgba(239,190,90,.4);background:rgba(239,190,90,.11)}.v283Research.watch small{color:#e8c77b}
 .v283Research.building{border-color:rgba(165,142,255,.34);background:rgba(165,142,255,.09)}.v283Research.building small{color:#c8b9ff}
 .v283Research.weak,.v283Research.missing{opacity:.78}.v283Research.blocked{border-color:rgba(255,112,128,.42);background:rgba(255,112,128,.11)}.v283Research.blocked small{color:#f0a0aa}
 .v283Research.compact{margin:0;padding:5px 8px;min-width:112px;justify-content:space-between}
 .v283ScoreLegend{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin:8px 0 11px;padding:9px 11px;border:1px solid rgba(89,118,145,.2);border-radius:10px;background:rgba(10,23,37,.48);color:#8fa5b9;font-size:10px}
 .v283ScoreLegend strong{color:#dce9f5}.v283ScoreLegend .note{flex-basis:100%;color:#748ba0}
 .v283HoursChip b.good{color:#75e5b2}.v283HoursChip b.yellow{color:#e8c77b}.v283HoursChip b.bad{color:#f0a0aa}
 @media(max-width:700px){.v283Research{margin-left:4px;padding:4px 6px;gap:4px}.v283Research b{font-size:9px}.v283Research small{font-size:8px}.v283ScoreLegend{font-size:9px}}
 `;document.head.appendChild(s);
}

function ensureLegends(){
 document.querySelectorAll('.researchScoreLegend').forEach(x=>x.style.display='none');
 const help=document.querySelector('#signals .candidateHelp');
 if(help&&!document.querySelector('[data-v283-score-legend="candidates"]'))help.insertAdjacentHTML('afterend',`<div class="v283ScoreLegend" data-v283-score-legend="candidates"><strong>Research-Score 0–100</strong><span>72–100 Kaufbereit*</span><span>64–71 Bestätigen</span><span>58–63 Beobachten</span><span>40–57 Aufbau</span><span>0–39 Schwach</span><span class="note">* nur ohne echten Hard-Block. Die sichtbare Bewertung nutzt jetzt diesen Research-Score – nicht mehr den alten Scanner-Rohscore.</span></div>`);
 const pt=document.querySelector('#positions .cardTitle');
 if(pt&&!document.querySelector('[data-v283-score-legend="positions"]'))pt.insertAdjacentHTML('afterend',`<div class="v283ScoreLegend" data-v283-score-legend="positions"><strong>Research-Score der Positionen</strong><span>zeigt die aktuelle/zuletzt gemessene Setup-Stärke</span><span class="note">Kein automatisches SELL-Signal: Exit-Entscheidung bleibt bei Trade-Maturity/Recovery und V28.2 Winner-Protection.</span></div>`);
}

function applyScores(){
 if(applying||!latestStatus)return;applying=true;
 try{
  ensureStyles();ensureLegends();const maps=policyMaps(latestStatus);
  document.querySelectorAll('#candidatesBody tr').forEach(tr=>{
   const sym=norm(tr.querySelector('.candidateSymbol')?.textContent||tr.querySelector('.candidateName')?.textContent);
   if(!sym)return;const row=maps.ranking.get(sym);const first=tr.querySelector('.candidateIdentity')||tr.cells?.[0];
   if(first){first.querySelectorAll('.v283Research').forEach(x=>x.remove());first.insertAdjacentHTML('beforeend',scoreHtml(row));}
   const ratingCell=tr.cells?.[1];if(ratingCell){ratingCell.innerHTML=scoreHtml(row,{compact:true});ratingCell.dataset.v283Research='1';}
  });
  document.querySelectorAll('#positionCards .positionCard').forEach(card=>{
   const host=card.querySelector('.positionSymbol');if(!host)return;const sym=norm(host.firstChild?.textContent||host.textContent);const row=maps.positions.get(sym);
   host.querySelectorAll('.v283Research').forEach(x=>x.remove());host.insertAdjacentHTML('beforeend',scoreHtml(row));
  });
  document.querySelectorAll('#positionsBody tr').forEach(tr=>{
   const cell=tr.cells?.[0],sym=norm(cell?.querySelector('b')?.textContent);if(!cell||!sym)return;const row=maps.positions.get(sym);
   cell.querySelectorAll('.v283Research').forEach(x=>x.remove());cell.insertAdjacentHTML('beforeend',scoreHtml(row));
  });
 }finally{applying=false;}
}

const CLOSED_2026=new Set(['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31']);
function berlin(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),o={};for(const x of p)o[x.type]=x.value;
 return{ymd:`${o.year}-${o.month}-${o.day}`,weekday:o.weekday,minute:Number(o.hour)*60+Number(o.minute)};
}
function hoursState(){
 const p=berlin(),day=!['Sat','Sun'].includes(p.weekday)&&!CLOSED_2026.has(p.ymd),m=p.minute;
 if(!day)return{text:'Geschlossen · nächster Börsentag 07:30',cls:'bad'};
 if(m>=7*60+25&&m<7*60+30)return{text:'Voranalyse · LIVE ab 07:30',cls:'yellow'};
 if(m>=7*60+30&&m<23*60)return{text:'LIVE · bis 23:00',cls:'good'};
 if(m<7*60+25)return{text:'Geschlossen · LIVE ab 07:30',cls:'yellow'};
 return{text:'Geschlossen · nächster Börsentag 07:30',cls:'bad'};
}
function updateHours(){
 ensureStyles();let chip=document.querySelector('.v283HoursChip');
 if(!chip){const strip=document.querySelector('.statusStrip');if(!strip)return;chip=document.createElement('div');chip.className='statusChip v283HoursChip';chip.innerHTML='<span>gettex · Mo–Fr 07:30–23:00</span><b id="v283TradingHours">–</b>';strip.appendChild(chip);}
 const x=hoursState(),b=chip.querySelector('b');if(b){b.textContent=x.text;b.className=x.cls;b.title='finanzen.net ZERO / gettex · Europe/Berlin · Voranalyse ab 07:25 · automatisches Trading 07:30–23:00 an Handelstagen';}
}

const changelogEntries=[
 {at:'20.08.2026 · 18:25',title:'V28.3 · Score-Anzeige, Börsenzeiten und Main=Live abgesichert',items:['Die sichtbare Kandidaten-Bewertung verwendet jetzt den Research-Fusion-Score statt des alten Scanner-Rohscores. Dadurch entsteht nicht mehr fälschlich überall „Schwach“.','Research-Score steht sichtbar direkt bei Kandidaten und offenen Positionen; fehlt noch eine Research-Messung, steht „Noch kein Score“ statt einer falschen Schwach-Bewertung.','Neue UI-Legende: 72+ Kaufbereit, 64–71 Bestätigen, 58–63 Beobachten, 40–57 Aufbau, 0–39 Schwach. Die Kaufgrenzen selbst werden dadurch nicht gelockert.','gettex-Handelszeit wird im Kopfbereich angezeigt: Mo–Fr 07:30–23:00 Europe/Berlin, Voranalyse ab 07:25; während der Börsenzeit steht LIVE bis 23:00.','Ein zusätzlicher Main-Live-Enforcer kontrolliert künftig auch Main-Änderungen außerhalb der bisherigen Deploy-Pfade, damit GitHub-Stand und Cloudflare-Live-Stand nicht wieder auseinanderlaufen.']},
 {at:'20.08.2026',title:'V28.2 · Relative Opportunity Learning',items:['Jeder geplante Kauf wird mit der besten gleichzeitig verfügbaren Alternative verglichen.','Wiederholt bessere ausgelassene Setups erzeugen Selection-Regret-Lernen und werden künftig höher priorisiert.','Profitable Positionen mit weiterhin starkem Research-Setup werden gegen weiche/noisy Profit-Exits geschützt.']},
 {at:'20.08.2026',title:'V28.1 · Research Signal Fusion',items:['Momentum, Volumen, Pullback/Reclaim, frische News, 52-Wochen-Hoch, Multi-Scan, Marktregime und Forward-Lernen werden in einem 0–100 Research-Score zusammengeführt.','Weiche Einzelbedingungen blockieren gute Chancen nicht mehr allein; echte Daten-, Venue-, Event-, starke Negativ- und Kostenrisiken bleiben Hard-Blocks.','Research-Score wird für potenzielle Käufe und aktive Positionen gespeichert.']},
 {at:'20.08.2026',title:'V28.0 · Trade Maturity',items:['Gute Setups werden über mehrere Scans früher erkannt.','Neue Positionen erhalten eine gelernte Reifezeit und ein Recovery-Fenster, damit normales Anfangsminus nicht sofort zum Verkauf führt.','Harte Risiken und echte schwere Strukturbrüche dürfen weiterhin sofort schließen; Post-Exit-Rebounds trainieren die Haltedauer.']},
 {at:'20.08.2026',title:'V27.9 · Opportunity Learning',items:['Ausgelassene gute Chancen bleiben im Gedächtnis statt nach einem HOLD vergessen zu werden.','Frische Katalysatoren und gesunde Reclaims dürfen Starter-Käufe auslösen; Idle Cash kann für Lernchancen eingesetzt werden.','Verpasste Chancen und vermiedene schlechte Einstiege werden nachträglich ausgewertet.']}
];
function injectChangelog(){
 const list=document.querySelector('#changelogOverlay .changelogList');if(!list||list.querySelector('[data-v283-changelog]'))return;
 list.querySelector('.latest')?.classList.remove('latest');
 for(let i=changelogEntries.length-1;i>=0;i--){const e=changelogEntries[i],a=document.createElement('article');a.className='changelogEntry'+(i===0?' latest':'');a.dataset.v283Changelog='1';a.innerHTML=`<div class="changelogTime">${esc(e.at)}</div><h3>${esc(e.title)}</h3><ul>${e.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;list.prepend(a);}
}

document.addEventListener('planspiel:status',e=>{latestStatus=e.detail||latestStatus;requestAnimationFrame(()=>requestAnimationFrame(applyScores));});
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle'))setTimeout(injectChangelog,0);});
const observer=new MutationObserver(()=>{if(applying)return;requestAnimationFrame(()=>{applyScores();injectChangelog();updateHours();});});
observer.observe(document.documentElement,{childList:true,subtree:true});
ensureStyles();updateHours();ensureLegends();injectChangelog();setInterval(updateHours,30_000);

window.__V283_UI_LIVE__={version:28.3,scoreDisplay:'research-fusion',gettex:'Mo-Fr 07:30-23:00 Europe/Berlin',preopen:'07:25'};
