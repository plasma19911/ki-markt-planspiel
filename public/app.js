const $=id=>document.getElementById(id);
let currency='EUR',initialized=false;
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=v=>`${fmt(v)} ${currency==='EUR'?'€':'$'}`;
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v,2)}%`;
const dt=s=>s?new Date(s).toLocaleString('de-DE'):'–';
const timeOnly=s=>s?new Date(s).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'–';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
async function api(path,opts={}){const r=await fetch(path,opts);let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}

function drawChart(rows){
 const c=$('chart');if(!c)return;const x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);
 if(!rows?.length){x.fillStyle='#7890a6';x.font='15px sans-serif';x.fillText('Noch keine Depot-Scans.',20,34);return}
 const v=rows.map(r=>num(r.equity)).filter(Number.isFinite);if(!v.length)return;
 const min0=Math.min(...v),max0=Math.max(...v),pad=Math.max(1,(max0-min0)*.14),min=min0-pad,max=max0+pad;
 x.strokeStyle='#173047';x.lineWidth=1;for(let i=1;i<5;i++){const y=i*h/5;x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke()}
 const grad=x.createLinearGradient(0,0,0,h);grad.addColorStop(0,'rgba(75,211,140,.28)');grad.addColorStop(1,'rgba(75,211,140,0)');
 const pts=v.map((n,i)=>({px:12+(v.length===1?0:i/(v.length-1))*(w-24),py:h-18-(n-min)/(max-min)*(h-38)}));
 x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p.px,p.py):x.moveTo(p.px,p.py));x.lineTo(pts.at(-1).px,h-16);x.lineTo(pts[0].px,h-16);x.closePath();x.fillStyle=grad;x.fill();
 x.strokeStyle='#4bd38c';x.lineWidth=3;x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p.px,p.py):x.moveTo(p.px,p.py));x.stroke();
 x.fillStyle='#9eb3c7';x.font='11px sans-serif';x.fillText(`${fmt(max)} – ${fmt(min)} ${currency}`,12,15)
}
function pieColor(i){return `hsl(${(i*137.5+205)%360} 68% 62%)`}
function drawAllocation(ps,cash){
 const c=$('allocationChart');if(!c)return;const x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);
 const items=arr(ps).map(p=>({name:String(p.symbol||''),value:num(p.invested)*(num(p.last_price)/Math.max(.000001,num(p.entry_price)))*(num(p.last_fx,1)/Math.max(.000001,num(p.entry_fx,1)))})).filter(q=>q.value>0);
 if(num(cash)>0)items.push({name:'CASH',value:num(cash)});const total=items.reduce((a,b)=>a+b.value,0);if(!total){$('allocationLegend').innerHTML='';return}
 let a=-Math.PI/2,cx=w/2,cy=h/2,r=Math.min(w,h)*.34,inner=r*.61;
 items.forEach((it,i)=>{const e=a+it.value/total*Math.PI*2;x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,r,a,e);x.closePath();x.fillStyle=pieColor(i);x.fill();a=e});
 x.globalCompositeOperation='destination-out';x.beginPath();x.arc(cx,cy,inner,0,Math.PI*2);x.fill();x.globalCompositeOperation='source-over';x.textAlign='center';x.fillStyle='#edf6ff';x.font='700 20px sans-serif';x.fillText(`${fmt(100-num(cash)/total*100,0)}%`,cx,cy-2);x.fillStyle='#7990a6';x.font='10px sans-serif';x.fillText('investiert',cx,cy+15);x.textAlign='start';
 $('allocationLegend').innerHTML=items.map((it,i)=>`<div class="legendItem"><span class="legendDot" style="background:${pieColor(i)}"></span><span>${esc(it.name)} · ${fmt(it.value/total*100,1)}%</span><b>${money(it.value)}</b></div>`).join('')
}
function trendClass(v){return v==='BULLISH'?'bullish':v==='BEARISH'?'bearish':'neutral'}
function actionClass(a){return a==='KAUF'?'good':a==='VERKAUF'?'yellow':a==='FEHLER'?'bad':''}
function historyTime(h){if(h.action==='HALTEN'){const s=num(h.start_scan),e=num(h.end_scan),sc=s>0?(e>s?`Scan ${s}–${e}`:`Scan ${s}`):'HALTEN';return `${sc}<br><span class="muted">${dt(h.ts)} → ${dt(h.end_ts||h.ts)}</span>`}return dt(h.ts)}
function ageText(n){if(n.waiting_for_open)return 'wartet auf Öffnung';const h=num(n.trading_age_hours,NaN);if(!Number.isFinite(h))return '–';return h<1?`${Math.round(h*60)} Handelsmin.`:`${fmt(h,1)} Handelsstd.`}
function card(label,value,cls=''){return `<div class="mini ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`}
function sourceList(v){try{return JSON.parse(v||'[]').join(' + ')||'–'}catch{return Array.isArray(v)?v.join(' + '):String(v||'–')}}
function typeName(t){return String(t||'EQUITY').toUpperCase()==='ETF'?'ETF':'Aktie'}
function setTab(which){const history=which==='week';$('livePanel').hidden=history;$('weekPanel').hidden=!history;$('liveTabBtn').classList.toggle('active',!history);$('weekTabBtn').classList.toggle('active',history);window.scrollTo({top:0,behavior:'smooth'})}
$('liveTabBtn').onclick=()=>setTab('live');$('weekTabBtn').onclick=()=>setTab('week');

