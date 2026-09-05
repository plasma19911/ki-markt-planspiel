const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmtDate=v=>{const t=Date.parse(`${String(v||'').slice(0,10)}T12:00:00Z`);return Number.isFinite(t)?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(new Date(t)):'–'};
const fmtUpdated=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(t)):'–'};
const scoreClass=s=>s>=82?'agmScoreHot':s>=72?'agmScoreGood':s>=58?'agmScoreWatch':s>=43?'agmScoreNeutral':'agmScoreBad';
const REFRESH_MS=15*60*1000;
const STALE_MS=26*60*60*1000;
let lastPayload=null;

function ensureCss(){if(document.querySelector('link[data-agm-calendar-css]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/agm-calendar.css?v=20260820-1447';l.dataset.agmCalendarCss='1';document.head.appendChild(l)}
function removeOldPlacements(){document.getElementById('agmMiniCalendar')?.remove();document.getElementById('agmCalendarMobile')?.remove()}
function ensureUi(){
 ensureCss();removeOldPlacements();
 if(document.getElementById('agmCalendarBottom'))return;
 const live=document.getElementById('livePanel'),grid=live?.querySelector('.dashboardGrid');if(!live||!grid)return;
 const box=document.createElement('section');
 box.id='agmCalendarBottom';box.className='card agmCalendarBottom';
 box.innerHTML='<div class="cardTitle"><div><span class="sectionEyebrow">VORAUSBLICK</span><h2>HV-Kalender</h2></div><span class="tag" id="agmFreshnessTag">Score 0–100 · Stand lädt …</span></div><div class="agmBottomHint">Kommende Hauptversammlungen. Der Score wird einmal täglich aus Zahlen, 1-Jahres-Chart und News neu berechnet und bleibt bis zum nächsten Tageslauf fest.</div><div class="agmBottomRows"><div class="agmEmpty">Kalender lädt …</div></div><div class="agmBottomMeta muted"></div>';
 grid.appendChild(box);
}
function rowHtml(x){
 const score=Math.round(num(x?.score,x?.baseScore??50)),eligible=Boolean(x?.tradeEligible),days=Number.isFinite(Number(x?.daysUntil))?Number(x.daysUntil):null,reasons=arr(x?.reasons?.length?x.reasons:x?.fundamentalReasons).join(' · '),label=x?.label||x?.baseLabel||'',name=String(x?.name||x?.sourceCompanyName||x?.symbol||'').replace(/ Registered Shs.*$/i,'').slice(0,40);
 return `<div class="agmRow${eligible?' agmEligible':''}" title="${esc(reasons)}"><time>${esc(fmtDate(x?.date))}</time><div class="agmCompany"><b>${esc(name)}</b><small>${days===0?'heute':days===1?'morgen':days!=null?`in ${days} Tagen`:''}${label?` · ${esc(label)}`:''}</small></div><span class="agmScore ${scoreClass(score)}">${score}</span>${eligible?'<i class="agmBuyHint">Vorab-Kauf prüfbar</i>':''}</div>`;
}
function render(payload){
 ensureUi();lastPayload=payload||lastPayload||{};const rows=arr(lastPayload?.events).filter(x=>{const d=Number(x?.daysUntil);return !Number.isFinite(d)||d>=0}).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||num(b.score,b.baseScore)-num(a.score,a.baseScore));
 const top=rows.slice(0,7),html=top.length?top.map(rowHtml).join(''):'<div class="agmEmpty">Aktuell keine gematchte Hauptversammlung im beobachteten Aktienuniversum.</div>';
 const bottom=document.querySelector('#agmCalendarBottom .agmBottomRows');if(bottom)bottom.innerHTML=html;
 const updated=lastPayload?.scoreEvaluatedAt||lastPayload?.updatedAt||lastPayload?.generatedAt||lastPayload?.sourceUpdatedAt,t=Date.parse(updated||''),stale=!Number.isFinite(t)||Date.now()-t>STALE_MS;
 const tag=document.getElementById('agmFreshnessTag');if(tag){tag.textContent=`Score 0–100 · ${stale?'VERALTET':'Stand'} ${fmtUpdated(updated)}`;tag.title=stale?'Der HV-Kalender ist älter als 26 Stunden. Der tägliche Datenlauf muss geprüft werden.':'Aktueller Tagesstand des HV-Scores.'}
 const meta=`Quelle: ${esc(lastPayload?.source||'finanzen.net Hauptversammlung')} · Tagesbewertung ${esc(fmtUpdated(updated))} · nächste automatische Neubewertung: täglich · Anzeige prüft alle 15 Minuten auf einen neuen Stand.`;
 const mm=document.querySelector('#agmCalendarBottom .agmBottomMeta');if(mm)mm.innerHTML=meta;
}
async function loadStatic(){try{const r=await fetch(`/agm-calendar.json?v=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}});if(!r.ok)return;const j=await r.json();render({...j,events:arr(j.events).map(x=>({...x,score:num(x.baseScore,50),confidence:num(x.fundamentalConfidence),label:x.baseLabel||'',tradeEligible:false,reasons:x.fundamentalReasons||[]}))})}catch{}}

document.addEventListener('DOMContentLoaded',()=>{ensureUi();loadStatic()});
document.addEventListener('planspiel:status',e=>{const s=e.detail||{},live=s?.agmCalendar;if(live)render(live);else if(!lastPayload)loadStatic()});
setInterval(loadStatic,REFRESH_MS);
