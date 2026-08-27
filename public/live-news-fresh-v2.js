const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const REFRESH_MS=60_000,MAX_AGE_MS=2*60*60*1000,FUTURE_TOLERANCE_MS=5*60*1000;
let lastPayload=null,inFlight=false;

function exactTime(v,seconds=true){
 const t=Date.parse(String(v||''));if(!Number.isFinite(t))return'Zeit unbekannt';
 return new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})}).format(new Date(t)).replace(',',' ·');
}
function isFresh(v){const t=Date.parse(String(v||'')),now=Date.now();return Number.isFinite(t)&&t<=now+FUTURE_TOLERANCE_MS&&now-t>=-FUTURE_TOLERANCE_MS&&now-t<=MAX_AGE_MS}
function eventLabel(v){const map={REGULATORY_APPROVAL:'Zulassung',REGULATORY_REJECTION:'Ablehnung',GUIDANCE_RAISE:'Prognose ↑',GUIDANCE_CUT:'Prognose ↓','M&A':'M&A',STRATEGIC_STAKE:'Beteiligung',MAJOR_CONTRACT:'Großauftrag',DILUTION_FINANCING:'Kapitalmaßnahme',SEVERE_NEGATIVE:'Risiko',EARNINGS_BEAT:'Zahlen besser',EARNINGS_MISS:'Zahlen schwächer',EARNINGS:'Zahlen',CLINICAL_TRIAL:'Studie',CAPITAL_RETURN:'Ausschüttung'};return map[v]||'News'}
function sourceNames(x){return (Array.isArray(x?.sources)?x.sources:[]).map(s=>String(s?.name||s||'').trim()).filter(Boolean).slice(0,3).join(', ')||'News-Quelle'}
function row(x){
 const imp=Number(x?.importance||0),cls=imp>=88?'veryhigh':imp>=72?'high':'',stocks=(Array.isArray(x?.affected)?x.affected:[]).map(a=>`<button type="button" class="liveNewsStock" data-symbol="${esc(a.symbol)}" data-name="${esc(a.name||a.symbol)}" title="Live-Chart öffnen"><b>${esc(a.symbol)}</b><small>${esc(a.name||a.symbol)}</small></button>`).join(''),headline=x?.url?`<a class="liveNewsHeadline" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.headline)}</a>`:`<div class="liveNewsHeadline">${esc(x?.headline||'')}</div>`;
 return `<article class="liveNewsItem" data-published-at="${esc(x.publishedAt||'')}"><div class="liveNewsImpact ${cls}">${esc(x.importanceLabel||'RELEVANT')}<br>${imp}/100</div><div>${headline}<div class="liveNewsSub"><span>${esc(eventLabel(x.eventType))}</span><span>${esc(exactTime(x.publishedAt))}</span><span>${esc(sourceNames(x))}</span></div></div><div class="liveNewsStocks">${stocks}</div></article>`;
}
function scanLag(ts){const t=Date.parse(String(ts||''));return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/1000)):null}
function render(payload){
 const list=$('liveNewsList'),meta=$('liveNewsMeta'),fresh=$('liveNewsFresh');if(!list||!meta||!fresh)return;
 const items=(Array.isArray(payload?.items)?payload.items:[]).filter(x=>isFresh(x?.publishedAt));
 list.innerHTML=items.length?items.map(row).join(''):'<div class="liveNewsEmpty">Keine verifizierbar höchstens 2 Stunden alte Aktienmeldung gefunden. Ältere Meldungen werden hier bewusst nicht angezeigt.</div>';
 const generated=payload?.generatedAt,sourceScan=payload?.lastSourceScanAt,lag=scanLag(sourceScan),sourceCount=Number(payload?.sourceCount||0),old=Number(payload?.filteredTooOld||0),unknown=Number(payload?.filteredUnknownTime||0),scanState=lag==null?'News-Scan unbekannt':lag>150?`⚠ News-Scan verzögert · ${exactTime(sourceScan)}`:`News-Scan ${exactTime(sourceScan)}`;
 fresh.textContent=`Abruf ${exactTime(generated)}`;
 meta.textContent=`${items.length} Meldungen ≤ 2 h · ${sourceCount||'–'} Quellen · ${scanState} · Feed-Abruf alle 60 s · ${old} zu alte + ${unknown} zeitlich unklare Meldungen ausgefiltert · Aktie antippen → Live-Chart.`;
 const eyebrow=document.querySelector('#liveStockNews .sectionEyebrow');if(eyebrow)eyebrow.textContent='LIVE · 60 SEKUNDEN · MAX. 2 STUNDEN';
 list.dataset.liveFreshV2='1';
}
async function load(){
 if(document.hidden||inFlight)return;inFlight=true;
 try{const r=await fetch(`/api/news-feed?fresh=2h&t=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}}),j=await r.json();if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP ${r.status}`);lastPayload=j;render(j)}catch(e){const fresh=$('liveNewsFresh'),meta=$('liveNewsMeta');if(fresh)fresh.textContent='Feed gestört';if(meta)meta.textContent=`Live-News-Abruf fehlgeschlagen: ${e.message} · nächster Versuch automatisch in 60 s.`}finally{inFlight=false}
}
function radarSources(v){if(Array.isArray(v))return v.join(' + ');try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x.join(' + '):String(v||'–')}catch{return String(v||'–')}}
function trendClass(v){return v==='BULLISH'?'bullish':v==='BEARISH'?'bearish':'neutral'}
function renderStrictRadar(s={}){
 const body=$('newsRadarBody');if(!body)return;const rows=(Array.isArray(s.newsRadar)?s.newsRadar:[]).filter(n=>isFresh(n?.newsAt??n?.news_at));
 const table=body.closest('table'),ths=table?.querySelectorAll('thead th');if(ths?.[3])ths[3].textContent='Zeitpunkt';
 body.innerHTML=rows.length?rows.map(n=>`<tr><td><b>${esc(n.symbol)}</b></td><td><span class="trend ${trendClass(n.tendency)}">${esc(n.tendency||'NEUTRAL')}</span></td><td>${Math.round(Number(n.confidence||0)*100)} %</td><td>${esc(exactTime(n.newsAt??n.news_at))}</td><td>${esc(radarSources(n.sources))}<br><span class="muted">${Number(n.clusterCount??n.cluster_count??0)} Cluster · ${Number(n.confirmationCount??n.confirmation_count??0)} Bestätigungen</span></td><td>${esc(n.headline||'')}</td></tr>`).join(''):'<tr><td colspan="6">Keine News der letzten 2 Stunden. Ältere Meldungen werden ausgeblendet.</td></tr>';
}
function watchOldRenderer(){const list=$('liveNewsList'),meta=$('liveNewsMeta');if(!list||!meta||!('MutationObserver'in window))return;const o=new MutationObserver(()=>{if(!lastPayload)return;const relative=/gerade eben|vor\s+\d+\s*(?:Min|Std|T)/i.test(list.textContent||''),wrongMeta=!String(meta.textContent||'').includes('≤ 2 h');if(relative||wrongMeta)setTimeout(()=>render(lastPayload),0)});o.observe(list,{childList:true,subtree:true});o.observe(meta,{childList:true,subtree:true,characterData:true})}
function start(){load();watchOldRenderer();setInterval(load,REFRESH_MS)}
document.addEventListener('planspiel:status',e=>renderStrictRadar(e.detail||{}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.__LIVE_NEWS_FRESH_V2__={maxAgeMinutes:120,refreshSeconds:60,exactTimestamp:true,separateFeedAndSourceScanTimes:true};