function agentIsOnline(agent){
 if(agent?.online===true||agent?.fresh===true)return true;
 const raw=agent?.lastSeenAt||agent?.last_seen_at||agent?.updatedAt;const t=Date.parse(String(raw||''));return Number.isFinite(t)&&Date.now()-t<180000;
}
function renderHeader(s,c){
 const marketOpen=c.market_mode!=='NEWS_ONLY';$('marketHeaderStatus').textContent=marketOpen?'Market Open':'News Only';$('marketHeaderStatus').className=marketOpen?'good':'yellow';
 const online=agentIsOnline(s.pcAgent);$('pcHeaderStatus').textContent=online?'Online':'Offline';$('pcHeaderStatus').className=online?'good':'bad';
 $('cloudHeaderStatus').textContent='Synchronisiert';$('cloudHeaderStatus').className='good';$('scanHeaderStatus').textContent=timeOnly(c.last_scan);
}
function renderPositionCards(ps){
 const el=$('positionCards');if(!el)return;const rows=arr(ps);
 el.innerHTML=rows.map(p=>{const invested=num(p.invested),value=invested*(num(p.last_price)/Math.max(.000001,num(p.entry_price)))*(num(p.last_fx,1)/Math.max(.000001,num(p.entry_fx,1))),pl=value-invested-num(p.entry_fee),plPct=invested?pl/invested*100:0;return `<article class="positionCard ${pl<0?'loss':''}"><div class="positionHead"><div><div class="positionSymbol">${esc(p.symbol)}</div><div class="positionName">${esc(p.name||'')}</div></div><div class="positionPnl">${pl>=0?'+':''}${fmt(plPct,2)}%</div></div><div class="positionMetrics"><span>Einsatz<b>${money(invested)}</b></span><span>Aktuell<b>${money(value)}</b></span><span>Ø Kauf<b>${fmt(p.entry_price,2)}</b></span><span>Kurs<b>${fmt(p.last_price,2)}</b></span></div></article>`}).join('')||'<div class="emptyState">Keine offene Position.</div>'
}
function scoreClass(v){return num(v)>=5?'':num(v)>=3?'mid':'low'}
function renderCandidates(rows){
 $('candidatesBody').innerHTML=arr(rows).map(x=>`<tr><td><b>${esc(x.symbol)}</b><br><span class="muted">${esc(x.name||'')}</span></td><td><span class="scorePill ${scoreClass(x.score)}">${fmt(x.score,2)}</span></td><td><b>${Math.round(num(x.confidence)*100)}%</b></td><td class="${num(x.day_change)>=0?'good':'bad'}">${pct(x.day_change)}</td><td class="${num(x.news_score)>0?'good':num(x.news_score)<0?'bad':''}">${fmt(x.news_score,2)}</td><td><span class="eventPill ${String(x.event_risk).toUpperCase()==='HIGH'?'high':''}">${esc(x.event_risk||'NONE')}</span><br><span class="muted">${esc(x.event_text||'')}</span></td><td class="good">${esc(x.pro||'–')}</td><td class="bad">${esc(x.contra||'–')}</td></tr>`).join('')||'<tr><td colspan="8">Keine frischen handelbaren Signale.</td></tr>'
}
function renderFutureWatch(s){
 const fw=s.futureWatch||{};const themes=arr(fw.activeThemes).slice(0,7);const candidates=arr(fw.candidates).slice(0,6);
 const chips=$('futureThemeChips');if(chips)chips.innerHTML=themes.length?themes.map(t=>{const id=String(t.id||'');const cls=id.includes('RATE')?'macro':id.includes('DEFENSE')||id.includes('RUSSIA')?'defense':id.includes('CYBER')?'risk':'';return `<span class="themeChip ${cls}">${esc(t.label||t.id||'Thema')} · ${Math.round(num(t.issueStrength))}</span>`}).join(''):'<span class="themeChip">Noch kein starkes Weltthema</span>';
 const list=$('futureCatalystList');if(!list)return;
 list.innerHTML=candidates.length?candidates.map(c=>`<article class="catalystItem"><div class="catalystIcon">↗</div><div><b>${esc(c.symbol)} · ${esc(c.theme||'Katalysator')}</b><p>${esc(c.catalyst||c.reason||'Live-Bestätigung abwarten.')}</p></div><div class="catalystScore">${Math.round(num(c.watchScore))}<br><span>${esc(c.horizon||'')}</span></div></article>`).join(''):'<div class="emptyState">Aktuell kein ausreichend starkes Forward-Signal. News und Termine werden weiter beobachtet.</div>'
}
function replayData(s){const raw=s.dayReplayLearning||s.dayReplay||s.replayLearning||{};const report=raw.report||raw;const summary=report.summary||raw.summary||{};return{raw,report,summary,mistakes:summary.mistakes||{},churn:summary.churn||{}}}
function renderReplay(s){
 const {report,summary,mistakes,churn}=replayData(s);const metric=(name,label,desc)=>`<div class="replayMetric"><span>${label}</span><b>${num(mistakes[name])}</b><small>${desc}</small></div>`;
 $('replaySummary').innerHTML=metric('PEAK_ENTRY','Peak Entry','Zu nah am lokalen Hoch gekauft.')+metric('LATE_EXPENSIVE_ENTRY','Late Entry','Guter Einstieg wurde zu spät genutzt.')+metric('MISSED_SAFE_MOVE','Missed Safe Move','Erkennbares Setup wurde verpasst.')+`<div class="replayMetric"><span>Rotation Churn</span><b>${num(churn.rapidRoundTrips)}</b><small>${num(churn.fees)>0?`${money(churn.fees)} Gebühren in schnellen Wechseln.`:'Schnelle Rotationen werden auf Kosten geprüft.'}</small></div>`;
 const done=String(report.status||'').includes('COMPLETE');const analysed=num(summary.symbolsAnalysed,report.processed);$('replayFocus').textContent=done?`Replay abgeschlossen · ${analysed} Aktien analysiert. Die Learnings fließen konservativ in den nächsten Handelstag ein.`:`Replay sammelt heute Kandidaten und Trades · bisher ${analysed||0} ausgewertet.`
}
function renderActivity(history){
 const el=$('activityTimeline');if(!el)return;const rows=arr(history).slice(0,7);
 el.innerHTML=rows.map(h=>{const a=String(h.action||'').toUpperCase(),sell=a==='VERKAUF',hold=a==='HALTEN',cls=sell?'sell':hold?'hold':'',icon=sell?'S':hold?'•':'B',amount=num(h.amount),value=amount?`${amount>0?'+':''}${money(amount)}`:'';return `<div class="activityItem"><span class="activityTime">${timeOnly(h.ts)}</span><span class="activityDot ${cls}">${icon}</span><div class="activityMain"><b>${esc(a||'EVENT')}</b><span>${esc(h.symbol||String(h.reason||'').slice(0,48)||'Scanner')}</span></div><span class="activityValue">${esc(value)}</span></div>`}).join('')||'<div class="emptyState">Noch keine Aktivität.</div>'
}

