const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_RADAR_ROWS=40;

function exactTime(v,seconds=true){
 const t=Date.parse(String(v||''));if(!Number.isFinite(t))return'Zeit unbekannt';
 return new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})}).format(new Date(t)).replace(',',' ·');
}
function eventLabel(v){const map={REGULATORY_APPROVAL:'Zulassung',REGULATORY_REJECTION:'Ablehnung',GUIDANCE_RAISE:'Prognose ↑',GUIDANCE_CUT:'Prognose ↓','M&A':'M&A',STRATEGIC_STAKE:'Beteiligung',MAJOR_CONTRACT:'Großauftrag',DILUTION_FINANCING:'Kapitalmaßnahme',SEVERE_NEGATIVE:'Risiko',EARNINGS_BEAT:'Zahlen besser',EARNINGS_MISS:'Zahlen schwächer',EARNINGS:'Zahlen',CLINICAL_TRIAL:'Studie',CAPITAL_RETURN:'Ausschüttung'};return map[v]||'News'}
function sourceNames(x){return (Array.isArray(x?.sources)?x.sources:[]).map(s=>String(s?.name||s||'').trim()).filter(Boolean).slice(0,3).join(', ')||'News-Quelle'}
function row(x){
 const imp=Number(x?.importance||0),cls=imp>=88?'veryhigh':imp>=72?'high':'',stocks=(Array.isArray(x?.affected)?x.affected:[]).map(a=>`<button type="button" class="liveNewsStock" data-symbol="${esc(a.symbol)}" data-name="${esc(a.name||a.symbol)}" title="Live-Chart öffnen"><b>${esc(a.symbol)}</b><small>${esc(a.name||a.symbol)}</small></button>`).join(''),headline=x?.url?`<a class="liveNewsHeadline" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.headline)}</a>`:`<div class="liveNewsHeadline">${esc(x?.headline||'')}</div>`;
 return `<article class="liveNewsItem" data-published-at="${esc(x.publishedAt||'')}"><div class="liveNewsImpact ${cls}">${esc(x.importanceLabel||'RELEVANT')}<br>${imp}/100</div><div>${headline}<div class="liveNewsSub"><span>${esc(eventLabel(x.eventType))}</span><span>${esc(exactTime(x.publishedAt))}</span><span>${esc(sourceNames(x))}</span></div></div><div class="liveNewsStocks">${stocks}</div></article>`;
}
function scanLag(ts){const t=Date.parse(String(ts||''));return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/1000)):null}
function render(payload){
 const list=$('liveNewsList'),meta=$('liveNewsMeta'),fresh=$('liveNewsFresh');if(!list||!meta||!fresh)return;
 const items=(Array.isArray(payload?.items)?payload.items:[]).slice(0,MAX_RADAR_ROWS),learning=payload?.learning||{};
 list.innerHTML=items.length?items.map(row).join(''):'<div class="liveNewsEmpty">Noch keine Meldung im aktuellen Radarfenster. Der News-Pfad wartet auf den nächsten Scannerstatus.</div>';
 fresh.textContent=`Status ${exactTime(payload?.generatedAt,false)}`;
 meta.textContent=`${items.length} im Radar · ${Number(learning.totalEvents||0)} im Lernspeicher · ${Number(learning.evaluatedEvents||0)} mit Kursreaktion ausgewertet · keine zusätzliche Feed-Abfrage · Aktie antippen → Live-Chart.`;
 const eyebrow=document.querySelector('#liveStockNews .sectionEyebrow');if(eyebrow)eyebrow.textContent='LIVE · GEMEINSAMER SCANNERSTATUS';
 list.dataset.liveFreshV2='1';
}
function renderStatusFeed(s={}){
 const learning=s.newsLearning?.summary||{},items=(Array.isArray(s.newsRadar)?s.newsRadar:[]).filter(x=>x?.headline).map(x=>{const tendency=String(x.tendency||'NEUTRAL').toUpperCase(),confidence=Math.max(0,Math.min(1,Number(x.confidence||0))),sourceValues=Array.isArray(x.sources)?x.sources:[];return{headline:x.headline,publishedAt:x.newsAt??x.news_at,url:x.url||x.link||null,eventType:x.eventType||x.event_type||'NEWS',importance:Math.round(Math.min(100,35+confidence*45+Number(x.confirmationCount??x.confirmation_count??0)*5)),importanceLabel:tendency==='BEARISH'?'RISIKO':tendency==='BULLISH'?'POSITIV':'PRÜFEN',sources:sourceValues.map(source=>typeof source==='object'?source:{name:String(source)}),affected:x.symbol?[{symbol:x.symbol,name:x.name||x.symbol}]:[]}});
 render({items,generatedAt:s.config?.last_scan||s.newsLearning?.updatedAt||new Date().toISOString(),learning});
}
function radarSources(v){if(Array.isArray(v))return v.join(' + ');try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x.join(' + '):String(v||'–')}catch{return String(v||'–')}}
function trendClass(v){return v==='BULLISH'?'bullish':v==='BEARISH'?'bearish':'neutral'}
function renderStrictRadar(s={}){
 const body=$('newsRadarBody');if(!body)return;const rows=(Array.isArray(s.newsRadar)?s.newsRadar:[]).slice(0,MAX_RADAR_ROWS);
 const table=body.closest('table'),ths=table?.querySelectorAll('thead th');if(ths?.[3])ths[3].textContent='Zeitpunkt';
 body.innerHTML=rows.length?rows.map(n=>`<tr><td><b>${esc(n.symbol)}</b></td><td><span class="trend ${trendClass(n.tendency)}">${esc(n.tendency||'NEUTRAL')}</span></td><td>${Math.round(Number(n.confidence||0)*100)} %</td><td>${esc(exactTime(n.newsAt??n.news_at))}</td><td>${esc(radarSources(n.sources))}<br><span class="muted">${Number(n.clusterCount??n.cluster_count??0)} Cluster · ${Number(n.confirmationCount??n.confirmation_count??0)} Bestätigungen</span></td><td>${esc(n.headline||'')}</td></tr>`).join(''):'<tr><td colspan="6">Noch keine Meldung im aktuellen Radarfenster.</td></tr>';
}
document.addEventListener('planspiel:status',e=>{const s=e.detail||{};renderStatusFeed(s);renderStrictRadar(s)});
window.__LIVE_NEWS_FRESH_V2__={statusOnly:true,maxRadarRows:MAX_RADAR_ROWS,exactTimestamp:true,noExtraFeedRequests:true};
