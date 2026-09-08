const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_RADAR_ROWS=40;
const LIVE_WINDOW_HOURS=24;
const OPENING_WINDOW_HOURS=54;

function exactTime(v,seconds=true){
 const t=Date.parse(String(v||''));if(!Number.isFinite(t))return'Zeit unbekannt';
 return new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})}).format(new Date(t)).replace(',',' ·');
}
function radarRank(x={},now=Date.now()){const at=Date.parse(x?.newsAt??x?.news_at??''),hours=Number.isFinite(at)?Math.max(0,(now-at)/3600000):999,confidence=Math.max(0,Math.min(1,Number(x?.confidence||0))),score=Math.abs(Number(x?.news_score??x?.score??0)),confirmations=Number(x?.confirmationCount??x?.confirmation_count??0);return(confidence>0?12:0)+score*22+confidence*28+confirmations*7+Math.max(0,24-hours)*2}
function visibleRadar(rows=[]){const now=Date.now();return rows.filter(x=>{const at=Date.parse(x?.newsAt??x?.news_at??''),hours=Number.isFinite(at)?Math.max(0,(now-at)/3600000):Infinity;return x?.headline&&(hours<=LIVE_WINDOW_HOURS||(Boolean(x.waitingForOpen??x.waiting_for_open)&&hours<=OPENING_WINDOW_HOURS))}).sort((a,b)=>radarRank(b,now)-radarRank(a,now)||(Date.parse(b?.newsAt??b?.news_at??'')||0)-(Date.parse(a?.newsAt??a?.news_at??'')||0)).slice(0,MAX_RADAR_ROWS)}
function radarSources(v){if(Array.isArray(v))return v.join(' + ');try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x.join(' + '):String(v||'–')}catch{return String(v||'–')}}
function trendClass(v){return v==='BULLISH'?'bullish':v==='BEARISH'?'bearish':'neutral'}
function renderStrictRadar(s={}){
 const body=$('newsRadarBody');if(!body)return;const rows=visibleRadar(Array.isArray(s.newsRadar)?s.newsRadar:[]);
 const table=body.closest('table'),ths=table?.querySelectorAll('thead th');if(ths?.[1])ths[1].textContent='Richtung';if(ths?.[2])ths[2].textContent='Einordnung sicher';if(ths?.[3])ths[3].textContent='Zeitpunkt';
 body.innerHTML=rows.length?rows.map(n=>{const assessed=Number(n.confidence)>0,direction=!assessed?'OFFEN':String(n.tendency||'NEUTRAL').toUpperCase()==='NEUTRAL'?'RICHTUNG OFFEN':n.tendency;return `<tr><td><b>${esc(n.symbol)}</b></td><td><span class="trend ${trendClass(n.tendency)}">${esc(direction)}</span></td><td>${assessed?`${Math.round(Number(n.confidence)*100)} %`:'wartet'}</td><td>${esc(exactTime(n.newsAt??n.news_at))}</td><td>${esc(radarSources(n.sources))}<br><span class="muted">${Number(n.clusterCount??n.cluster_count??0)} Ereignisse · ${Number(n.confirmationCount??n.confirmation_count??0)} Artikel im neuesten Ereignis</span></td><td>${esc(n.headline_de||n.headline||'')}</td></tr>`}).join(''):'<tr><td colspan="6">Keine aktuelle Meldung. Ältere Ereignisse bleiben ausschließlich im Lernspeicher.</td></tr>';
}
document.addEventListener('planspiel:status',e=>renderStrictRadar(e.detail||{}));
window.__LIVE_NEWS_FRESH_V2__={radarStatusOnly:true,feedOwner:'news-learning-ui',maxRadarRows:MAX_RADAR_ROWS,liveWindowHours:LIVE_WINDOW_HOURS,openingWindowHours:OPENING_WINDOW_HOURS,exactTimestamp:true,noFakeImportanceScore:true};