async function load(){
 try{
  const s=await api('/api/status'),c=s.config||{},m=s.executionModel||{},st=s.statistics||{},r=s.risk||{};currency=c.currency||'EUR';
  $('statusPill').textContent=c.running?'LIVE · 60 SEK.':'GESTOPPT';$('statusPill').className='pill '+(c.running?'on':'off');renderHeader(s,c);
  $('equity').textContent=money(s.equity);$('cash').textContent=money(c.cash);$('pnl').textContent=`${num(s.pnl)>=0?'+':''}${money(s.pnl)} · ${pct(s.pnl_pct)}`;$('pnl').className=num(s.pnl)>=0?'good':'bad';$('positionCount').textContent=arr(s.positions).length;$('marketMode').textContent=c.market_mode==='NEWS_ONLY'?'NEWS ONLY':'MARKT + NEWS';$('dailyRisk').textContent=pct(r.dailyPct||0);$('dailyRisk').className=num(r.dailyPct)>=0?'good':'bad';
  const equity=Math.max(.0001,num(s.equity)),cash=num(c.cash),invested=Math.max(0,equity-cash);$('cashShare').textContent=`${fmt(cash/equity*100,1)}% des Depotwerts`;$('investedShare').textContent=`${fmt(invested/equity*100,1)}% investiert`;
  $('sideStartCapital').textContent=money(c.start_capital||100);$('sideEquity').textContent=money(s.equity);$('sideCash').textContent=money(c.cash);
  $('endTime').textContent=c.ends_at?`Ende ${dt(c.ends_at)}`:'Live';$('scanInfo').textContent=`Scans ${c.scan_count||0} · Letzter ${dt(c.last_scan)} · Universum ${c.universe_count||'–'} · Gebühren ${money(c.total_fees||0)}`;$('aiSummary').textContent=`KI: ${c.ai_last_summary||'noch keine Marktentscheidung'}`;
  $('executionInfo').textContent=`${money(m.feeFixed??1)} je Kauf/Verkauf · Ausführungspuffer ${fmt(m.slippagePercent??.1,2)}% · nur Aktien · Paper Trading.`;
  if(c.last_error){$('errorBox').style.display='block';$('errorBox').textContent=`Letzter Fehler: ${c.last_error}`}else $('errorBox').style.display='none';
  if(!initialized){$('startCapital').value=c.start_capital||100;$('currency').value=c.currency||'EUR';$('riskMode').value=c.risk_mode||'offensiv';$('aiEnabled').checked=Boolean(c.ai_enabled);$('feeFixed').value=num(c.fee_fixed,1).toFixed(2);$('feePercent').value=num(c.fee_percent,0).toFixed(2);initialized=true}

  renderPositionCards(s.positions);
  $('positionsBody').innerHTML=arr(s.positions).map(p=>{const value=num(p.invested)*(num(p.last_price)/Math.max(.000001,num(p.entry_price)))*(num(p.last_fx,1)/Math.max(.000001,num(p.entry_fx,1))),pl=value-num(p.invested)-num(p.entry_fee);return `<tr><td><b>${esc(p.symbol)}</b><br><span class="muted">${esc(p.name||'')}</span></td><td>${esc(typeName(p.instrument_type))}</td><td>${money(p.invested)}</td><td>${fmt(p.last_fx||1,5)}</td><td>${fmt(p.last_price,3)}</td><td class="${pl>=0?'good':'bad'}">${pl>=0?'+':''}${money(pl)}</td></tr>`}).join('')||'<tr><td colspan="6">Keine offene Position.</td></tr>';
  renderCandidates(s.candidates);renderFutureWatch(s);renderReplay(s);renderActivity(s.history);

  const trend=c.news_tendency_label||'NEUTRAL';$('newsTrendPill').textContent=`${trend} · ${fmt(c.news_tendency_score||0,2)}`;$('newsTrendPill').className=`trend ${trendClass(trend)}`;$('newsTrendSummary').textContent=c.news_tendency_summary||'Noch keine ausreichende Nachrichtenbasis.';$('newsRadarInfo').textContent=c.market_mode==='NEWS_ONLY'?'Börsen geschlossen: News werden weiter gesammelt.':'Offene Märkte: News und aktuelle Kursreaktion werden gemeinsam bewertet.';
  $('newsRadarBody').innerHTML=arr(s.newsRadar).map(n=>`<tr><td><b>${esc(n.symbol)}</b></td><td><span class="trend ${trendClass(n.tendency)}">${esc(n.tendency)}</span></td><td>${Math.round(num(n.confidence)*100)}%</td><td>${ageText(n)}</td><td>${esc(sourceList(n.sources))}<br><span class="muted">${num(n.cluster_count)} Cluster · ${num(n.confirmation_count)} Bestätigungen</span></td><td>${esc(n.headline||'')}<br><span class="muted">${dt(n.news_at)}</span></td></tr>`).join('')||'<tr><td colspan="6">News-Radar sammelt Daten.</td></tr>';

  $('statsGrid').innerHTML=[card('Geschlossene Trades',st.closedTrades||0),card('Trefferquote',`${fmt(st.winRate||0,1)}%`),card('Realisiert',money(st.realizedPnl||0),st.realizedPnl>=0?'good':'bad'),card('Unrealisiert',money(st.unrealizedPnl||0),st.unrealizedPnl>=0?'good':'bad'),card('Profit-Faktor',fmt(st.profitFactor||0,2)),card('Max. Drawdown',pct(st.maxDrawdownPct||0),'bad'),card('Ø Gewinn',money(st.avgWin||0),'good'),card('Ø Verlust',money(st.avgLoss||0),'bad')].join('');
  $('riskBox').textContent=`Verfügbares Cash ${money(r.availableCash??c.cash)} · Tages-P/L ${pct(r.dailyPct||0)} · Pullback/Peak-, Kosten- und Venue-Schutz bleiben aktiv.`;
  $('healthGrid').innerHTML=arr(s.sourceHealth).map(h=>`<div class="healthItem ${String(h.status).toLowerCase()==='ok'?'ok':String(h.status).toLowerCase()==='degraded'?'degraded':'down'}"><b>${esc(h.source)}</b><span>${esc(h.status)}</span><small>${h.fail_count?`${num(h.fail_count)} Fehler · ${esc(h.last_error||'')}`:`OK · ${esc(h.latency_ms??'–')} ms`}</small></div>`).join('')||'<div class="muted">Noch keine Quellenmessung.</div>';
  $('aiLog').innerHTML=arr(s.aiLog).map(x=>`<article class="msg"><div><b>${esc(x.title)}</b>${x.symbol?` · ${esc(x.symbol)}`:''}</div><p>${esc(x.message)}</p><small>${dt(x.ts)}${x.confidence!=null?` · Konfidenz ${Math.round(num(x.confidence)*100)}%`:''}</small></article>`).join('')||'<div class="muted">Noch keine KI-Notizen.</div>';
  $('historyBody').innerHTML=arr(s.history).map(h=>`<tr><td>${historyTime(h)}</td><td class="${actionClass(h.action)}"><b>${esc(h.action)}</b></td><td>${esc(h.symbol||'–')}</td><td>${h.amount?`${h.amount>0?'+':''}${money(h.amount)}`:'–'}</td><td>${h.fee?money(h.fee):'–'}</td><td>${money(h.cash_after)}</td><td>${money(h.equity)}</td><td class="${num(h.total_pnl)>=0?'good':'bad'}">${num(h.total_pnl)>=0?'+':''}${money(h.total_pnl)}</td><td>${esc(h.reason||'')}</td></tr>`).join('')||'<tr><td colspan="9">Noch keine History.</td></tr>';
  drawChart(s.snapshots);drawAllocation(s.positions,c.cash);
 }catch(e){if($('errorBox')){$('errorBox').style.display='block';$('errorBox').textContent=e.message}}
}

$('startBtn').onclick=async()=>{const body={startCapital:num($('startCapital').value),currency:$('currency').value,durationValue:num($('durationValue').value),durationUnit:$('durationUnit').value,riskMode:$('riskMode').value,includeEtfs:false,includeLeverage:false,aiEnabled:$('aiEnabled').checked,feeFixed:num($('feeFixed').value),feePercent:num($('feePercent').value)};try{await api('/api/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});initialized=false;await load()}catch(e){alert(e.message)}};
$('scanBtn').onclick=async()=>{try{await api('/api/scan',{method:'POST'});await load()}catch(e){alert(e.message)}};
$('stopBtn').onclick=async()=>{try{await api('/api/stop',{method:'POST'});await load()}catch(e){alert(e.message)}};
$('resetBtn').onclick=async()=>{if(confirm('Depot, History und KI-Log löschen?')){try{await api('/api/reset',{method:'POST'});initialized=false;await load()}catch(e){alert(e.message)}}};
load();setInterval(load,5000);
