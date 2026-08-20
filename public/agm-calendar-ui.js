const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmtDate=v=>{const t=Date.parse(`${String(v||'').slice(0,10)}T12:00:00Z`);return Number.isFinite(t)?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(new Date(t)):'–'};
const fmtUpdated=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(t)):'–'};
const scoreClass=s=>s>=82?'agmScoreHot':s>=72?'agmScoreGood':s>=58?'agmScoreWatch':s>=43?'agmScoreNeutral':'agmScoreBad';
let lastPayload=null;

function ensureCss(){if(document.querySelector('link[data-agm-calendar-css]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/agm-calendar.css?v=20260820-1428';l.dataset.agmCalendarCss='1';document.head.appendChild(l)}
function ensureUi(){
 ensureCss();
 if(!document.getElementById('agmMiniCalendar')){
  const side=document.querySelector('.sidebar');if(side){const box=document.createElement('section');box.id='agmMiniCalendar';box.className='agmMiniCalendar';box.innerHTML='<div class="agmMiniHead"><div><span>HV-KALENDER</span><b>Hauptversammlungen</b></div><small>Score 0–100</small></div><div class="agmMiniScale">100 = sehr positiver Vorab-Ausblick</div><div class="agmMiniRows"><div class="agmEmpty">Kalender lädt …</div></div><div class="agmMiniFoot">Einmal täglich aktualisiert und neu bewertet</div>';side.appendChild(box)}
 }
 if(!document.getElementById('agmCalendarMobile')){
  const grid=document.querySelector('.dashboardGrid');if(grid){const box=document.createElement('section');box.id='agmCalendarMobile';box.className='card agmCalendarMobile';box.innerHTML='<div class="cardTitle"><div><span class="sectionEyebrow">VORAUSBLICK</span><h2>HV-Kalender</h2></div><span class="tag">0–100</span></div><div class="agmMobileHint">Hauptversammlungen der nächsten Tage. Der Score wird einmal täglich aus Zahlen, Chart und News neu berechnet und bleibt dann bis zum nächsten Tageslauf fest.</div><div class="agmMobileRows"><div class="agmEmpty">Kalender lädt …</div></div><div class="agmMobileMeta muted"></div>';grid.prepend(box)}
 }
}
function rowHtml(x){
 const score=Math.round(num(x?.score,x?.baseScore??50)),eligible=Boolean(x?.tradeEligible),days=Number.isFinite(Number(x?.daysUntil))?Number(x.daysUntil):null,reasons=arr(x?.reasons?.length?x.reasons:x?.fundamentalReasons).join(' · '),label=x?.label||x?.baseLabel||'',name=String(x?.name||x?.sourceCompanyName||x?.symbol||'').replace(/ Registered Shs.*$/i,'').slice(0,34);
 return `<div class="agmRow${eligible?' agmEligible':''}" title="${esc(reasons)}"><time>${esc(fmtDate(x?.date))}</time><div class="agmCompany"><b>${esc(name)}</b><small>${days===0?'heute':days===1?'morgen':days!=null?`in ${days} Tagen`:''}${label?` · ${esc(label)}`:''}</small></div><span class="agmScore ${scoreClass(score)}">${score}</span>${eligible?'<i class="agmBuyHint">Vorab-Kauf prüfbar</i>':''}</div>`;
}
function render(payload){
 ensureUi();lastPayload=payload||lastPayload||{};const rows=arr(lastPayload?.events).filter(x=>{const d=Number(x?.daysUntil);return !Number.isFinite(d)||d>=0}).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||num(b.score,b.baseScore)-num(a.score,a.baseScore));
 const top=rows.slice(0,7),html=top.length?top.map(rowHtml).join(''):'<div class="agmEmpty">Aktuell keine gematchte Hauptversammlung im beobachteten Aktienuniversum.</div>';
 const side=document.querySelector('#agmMiniCalendar .agmMiniRows');if(side)side.innerHTML=html;
 const mobile=document.querySelector('#agmCalendarMobile .agmMobileRows');if(mobile)mobile.innerHTML=html;
 const updated=lastPayload?.scoreEvaluatedAt||lastPayload?.updatedAt||lastPayload?.generatedAt||lastPayload?.sourceUpdatedAt;const meta=`Quelle: ${esc(lastPayload?.source||'finanzen.net Hauptversammlung')} · Tagesbewertung ${esc(fmtUpdated(updated))} · nächste automatische Neubewertung: täglich.`;
 const foot=document.querySelector('#agmMiniCalendar .agmMiniFoot');if(foot)foot.innerHTML=meta;
 const mm=document.querySelector('#agmCalendarMobile .agmMobileMeta');if(mm)mm.innerHTML=meta;
}
async function loadStatic(){try{const r=await fetch(`/agm-calendar.json?v=${new Date().toISOString().slice(0,10)}`,{cache:'no-store'});if(!r.ok)return;const j=await r.json();render({...j,events:arr(j.events).map(x=>({...x,score:num(x.baseScore,50),confidence:num(x.fundamentalConfidence),label:x.baseLabel||'',tradeEligible:false,reasons:x.fundamentalReasons||[]}))})}catch{}}

document.addEventListener('DOMContentLoaded',()=>{ensureUi();loadStatic()});
document.addEventListener('planspiel:status',e=>{const s=e.detail||{},live=s?.agmCalendar;if(live)render(live);else if(!lastPayload)loadStatic()});
setInterval(loadStatic,24*60*60*1000);
