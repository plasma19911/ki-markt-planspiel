const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const REFRESH_MS=60000;
let chartSymbol='',chartName='',chartRange='1d',chartTimer=null;

function installLiveNewsStyle(){
 if($('liveNewsStyle'))return;
 const s=document.createElement('style');s.id='liveNewsStyle';s.textContent=`
 #liveStockNews{grid-column:1/-1!important;min-width:0;position:relative;overflow:hidden;border:1px solid rgba(82,132,168,.28);background:linear-gradient(145deg,rgba(9,26,40,.98),rgba(7,18,29,.98));box-shadow:0 18px 45px rgba(0,0,0,.16)}
 #liveStockNews:before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,rgba(73,177,235,.8),rgba(74,220,164,.55),transparent);pointer-events:none}
 #liveStockNews .liveNewsHead{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:2px}
 #liveStockNews .liveNewsTitleWrap{display:flex;align-items:center;gap:10px;min-width:0}
 #liveStockNews .liveNewsPulse{width:9px;height:9px;border-radius:50%;background:#4bd59b;box-shadow:0 0 0 4px rgba(75,213,155,.10),0 0 14px rgba(75,213,155,.45);flex:0 0 auto}
 #liveStockNews h2{margin:1px 0 0}
 #liveStockNews .liveNewsMeta{font-size:10.5px;margin:5px 0 12px;color:#7890a4}
 #liveStockNews .liveNewsList{display:grid;gap:8px}
 #liveStockNews .liveNewsItem{display:grid;grid-template-columns:72px minmax(0,1fr) minmax(180px,auto);gap:12px;align-items:center;padding:11px 12px;border:1px solid rgba(95,139,171,.16);border-radius:14px;background:linear-gradient(135deg,rgba(15,36,52,.72),rgba(8,23,35,.62));transition:transform .15s ease,border-color .15s ease,background .15s ease}
 #liveStockNews .liveNewsItem:hover{transform:translateY(-1px);border-color:rgba(86,160,207,.38);background:linear-gradient(135deg,rgba(18,44,63,.82),rgba(9,27,40,.72))}
 #liveStockNews .liveNewsImpact{font-size:8.5px;font-weight:850;letter-spacing:.055em;text-align:center;border-radius:999px;padding:6px 7px;background:rgba(71,132,171,.13);border:1px solid rgba(86,153,196,.22);color:#acd1ea;line-height:1.25}
 #liveStockNews .liveNewsImpact.high{color:#f6d58c;background:rgba(151,104,29,.12);border-color:rgba(217,162,62,.28)}
 #liveStockNews .liveNewsImpact.veryhigh{color:#ffadb7;background:rgba(158,48,68,.13);border-color:rgba(224,83,105,.28)}
 #liveStockNews .liveNewsHeadline{font-size:12.5px;font-weight:760;line-height:1.42;color:#eaf3f9}
 #liveStockNews a.liveNewsHeadline{text-decoration:none}#liveStockNews a.liveNewsHeadline:hover{color:#fff;text-decoration:underline;text-decoration-color:rgba(121,190,233,.5);text-underline-offset:3px}
 #liveStockNews .liveNewsSub{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;font-size:9.5px;color:#8299ab}
 #liveStockNews .liveNewsSub span{display:inline-flex;align-items:center;gap:4px}
 #liveStockNews .liveNewsSub span+span:before{content:"•";color:#42637a;margin-right:3px}
 #liveStockNews .liveNewsStocks{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}
 #liveStockNews .liveNewsStock{appearance:none;border:1px solid rgba(77,137,177,.28);background:rgba(12,34,50,.88);color:#e4f2fb;border-radius:999px;padding:6px 10px;cursor:pointer;text-align:left;max-width:190px;transition:background .15s ease,border-color .15s ease,transform .15s ease}
 #liveStockNews .liveNewsStock b{font-size:10px;display:inline;margin-right:5px}.liveNewsStock small{font-size:8px;color:#8fa9bc;display:inline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}
 #liveStockNews .liveNewsStock:after{content:" ↗";font-size:9px;color:#6fbce9}
 #liveStockNews .liveNewsStock:hover{border-color:#579bca;background:rgba(19,54,76,.95);transform:translateY(-1px)}
 #liveStockNews .liveNewsEmpty{padding:20px;text-align:center;color:#8196aa;font-size:12px;border:1px dashed rgba(90,130,160,.2);border-radius:12px}
 #liveStockNews #liveNewsFresh{white-space:nowrap;background:rgba(28,74,98,.45);border-color:rgba(79,151,190,.25)}
 #liveNewsChartModal{position:fixed;inset:0;z-index:10020;background:rgba(1,7,12,.78);backdrop-filter:blur(5px);display:grid;place-items:center;padding:18px}
 #liveNewsChartModal[hidden]{display:none!important}
 #liveNewsChartModal .lnModal{width:min(920px,96vw);max-height:90vh;overflow:auto;background:linear-gradient(155deg,#0b1c2b,#081521);border:1px solid #31506a;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.55);padding:16px}
 #liveNewsChartModal .lnModalHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
 #liveNewsChartModal h3{margin:2px 0 0;font-size:18px}.lnModalSub{font-size:10px;color:#8499ad}
 #liveNewsChartModal .lnClose{border:1px solid #35536c;background:#0b1c2a;color:#dceaf4;border-radius:10px;width:36px;height:36px;cursor:pointer;font-size:19px}
 #liveNewsChartModal .lnRanges{display:flex;gap:6px;margin-bottom:10px}.lnRanges button{border:1px solid #29475f;background:#0c1b29;color:#9fb5c9;border-radius:999px;padding:6px 11px;cursor:pointer;font-size:10px}.lnRanges button.active{background:#143f59;color:#f3fbff;border-color:#4e96c4}
 #liveNewsChartModal .lnCanvasWrap{position:relative;height:300px;border:1px solid rgba(76,109,136,.3);border-radius:14px;background:#07131e;overflow:hidden}
 #liveNewsChartModal canvas{width:100%;height:300px;display:block}.lnChartStatus{position:absolute;inset:0;display:grid;place-items:center;color:#8095a9;font-size:12px;padding:20px;text-align:center;pointer-events:none}.lnChartStatus:empty{display:none}
 #liveNewsChartModal .lnChartMeta{display:flex;gap:14px;flex-wrap:wrap;margin-top:9px;font-size:10px;color:#8ba1b4}.lnChartMeta b{color:#e4eef6}
 @media(max-width:760px){#liveStockNews .liveNewsItem{grid-template-columns:62px minmax(0,1fr);padding:10px}#liveStockNews .liveNewsStocks{grid-column:1/-1;justify-content:flex-start;padding-left:74px}#liveStockNews .liveNewsHead{align-items:flex-start}#liveNewsChartModal{padding:7px}#liveNewsChartModal .lnModal{width:100%;padding:11px}#liveNewsChartModal .lnCanvasWrap,#liveNewsChartModal canvas{height:230px}}
 @media(max-width:480px){#liveStockNews .liveNewsItem{grid-template-columns:1fr;gap:7px;border-radius:12px}#liveStockNews .liveNewsImpact{width:max-content;padding:5px 8px}#liveStockNews .liveNewsStocks{grid-column:auto;padding-left:0;justify-content:flex-start}#liveStockNews .liveNewsStock{max-width:100%;padding:6px 9px}#liveStockNews .liveNewsTitleWrap{align-items:flex-start}#liveStockNews .liveNewsPulse{margin-top:8px}#liveStockNews .liveNewsHead{gap:8px}#liveStockNews #liveNewsFresh{font-size:9px}}
 `;document.head.appendChild(s)
}
function ensureFeed(){
 installLiveNewsStyle();if($('liveStockNews'))return $('liveStockNews');
 const anchor=$('analysis')||$('newsLearning')||$('news')||$('futureCard');if(!anchor)return null;
 const s=document.createElement('section');s.id='liveStockNews';s.className='card';s.innerHTML='<div class="liveNewsHead"><div class="liveNewsTitleWrap"><span class="liveNewsPulse"></span><div><span class="sectionEyebrow">LIVE · 60 SEKUNDEN</span><h2>Wichtigste Aktien-News</h2></div></div><span id="liveNewsFresh" class="tag">lädt …</span></div><div id="liveNewsMeta" class="muted liveNewsMeta">Priorisierte Aktienmeldungen aus dem KI-News-Radar · Aktie antippen für den Live-Chart.</div><div id="liveNewsList" class="liveNewsList"><div class="liveNewsEmpty">News-Feed lädt …</div></div>';
 anchor.insertAdjacentElement('afterend',s);return s;
}
function ensureChartModal(){
 if($('liveNewsChartModal'))return $('liveNewsChartModal');const m=document.createElement('div');m.id='liveNewsChartModal';m.hidden=true;m.innerHTML='<div class="lnModal" role="dialog" aria-modal="true" aria-labelledby="lnChartTitle"><div class="lnModalHead"><div><span class="sectionEyebrow">LIVE-KURS</span><h3 id="lnChartTitle">Aktien-Chart</h3><div id="lnChartSub" class="lnModalSub">–</div></div><button class="lnClose" type="button" aria-label="Schließen">×</button></div><div class="lnRanges"><button type="button" data-range="1d" class="active">1 Tag</button><button type="button" data-range="5d">5 Tage</button><button type="button" data-range="1mo">1 Monat</button></div><div class="lnCanvasWrap"><canvas id="lnChartCanvas"></canvas><div id="lnChartStatus" class="lnChartStatus">Chart lädt …</div></div><div id="lnChartMeta" class="lnChartMeta"></div></div>';document.body.appendChild(m);
 m.querySelector('.lnClose').addEventListener('click',closeChart);m.addEventListener('click',e=>{if(e.target===m)closeChart()});m.querySelector('.lnRanges').addEventListener('click',e=>{const b=e.target.closest('button[data-range]');if(!b)return;chartRange=b.dataset.range;m.querySelectorAll('.lnRanges button').forEach(x=>x.classList.toggle('active',x===b));loadChart()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.hidden)closeChart()});return m;
}
function ageText(v){const t=Date.parse(v||'');if(!Number.isFinite(t))return'Zeit unbekannt';const m=Math.max(0,Math.round((Date.now()-t)/60000));if(m<2)return'gerade eben';if(m<60)return`vor ${m} Min.`;const h=Math.round(m/60);return h<24?`vor ${h} Std.`:`vor ${Math.round(h/24)} T.`}
function eventLabel(v){const map={REGULATORY_APPROVAL:'Zulassung',REGULATORY_REJECTION:'Ablehnung',GUIDANCE_RAISE:'Prognose ↑',GUIDANCE_CUT:'Prognose ↓','M&A':'M&A',STRATEGIC_STAKE:'Beteiligung',MAJOR_CONTRACT:'Großauftrag',DILUTION_FINANCING:'Kapitalmaßnahme',SEVERE_NEGATIVE:'Risiko',EARNINGS_BEAT:'Zahlen besser',EARNINGS_MISS:'Zahlen schwächer',EARNINGS:'Zahlen',CLINICAL_TRIAL:'Studie',CAPITAL_RETURN:'Ausschüttung'};return map[v]||'News'}
function feedRow(x){
 const imp=Number(x.importance||0),cls=imp>=88?'veryhigh':imp>=72?'high':'',sources=(x.sources||[]).map(s=>s.name).filter(Boolean).slice(0,2).join(', ')||'News-Radar',stocks=(x.affected||[]).map(a=>`<button type="button" class="liveNewsStock" data-symbol="${esc(a.symbol)}" data-name="${esc(a.name||a.symbol)}" title="Live-Chart öffnen"><b>${esc(a.symbol)}</b><small>${esc(a.name||a.symbol)}</small></button>`).join('');
 const h=x.url?`<a class="liveNewsHeadline" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.headline)}</a>`:`<div class="liveNewsHeadline">${esc(x.headline)}</div>`;
 return `<article class="liveNewsItem"><div class="liveNewsImpact ${cls}">${esc(x.importanceLabel||'RELEVANT')}<br>${imp}/100</div><div>${h}<div class="liveNewsSub"><span>${esc(eventLabel(x.eventType))}</span><span>${esc(ageText(x.publishedAt))}</span><span>${esc(sources)}</span></div></div><div class="liveNewsStocks">${stocks}</div></article>`
}
async function loadFeed(){
 if(document.hidden)return;const section=ensureFeed();if(!section)return;const list=$('liveNewsList'),meta=$('liveNewsMeta'),fresh=$('liveNewsFresh');
 try{const r=await fetch(`/api/news-feed?t=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json(),items=Array.isArray(j.items)?j.items:[];list.innerHTML=items.length?items.map(feedRow).join(''):'<div class="liveNewsEmpty">Aktuell keine eindeutig aktienbezogene wichtige Meldung im News-Radar.</div>';const t=Date.parse(j.generatedAt||'');fresh.textContent=Number.isFinite(t)?`Stand ${new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}`:'Live';meta.textContent=`${items.length} priorisierte Meldungen · ${j.totalDetected||items.length} erkannt · Aktualisierung jede Minute · Aktie antippen → Live-Chart.`}catch(e){fresh.textContent='Feed gestört';meta.textContent=`Live-News derzeit nicht lesbar: ${e.message}`;list.innerHTML='<div class="liveNewsEmpty">News-Feed wird beim nächsten Minuten-Takt erneut geladen.</div>'}
}
function openChart(symbol,name){chartSymbol=String(symbol||'').toUpperCase();chartName=name||chartSymbol;chartRange='1d';const m=ensureChartModal();m.hidden=false;m.querySelectorAll('.lnRanges button').forEach(x=>x.classList.toggle('active',x.dataset.range==='1d'));document.body.style.overflow='hidden';loadChart();if(chartTimer)clearInterval(chartTimer);chartTimer=setInterval(loadChart,REFRESH_MS)}
function closeChart(){const m=$('liveNewsChartModal');if(m)m.hidden=true;document.body.style.overflow='';if(chartTimer){clearInterval(chartTimer);chartTimer=null}}
function drawChart(data){
 const canvas=$('lnChartCanvas'),wrap=canvas?.parentElement;if(!canvas||!wrap)return;const bars=Array.isArray(data?.bars)?data.bars:[],ctx=canvas.getContext('2d'),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(300,wrap.clientWidth),h=Math.max(180,wrap.clientHeight);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(bars.length<2)return;
 const vals=bars.map(x=>Number(x.close)).filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.12,hi*.002),min=lo-pad,max=hi+pad,left=12,right=12,top=14,bottom=22,x=i=>left+i*(w-left-right)/(bars.length-1),y=v=>top+(max-v)*(h-top-bottom)/(max-min||1);
 ctx.strokeStyle='rgba(118,151,178,.18)';ctx.lineWidth=1;for(let i=0;i<4;i++){const yy=top+i*(h-top-bottom)/3;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke()}
 const first=Number(bars[0].close),last=Number(bars.at(-1).close),up=last>=first;ctx.strokeStyle=up?'#4bd59b':'#ff7080';ctx.lineWidth=2;ctx.beginPath();bars.forEach((b,i)=>{const xx=x(i),yy=y(Number(b.close));i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke();
 ctx.fillStyle='#8ca2b5';ctx.font='10px system-ui';ctx.fillText(fmt(hi,hi<10?3:2),left,10);ctx.fillText(fmt(lo,lo<10?3:2),left,h-5);ctx.fillStyle=up?'#4bd59b':'#ff7080';ctx.beginPath();ctx.arc(x(bars.length-1),y(last),3.2,0,Math.PI*2);ctx.fill();
}
async function loadChart(){
 if(!chartSymbol)return;ensureChartModal();const status=$('lnChartStatus'),meta=$('lnChartMeta');$('lnChartTitle').textContent=`${chartName} · ${chartSymbol}`;$('lnChartSub').textContent='Live-Kursdaten · aktualisiert sich bei geöffnetem Chart jede Minute';status.textContent='Chart lädt …';meta.innerHTML='';
 try{const r=await fetch(`/api/position-chart?symbol=${encodeURIComponent(chartSymbol)}&range=${encodeURIComponent(chartRange)}&news=${Date.now()}`,{cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);drawChart(j);status.textContent='';const bars=j.bars||[],first=Number(bars[0]?.close),last=Number(bars.at(-1)?.close),chg=first?((last/first)-1)*100:0,ts=Number(bars.at(-1)?.ts);meta.innerHTML=`<span>Letzter Kurs <b>${fmt(last,last<10?3:2)} ${esc(j.currency||'')}</b></span><span>Zeitraum <b class="${chg>=0?'good':'bad'}">${chg>=0?'+':''}${fmt(chg,2)}%</b></span><span>Datenpunkt <b>${Number.isFinite(ts)?new Date(ts).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–'}</b></span><span>Börse <b>${esc(j.exchange||'–')}</b></span>`}catch(e){status.textContent=`Live-Chart nicht verfügbar: ${e.message}`}
}
function ensureSection(){
 if($('newsLearning'))return $('newsLearning');const news=$('news');if(!news)return null;const s=document.createElement('section');s.id='newsLearning';s.className='card';s.innerHTML='<div class="cardTitle"><h2>Gelernte News-Wirkung</h2><span class="tag">Quelle × Ereignis</span></div><div id="newsLearningMeta" class="muted">Lernphase startet mit neuen Meldungen.</div><div class="tableWrap"><table><thead><tr><th>Quelle / Typ</th><th>Samples</th><th>Treffer</th><th>Ø abnormal</th><th>Wirkungs-Score</th></tr></thead><tbody id="newsLearningBody"></tbody></table></div><div class="notice">Gemessen wird die anschließende Kursreaktion relativ zum Weltmarkt ACWI nach Handelszeit. Das zeigt historische statistische Wirkung – nicht bewiesene Kausalität und keine Garantie für die nächste Meldung.</div>';news.insertAdjacentElement('afterend',s);return s;
}
function rows(list,prefix=''){if(!list?.length)return '';return list.map(x=>`<tr><td><b>${esc(prefix+x.key)}</b></td><td>${Number(x.samples||0)}</td><td>${fmt(Number(x.hitRate||0)*100,0)}%</td><td class="${Number(x.avgAlignedPct)>=0?'good':'bad'}">${Number(x.avgAlignedPct)>=0?'+':''}${fmt(x.avgAlignedPct,2)}%</td><td><b>${fmt(x.reliabilityScore,0)}/100</b></td></tr>`).join('')}
async function loadLearning(){
 if(document.hidden)return;const section=ensureSection();if(!section)return;const meta=$('newsLearningMeta'),body=$('newsLearningBody');try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),l=s.newsLearning,sm=l?.summary;if(!l||!sm){meta.textContent='Noch keine News-Wirkungshistorie. Nach neuen Meldungen beginnt die kausale Auswertung.';body.innerHTML='<tr><td colspan="5">Lernphase noch nicht gestartet.</td></tr>';return}meta.textContent=`${sm.evaluatedEvents||0} Meldungen bereits ausgewertet · ${sm.pendingEvents||0} noch offen · Benchmark ${l.benchmark||'ACWI'} · ${sm.notice||''}`;const html=rows(sm.topSources||[],'Quelle: ')+rows(sm.topTypes||[],'Typ: ');body.innerHTML=html||'<tr><td colspan="5">Noch zu wenige 6-Stunden-Auswertungen für ein Ranking.</td></tr>'}catch(e){meta.textContent=`News-Lernen derzeit nicht lesbar: ${e.message}`;body.innerHTML='<tr><td colspan="5">–</td></tr>'}
}
function tick(){loadFeed();loadLearning()}
document.addEventListener('click',e=>{const b=e.target.closest?.('.liveNewsStock');if(b)openChart(b.dataset.symbol,b.dataset.name)});
document.addEventListener('DOMContentLoaded',()=>{ensureFeed();ensureChartModal();tick()});
if(document.readyState!=='loading'){ensureFeed();ensureChartModal();tick()}
setInterval(tick,REFRESH_MS);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
