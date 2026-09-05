/*
 * Lebende Daten-Krake fuer das Dashboard.
 * Verwendet ausschliesslich den bereits geladenen Dashboard-Status. Dadurch
 * entstehen keine zusaetzlichen Status-Abfragen und keine Worker-Last.
 */
const $=id=>document.getElementById(id);
const arr=value=>Array.isArray(value)?value:[];
const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const symbolKey=value=>String(value??'').toUpperCase().replace(/\.(DE|AS|PA|L|ST|OL|CO|HE|MI|SW|VI|BR|MC|LS)$/,'');
const money=(value,currency='EUR')=>new Intl.NumberFormat('de-DE',{style:'currency',currency,maximumFractionDigits:2}).format(num(value));
const percent=value=>`${num(value)>=0?'+':''}${num(value).toFixed(2).replace('.',',')} %`;

const PHASES=[
  ['pc','Sammelt den breiten PC-Vorscan …'],
  ['quotes','Nimmt neue Kurse und Bewegungen auf …'],
  ['charts','Prüft Trend, Tempo und Volumen …'],
  ['news','Ordnet neue Meldungen zeitlich ein …'],
  ['macro','Vergleicht Markt, Branche und Makro …'],
  ['learning','Gleicht Kosten und Lernergebnisse ab …'],
  ['central','Priorisiert die stärksten Chancen …'],
  ['central','Wägt Kauf, Halten und Verkauf ab …'],
  ['central','Sortiert Aktien nach aktueller Relevanz …'],
  ['central','Verwertet neue Erkenntnisse im Depot …']
];

let latestStatus=null;
let phaseIndex=0;
let latestSignature='';
let latestFocusSignature='';
let latestNewsSignature='';
let latestPlanktonSignature='';
let resizeTimer=null;
let activeOrganKey='';

const PAGE_ORGANS=[
  ['#signals','ENTDECKEN','scan','signals'],['.dashboardChart','ERINNERN','learn','chart'],['#futureCard','VORAUSDENKEN','news','future'],
  ['#positions','HALTEN','trade','positions'],['.dashboardAllocation','VERTEILEN','trade','allocation'],['#liveStockNews','NEWS-PULS','news','live-news'],
  ['#replayCard','LERNEN','learn','replay'],['.activityCard','HANDELN','trade','activity'],['.dashboardNews','EINORDNEN','news','news'],
  ['#analysis','VERSTEHEN','scan','analysis'],['.dashboardStats','MESSEN','learn','stats'],['.dashboardHealth','ÜBERWACHEN','risk','health'],
  ['#brain','ABWÄGEN','trade','brain'],['.dashboardHistory','ARCHIVIEREN','learn','history'],['#setup','STEUERN','risk','setup'],
  ['#positionTradeChart','CHART-AUGE','scan','trade-chart'],['#newsLearning','NEWS-GEDÄCHTNIS','learn','news-learning'],['#agmCalendarBottom','TERMINSINN','news','agm-calendar'],
  ['#futureWatch','VORAUSFÜHLEN','news','future-watch'],['#freeBudgetPanel','RESSOURCEN','risk','free-budget'],['#orderApproval','FREIGEBEN','trade','order-approval'],
  ['#performanceDiagnostics','DIAGNOSE','learn','performance-diagnostics'],['#zeroBrokerTarget','BROKER-ZIEL','trade','broker-target'],['#macroRadar','UMWELT','news','macro-radar'],
  ['#exposureNetwork','RISIKONETZ','risk','exposure-network']
];
const KPI_SENSES=[
  ['equity','DEPOT-SINN','trade'],['cash','KAPITAL-SINN','risk'],['positionCount','POSITIONS-SINN','learn'],['dailyRisk','RISIKO-SINN','risk'],['marketMode','MARKT-SINN','scan']
];
const EXPANDED_ORGAN_COLUMNS={
  'trade-chart':'1 / -1','news-learning':'span 6','agm-calendar':'1 / -1','future-watch':'1 / -1','free-budget':'1 / -1',
  'order-approval':'1 / -1','performance-diagnostics':'1 / -1','broker-target':'1 / -1','macro-radar':'span 6','exposure-network':'1 / -1'
};
const PHASE_ORGANS={pc:['scan'],quotes:['scan'],charts:['scan'],news:['news'],macro:['news'],learning:['learn'],central:['trade']};
const ORGAN_PREF_KEY='ki-markt-kraken-organs-v1';
const DEFAULT_OPEN_ORGANS=new Set(['signals','chart','positions','live-news','trade-chart']);
let organPreferences={};
let organSyncPending=false;
try{organPreferences=JSON.parse(localStorage.getItem(ORGAN_PREF_KEY)||'{}')||{}}catch{}

function scanFresh(status){
  const config=status?.config||{};
  const stamp=Date.parse(String(config.last_scan||''));
  return Boolean(config.running)&&Number.isFinite(stamp)&&Date.now()-stamp<180_000;
}

function weekendPause(){const day=new Date().getUTCDay();return day===0||day===6}

function renderExpectedWeekendPause(){
  if(!weekendPause())return;
  requestAnimationFrame(()=>{
    const market=$('marketHeaderStatus'),pc=$('pcHeaderStatus'),pill=$('statusPill'),mode=$('marketMode'),bar=$('scannerLiveBar');
    if(market){market.textContent='Wochenendpause';market.classList.remove('good','bad');market.classList.add('yellow')}
    if(pc){pc.textContent='Börsenpause';pc.classList.remove('good','bad');pc.classList.add('yellow')}
    if(pill){pill.textContent='WOCHENENDPAUSE · News bereit';pill.className='pill off'}
    if(mode)mode.textContent='NEWS-BEREIT';
    if(bar){bar.classList.remove('bad','ok');bar.classList.add('warn');const title=bar.querySelector('#scannerLiveTitle'),meta=bar.querySelector('#scannerLiveMeta');if(title)title.textContent='PC-Scanner in Wochenendpause';if(meta)meta.textContent='Planmäßig keine Kurs-Scans · startet wieder zum nächsten Börsenfenster.'}
  });
}

function agentOnline(status){
  const agent=status?.pcAgent||{};
  const stamp=Date.parse(String(agent.lastSeenAt||agent.last_seen_at||agent.updatedAt||''));
  return agent.online===true||agent.fresh===true||(Number.isFinite(stamp)&&Date.now()-stamp<180_000);
}

function normalizedScore(candidate){
  const raw=num(
    candidate?.finalScore,
    num(candidate?.final_score,
      num(candidate?.canonicalScore,
        num(candidate?.canonical_score,
          num(candidate?.score100,num(candidate?.score,num(candidate?.watchScore,0))))))
  );
  return Math.max(0,Math.min(100,raw<=10?raw*10:raw));
}

function candidateQuality(candidate){
  const direct=num(candidate?.dataQualityV317,
    num(candidate?.dataQualityV316,
      num(candidate?.dataQuality,num(candidate?.coverage,0)*100)));
  return direct<=1?direct*100:direct;
}

function setSource(name,text,state='ok'){
  const label=$(`kraken${name[0].toUpperCase()}${name.slice(1)}`);
  if(label)label.textContent=text;
  const node=document.querySelector(`[data-kraken-source="${name}"]`);
  if(node)node.dataset.state=state;
}

function ageLabel(value){
  const stamp=Date.parse(String(value||''));
  if(!Number.isFinite(stamp))return 'noch kein Abruf';
  const minutes=Math.max(0,Math.floor((Date.now()-stamp)/60_000));
  return minutes<1?'gerade aktualisiert':minutes<60?`vor ${minutes} Min.`:`vor ${Math.floor(minutes/60)} Std.`;
}

function decisionNews(status){return arr(status?.newsCatalystPolicy?.symbols).filter(item=>item?.headline)}

function importanceOf(item={}){
  const confirmed=item.positiveConfirmed||item.negativeConfirmed;
  return Math.max(0,Math.min(100,num(item.importance,num(item.impact)*13)+(confirmed?24:0)+(item.negative?8:0)+(item.chaseRisk?7:0)));
}

function newsState(item={}){
  if(item.negativeConfirmed)return{level:'urgent',state:'VERKAUF PRÜFEN',title:`${item.symbol} · negatives Risiko bestätigt`,reason:'Meldung und fallende Marktreaktion stimmen überein.'};
  if(item.negative)return{level:'urgent',state:'KAUF GESPERRT',title:`${item.symbol} · strukturelle Negativ-News`,reason:'Kein Einstieg gegen die Meldung; für einen Verkauf fehlt noch die Kursbestätigung.'};
  if(item.chaseRisk)return{level:'high',state:'NICHT JAGEN',title:`${item.symbol} · positiver Sprung bereits ausgedehnt`,reason:'Die Meldung ist relevant, der Kurs bietet aber gerade keinen sauberen Einstieg.'};
  if(item.positiveConfirmed)return{level:'high',state:'KAUF PRÜFEN',title:`${item.symbol} · News und Kurs bestätigen sich`,reason:'Die Meldung zählt als unabhängige Bestätigung, entscheidet aber nicht allein.'};
  if(item.positive)return{level:'watch',state:'ABWARTEN',title:`${item.symbol} · positive Meldung erkannt`,reason:'Firma und Frische passen; die Marktreaktion bestätigt den Impuls noch nicht.'};
  return{level:'watch',state:'EINORDNEN',title:`${item.symbol} · neue Meldung wird geprüft`,reason:'Die Meldung ist zugeordnet, aber noch kein belastbares Handelssignal.'};
}

function topPriority(status){
  const rows=decisionNews(status).sort((a,b)=>importanceOf(b)-importanceOf(a)||num(a.ageMinutes,999)-num(b.ageMinutes,999));
  if(rows[0])return{type:'news',item:rows[0],...newsState(rows[0])};
  const held=new Set(arr(status.positions).map(position=>symbolKey(position.symbol)));
  const candidate=arr(status.candidates).filter(x=>x?.symbol&&!held.has(symbolKey(x.symbol))).sort((a,b)=>normalizedScore(b)-normalizedScore(a))[0];
  if(candidate){const score=normalizedScore(candidate);return{type:'candidate',item:candidate,level:score>=68?'high':'watch',state:score>=60?'PRÜFEN':'BEOBACHTEN',title:`${candidate.symbol} · ${score.toFixed(1).replace('.',',')}/100`,reason:focusReason(candidate,status)}}
  return null;
}

function setPipeline(states={}){
  document.querySelectorAll('#krakenDecisionPipeline [data-pipeline]').forEach(node=>{
    const state=states[node.dataset.pipeline]||'idle';node.dataset.state=state;
  });
}

function renderCommandDeck(status){
  const top=topPriority(status),priority=$('krakenPriority');
  if(!top){
    priority.dataset.level='idle';$('krakenPriorityTitle').textContent='Wartet auf frische Daten';$('krakenPriorityReason').textContent='Die Krake hebt hier nur bestätigte oder dringende Signale hervor.';$('krakenPriorityState').textContent='RUHE';setPipeline({});
  }else{
    priority.dataset.level=top.level;$('krakenPriorityTitle').textContent=top.title;$('krakenPriorityReason').textContent=top.reason;$('krakenPriorityState').textContent=top.state;
    if(top.type==='news'){
      const item=top.item,confirmed=item.positiveConfirmed||item.negativeConfirmed;
      setPipeline({detect:'done',identity:'done',fresh:num(item.ageMinutes,999)<=num(status.newsCatalystPolicy?.maxAgeMinutes,120)?'done':'warn',reaction:confirmed?'done':'wait',decision:item.negative||item.chaseRisk||confirmed?'done':'wait',learn:'wait'});
    }else setPipeline({detect:'done',identity:'idle',fresh:'idle',reaction:'wait',decision:normalizedScore(top.item)>=60?'wait':'idle',learn:'wait'});
  }
  const learning=status.outcomeLearningPolicy||status.predictiveLearningPolicy||status.unifiedDecisionCorePolicy?.outcomeLearning||{};
  const mode=String(learning.mode||'WARMUP').replaceAll('_',' '),samples=num(learning.matured,num(learning.samples)),buySamples=num(learning.buySamples),newsSamples=num(learning.newsSamples);
  const newsWeight=num(learning.weights?.news,1.8);
  $('krakenLearningMode').textContent=mode;
  $('krakenLearningDetail').textContent=`${samples} Outcomes · ${buySamples} Käufe · ${newsSamples} News-Samples · Gewicht ${newsWeight.toFixed(2).replace('.',',')}`;
}

function positionValue(position){
  const invested=num(position?.invested);
  const entry=Math.max(.000001,num(position?.entry_price,1));
  const fx=num(position?.last_fx,1)/Math.max(.000001,num(position?.entry_fx,1));
  return invested*(num(position?.last_price,entry)/entry)*fx;
}

function positionPnl(position){
  return positionValue(position)-num(position?.invested)-num(position?.entry_fee);
}

function renderSources(status){
  const config=status.config||{};
  const candidates=arr(status.candidates);
  const online=agentOnline(status);
  const agent=status.pcAgent||{};
  const finalists=num(agent.finalists_count,num(agent.finalistCount,num(agent.candidates_count,candidates.length)));
  const weekend=weekendPause();
  setSource('pc',online?`${finalists||candidates.length} Finalisten · PC online`:weekend?'Wochenendpause · startet zum Börsenfenster':'Offline · wartet auf PC-Scanner',online?'ok':weekend?'warn':'off');

  const quoteCount=candidates.filter(c=>num(c.last_price,num(c.price))>0).length+arr(status.positions).length;
  setSource('quotes',`${quoteCount} Werte · ${config.market_mode==='NEWS_ONLY'?'Börsen zu':'Kurse aktiv'}`,config.market_mode==='NEWS_ONLY'?'warn':'ok');

  const confirmedVolume=candidates.filter(c=>num(c.volume_ratio,num(c.volumeRatio))>=1.15).length;
  setSource('charts',`${confirmedVolume} mit Volumen-Bestätigung · ${candidates.length} geprüft`,candidates.length?'ok':'warn');

  const news=arr(status.newsRadar),policy=status.newsCatalystPolicy||{},decisionRows=decisionNews(status);
  const freshNews=news.filter(item=>{
    const stamp=Date.parse(String(item.news_at||item.ts||''));
    return Number.isFinite(stamp)&&Date.now()-stamp<6*60*60*1000;
  }).length;
  const confirmed=decisionRows.filter(item=>item.positiveConfirmed||item.negativeConfirmed).length,pipeline=policy.pipeline||{};
  const decisionText=decisionRows.length?`${num(pipeline.companyMatched,decisionRows.length)} Firmen · ${confirmed} kursbestätigt · ${num(pipeline.blocked)} geschützt · ${ageLabel(policy.updatedAt)}`:`${news.length} Radar-Meldungen · ${freshNews} frisch`;
  setSource('news',decisionText,policy.refreshError?'warn':decisionRows.length||news.length?'ok':'warn');

  const breadth=status.marketBreadth||status.marketRegime||{};
  const regime=String(breadth.label||breadth.regime||config.market_regime||config.news_tendency_label||'neutral').replaceAll('_',' ');
  const watchCount=arr(status.futureWatch?.candidates).length;
  setSource('macro',`${regime} · ${watchCount} Katalysatoren`,watchCount?'ok':'warn');

  const learning=status.outcomeLearningPolicy||status.predictiveLearningPolicy||status.outcomeLearning||status.shadowLearningPolicy||status.expectancyCorePolicy||{};
  const samples=num(learning.matured,num(learning.samples,num(learning.maturedSamples,num(learning.latest?.maturedSamples,num(status.statistics?.closedTrades)))));
  const buySamples=num(learning.buySamples);
  const mode=String(learning.mode||learning.learningMode||config.learning_mode||'lernt').replaceAll('_',' ');
  setSource('learning',`${samples} Outcomes · ${buySamples} Käufe · ${mode}`,samples?'ok':'warn');
}

function renderCore(status){
  const config=status.config||{};
  const currency=config.currency||'EUR';
  const positions=arr(status.positions);
  $('krakenEquity').textContent=money(status.equity,currency);
  $('krakenPnl').textContent=`P/L ${percent(status.pnl_pct)}`;
  $('krakenPnl').classList.toggle('loss',num(status.pnl)<0);
  $('krakenPositionCount').textContent=`${positions.length} Position${positions.length===1?'':'en'}`;
  $('krakenCash').textContent=`Cash ${money(config.cash,currency)}`;
  $('krakenHoldings').innerHTML=positions.length?positions.slice(0,6).map(position=>{
    const pnl=positionPnl(position);
    const pct=num(position.invested)?pnl/num(position.invested)*100:0;
    return `<span class="${pnl<0?'loss':''}" title="${esc(position.name||position.symbol)}: ${esc(percent(pct))}">${esc(position.symbol)} ${esc(percent(pct))}</span>`;
  }).join(''):'<span>100 % Cash</span>';
}

function focusLabel(score){
  if(score>=76)return 'TOP-PRIORITÄT';
  if(score>=68)return 'SEHR INTERESSANT';
  if(score>=60)return 'KAUFZONE';
  if(score>=55)return 'BEOBACHTEN';
  return 'WEITER PRÜFEN';
}

function focusReason(candidate,status){
  const related=arr(status.newsRadar).find(item=>symbolKey(item.symbol)===symbolKey(candidate.symbol));
  const catalyst=decisionNews(status).find(item=>symbolKey(item.symbol)===symbolKey(candidate.symbol));
  const reasons=[];
  if(catalyst?.negative)reasons.push('negative News');
  else if(catalyst?.positiveConfirmed)reasons.push('News + Kurs bestätigt');
  else if(catalyst?.positive)reasons.push(catalyst.chaseRisk?'News-Sprung überdehnt':'News wartet auf Kurs');
  else if(related?.tendency==='BULLISH'||num(candidate.news_score)>0.12)reasons.push('positive News');
  if(num(candidate.volume_ratio,num(candidate.volumeRatio))>=1.15)reasons.push('Volumen bestätigt');
  if(num(candidate.m5,num(candidate.momentum5m))>0)reasons.push('5m steigt');
  if(num(candidate.m20,num(candidate.momentum20m))>0)reasons.push('20m steigt');
  if(!reasons.length&&candidateQuality(candidate)>=55)reasons.push('Datenqualität bestätigt');
  return reasons.slice(0,2).join(' · ')||'weitere Bestätigung fehlt';
}

function renderFocus(status){
  const held=new Set(arr(status.positions).map(position=>symbolKey(position.symbol)));
  const pool=[...arr(status.candidates),...arr(status.futureWatch?.candidates)]
    .filter(candidate=>candidate?.symbol&&!held.has(symbolKey(candidate.symbol)));
  const unique=new Map();
  for(const candidate of pool){
    const key=symbolKey(candidate.symbol);
    if(!unique.has(key)||normalizedScore(candidate)>normalizedScore(unique.get(key)))unique.set(key,candidate);
  }
  const ranked=[...unique.values()].filter(candidate=>normalizedScore(candidate)>=50).sort((a,b)=>normalizedScore(b)-normalizedScore(a)).slice(0,5);
  const list=$('krakenFocusList');
  const signature=JSON.stringify(ranked.map(candidate=>[candidate.symbol,normalizedScore(candidate),focusReason(candidate,status)]));
  if(signature===latestFocusSignature)return;
  latestFocusSignature=signature;
  if(!ranked.length){
    list.innerHTML='<div class="krakenEmpty"><b>Gerade keine neue Aktie im Vordergrund.</b><br>Der Scanner sammelt weiter und zeigt hier nur ausreichend relevante Werte.</div>';
    return;
  }
  list.innerHTML=ranked.map((candidate,index)=>{
    const score=normalizedScore(candidate);
    const heat=score>=68?'veryHot':score>=60?'hot':'';
    return `<article class="krakenFocusCard ${heat}" style="--focus-rank:${index};--focus-score:${score}%">
      <div class="krakenFocusLine"><div class="krakenFocusName"><b>${esc(candidate.symbol)}</b><span>${esc(candidate.name||candidate.theme||'Scanner-Kandidat')}</span></div><div class="krakenFocusScore">${score.toFixed(1).replace('.',',')}<small>/100</small></div></div>
      <div class="krakenFocusReason"><span>${esc(focusReason(candidate,status))}</span><strong>${focusLabel(score)}</strong></div>
      <div class="krakenFocusBar"><i style="width:${score}%"></i></div>
    </article>`;
  }).join('');
}

function renderNewsFlights(status){
  const decisionRows=decisionNews(status).sort((a,b)=>(Boolean(b.positiveConfirmed||b.negativeConfirmed)-Boolean(a.positiveConfirmed||a.negativeConfirmed))||num(b.impact)-num(a.impact));
  const flights=(decisionRows.length?decisionRows:arr(status.newsRadar).filter(item=>item?.headline)).slice(0,3);
  const signature=JSON.stringify(flights.map(item=>[item.symbol,item.publishedAt||item.news_at,item.headline,item.positiveConfirmed,item.negativeConfirmed]));
  if(signature===latestNewsSignature)return;
  latestNewsSignature=signature;
  $('krakenNewsFlights').innerHTML=flights.map(item=>{
    const state=item.negativeConfirmed?'NEGATIV BESTÄTIGT':item.positiveConfirmed?'KURS BESTÄTIGT':item.positive?'WARTET AUF KURS':'';
    return `<span class="newsFlight">${esc(item.symbol)}${state?` · ${state}`:''} · ${esc(String(item.headline).slice(0,66))}</span>`;
  }).join('');
}

function hashText(value=''){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h)}

function renderPlankton(status){
  const policy=status.newsCatalystPolicy||{},rows=decisionNews(status).sort((a,b)=>importanceOf(b)-importanceOf(a));
  const signature=JSON.stringify(rows.map(x=>[x.symbol,x.headline,x.sourceCount,x.positiveConfirmed,x.negativeConfirmed]));
  if(signature===latestPlanktonSignature)return;latestPlanktonSignature=signature;
  const particles=[];
  for(const row of rows.slice(0,6)){
    const count=Math.max(1,Math.min(3,num(row.sourceCount,1))),importance=importanceOf(row),state=row.negative?'danger':row.positiveConfirmed?'hot':row.positive?'warm':'neutral';
    for(let n=0;n<count&&particles.length<12;n++){
      const seed=hashText(`${row.symbol}|${row.headline}|${n}`),lane=seed%7,delay=-((seed%650)/100),scale=(.68+(importance/100)*.58+(n?-.14:0)).toFixed(2),label=n===0&&importance>=45?`${row.symbol} · ${String(row.eventType||'NEWS').replaceAll('_',' ')}`:'';
      particles.push(`<span class="krakenPlankton ${state} ${label?'labeled':''}" style="--lane:${lane};--delay:${delay}s;--scale:${scale}" title="${esc(row.headline)}"><i></i>${label?`<b>${esc(label)}</b>`:''}</span>`);
    }
  }
  const field=$('krakenPlanktonField');field.innerHTML=particles.join('');field.dataset.empty=particles.length?'false':'true';
  field.setAttribute('aria-label',`${particles.length} visualisierte News-Partikel aus ${num(policy.targets)} priorisierten Zielen`);
}

function pointOnBox(box,side,stage){
  return {
    x:(side==='right'?box.right:side==='left'?box.left:box.left+box.width/2)-stage.left,
    y:(box.top+box.height/2)-stage.top
  };
}

function curve(from,to){
  const distance=Math.max(42,Math.abs(to.x-from.x)*.42);
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${(from.x+distance).toFixed(1)} ${from.y.toFixed(1)}, ${(to.x-distance).toFixed(1)} ${to.y.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

function drawLinks(){
  const stage=$('krakenStage');
  const svg=$('krakenLinks');
  const core=$('krakenCore');
  if(!stage||!svg||!core||getComputedStyle(svg).display==='none')return;
  const stageBox=stage.getBoundingClientRect();
  const coreBox=core.getBoundingClientRect();
  const coreIn=pointOnBox(coreBox,'left',stageBox);
  const coreOut=pointOnBox(coreBox,'right',stageBox);
  const inputs=[...stage.querySelectorAll('.krakenNode')].map(node=>curve(pointOnBox(node.getBoundingClientRect(),'right',stageBox),coreIn));
  const outputs=[...stage.querySelectorAll('.krakenFocusCard')].map(card=>({
    path:curve(coreOut,pointOnBox(card.getBoundingClientRect(),'left',stageBox)),
    hot:card.classList.contains('veryHot')
  }));
  svg.setAttribute('viewBox',`0 0 ${Math.max(1,stageBox.width)} ${Math.max(1,stageBox.height)}`);
  svg.innerHTML=inputs.map(path=>`<path d="${path}"></path>`).join('')+outputs.map(item=>`<path class="output${item.hot?' hot':''}" d="${item.path}"></path>`).join('');
}

function slug(value){return String(value||'organ').replace(/([a-z])([A-Z])/g,'$1-$2').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'organ'}

function organDefinition(card){
  const known=PAGE_ORGANS.find(([selector])=>card.matches(selector));
  if(known)return{selector:known[0],label:known[1],family:known[2],key:known[3]};
  const title=String(card.querySelector('h2,h3')?.textContent||card.id||'Auswertung').trim();
  const haystack=`${card.id} ${card.className} ${title}`.toLowerCase();
  let family='scan',label='VERARBEITEN';
  if(/risiko|health|budget|kosten|broker|schutz|exposure/.test(haystack)){family='risk';label='ABSICHERN'}
  else if(/news|meldung|katalysator|kalender|termin|makro|voraus|future/.test(haystack)){family='news';label='EINORDNEN'}
  else if(/lernen|wirkung|performance|statistik|replay|history|archiv/.test(haystack)){family='learn';label='LERNEN'}
  else if(/position|depot|order|kauf|verkauf|handel|allocation|freigabe/.test(haystack)){family='trade';label='HANDELN'}
  return{selector:card.id?`#${card.id}`:'',label,family,key:slug(card.id||title)};
}

function setOrganExpanded(card,expanded,persist=true){
  card.classList.toggle('organCollapsed',!expanded);card.classList.toggle('organExpanded',expanded);
  if(expanded){const preferred=EXPANDED_ORGAN_COLUMNS[card.dataset.krakenKey];if(preferred){card.style.setProperty('grid-column',preferred,'important');card.dataset.krakenGridOverride='1'}else if(card.dataset.krakenGridOverride==='1'){card.style.removeProperty('grid-column');delete card.dataset.krakenGridOverride}}
  else{card.style.setProperty('grid-column',matchMedia('(max-width:1080px)').matches?'1 / -1':'span 3','important');card.dataset.krakenGridOverride='1'}
  const button=card.querySelector(':scope > .cardTitle .krakenOrganToggle,:scope > .liveNewsHead .krakenOrganToggle');
  if(button){button.textContent=expanded?'−':'+';button.setAttribute('aria-expanded',String(expanded));button.title=expanded?'Bereich verkleinern':'Bereich aufklappen'}
  if(persist){organPreferences[card.dataset.krakenKey]=expanded;try{localStorage.setItem(ORGAN_PREF_KEY,JSON.stringify(organPreferences))}catch{}}
  requestAnimationFrame(drawPageLinks);
}

function setAllOrgans(expanded){document.querySelectorAll('.krakenOrgan').forEach(card=>setOrganExpanded(card,expanded,true))}

function enforceCollapsedLayout(){document.querySelectorAll('.krakenOrgan.organCollapsed').forEach(card=>{card.style.setProperty('grid-column',matchMedia('(max-width:1080px)').matches?'1 / -1':'span 3','important');card.dataset.krakenGridOverride='1'})}

function organSummary(status,card){
  const key=card.dataset.krakenKey,candidates=arr(status.candidates),positions=arr(status.positions),policy=status.newsCatalystPolicy||{},learning=status.outcomeLearningPolicy||status.predictiveLearningPolicy||{},top=[...candidates].sort((a,b)=>normalizedScore(b)-normalizedScore(a))[0],confirmed=decisionNews(status).filter(x=>x.positiveConfirmed||x.negativeConfirmed),negative=decisionNews(status).filter(x=>x.negative),currency=status.config?.currency||'EUR';let text='Bereit',importance='quiet';
  if(key==='signals'){text=candidates.length?`${candidates.length} Kandidaten · Spitze ${normalizedScore(top).toFixed(1).replace('.',',')}/100`:'Keine frischen Kandidaten';importance=normalizedScore(top)>=68?'hot':normalizedScore(top)>=60?'watch':'quiet'}
  else if(key==='chart'){text=`${money(status.equity,currency)} · P/L ${percent(status.pnl_pct)}`;importance=num(status.pnl)<0?'warn':'watch'}
  else if(key==='future'){text=`${arr(status.futureWatch?.candidates).length} Katalysatoren · ${String(status.config?.market_regime||'neutral').replaceAll('_',' ')}`}
  else if(key==='positions'){const losers=positions.filter(x=>positionPnl(x)<0).length;text=`${positions.length} Positionen · ${losers} unter Einstand · Cash ${money(status.config?.cash,currency)}`;importance=losers?'watch':'quiet'}
  else if(key==='allocation'){const share=num(status.equity)>0?num(status.config?.cash)/num(status.equity)*100:100;text=`${share.toFixed(1).replace('.',',')} % Cash · ${positions.length} aktive Werte`}
  else if(key==='live-news'||key==='news'){text=`${num(policy.pipeline?.companyMatched,decisionNews(status).length)} Firmenmeldungen · ${confirmed.length} bestätigt · ${negative.length} negativ`;importance=negative.some(x=>x.negativeConfirmed)?'urgent':confirmed.length?'hot':negative.length?'warn':'quiet'}
  else if(key==='replay'){text=`${num(learning.matured)} Outcomes · ${num(learning.buySamples)} Käufe · ${String(learning.mode||'WARMUP').replaceAll('_',' ')}`}
  else if(key==='activity'){const last=arr(status.history).at(-1);text=last?`Letzte Aktion: ${String(last.action||'SCAN')} ${last.symbol||''}`:'Noch keine Aktivität'}
  else if(key==='analysis'){text=`${arr(status.investmentDossiers).length} Unternehmensprofile · ${candidates.length} aktuelle Kandidaten`}
  else if(key==='stats'){text=`Gesamt P/L ${percent(status.pnl_pct)} · nach Kosten`;importance=num(status.pnl)<0?'warn':'watch'}
  else if(key==='health'){text=weekendPause()?'Planmäßige Wochenendpause':agentOnline(status)?'PC-Scanner online · Quellen werden überwacht':'PC-Scanner ohne frischen Kontakt';importance=weekendPause()?'quiet':agentOnline(status)?'watch':'warn'}
  else if(key==='brain'){text=String(arr(status.aiLog).at(-1)?.message||arr(status.aiLog).at(-1)?.text||status.config?.learning_mode||'Entscheidungslog bereit').slice(0,120)}
  else if(key==='history'){text=`${arr(status.history).length} protokollierte Ereignisse · neueste zuerst`}
  else if(key==='setup'){text=`${String(status.config?.risk_mode||'offensiv')} · Paper Trading · ${currency}`}
  else if(key==='trade-chart'){const trades=arr(status.history).filter(x=>/BUY|SELL|KAUF|VERKAUF/i.test(String(x.action||''))).length;text=`${positions.length} offene Positionen · ${trades} Kauf-/Verkaufsmarken`}
  else if(key==='news-learning'){const summary=status.newsLearning?.summary||{};text=`${num(summary.evaluatedEvents,num(learning.newsSamples))} News ausgewertet · ${num(summary.pendingEvents)} noch offen · Gewicht ${num(learning.weights?.news,1.8).toFixed(2).replace('.',',')}`}
  else if(key==='agm-calendar'){const events=arr(status.agmCalendar?.events),eligible=events.filter(x=>x.tradeEligible).length;text=`${events.length} kommende Termine · ${eligible} vorab prüfbar`}
  else if(key==='future-watch'){text=`${arr(status.futureWatch?.candidates).length} Forward-Kandidaten · ${arr(status.futureWatch?.activeThemes).length} aktive Themen`}
  else if(key==='free-budget'){const budget=status.freeTierBudget||{},fetches=budget.lastFetchBudget||{};text=`PC ${agentOnline(status)?'online':'Pause'} · Cloudflare ${num(fetches.actual)}/${num(fetches.cap,budget.externalFetchSoftCap)} Abrufe`}
  else if(key==='order-approval'){text='Planspiel-Freigaben · keine echte Brokerorder'}
  else if(key==='performance-diagnostics'){text=`${arr(status.history).length} Aktionen · Gesamt P/L ${percent(status.pnl_pct)}`;importance=num(status.pnl)<0?'warn':'watch'}
  else if(key==='broker-target'){text='Broker-Ziel getrennt vom Paper Trading · echte Orders gesperrt'}
  else if(key==='macro-radar'){text=`${String(status.marketRegime?.label||status.config?.market_regime||'neutral').replaceAll('_',' ')} · ${arr(status.futureWatch?.activeThemes).length} Themen`}
  else if(key==='exposure-network'){text=`${positions.length} Positionen · Klumpen- und Währungsrisiko wird geprüft`}
  else{text=`${card.querySelector('h2,h3')?.textContent||'Modul'} · bereit zum Aufklappen`}
  card.dataset.importance=importance;return text;
}

function updateOrganSummaries(status){for(const card of document.querySelectorAll('.krakenOrgan')){const summary=card.querySelector(':scope > .krakenOrganSummary');if(summary)summary.textContent=organSummary(status,card)}renderOrganDock()}

function renderOrganDock(){
  const root=$('krakenOrganTiles');if(!root)return;
  const cards=[...document.querySelectorAll('#livePanel .krakenOrgan')],liveKeys=new Set();
  root.querySelector('.krakenDockEmpty')?.remove();
  for(const card of cards){
    const key=card.dataset.krakenKey||slug(card.id),family=card.dataset.krakenFamily||'scan',label=card.dataset.krakenOrgan||'VERARBEITEN',title=String(card.querySelector('h2,h3')?.textContent||label).trim(),summary=String(card.querySelector(':scope > .krakenOrganSummary')?.textContent||'Live-Status wird geladen …').trim();liveKeys.add(key);
    let tile=root.querySelector(`[data-organ-tile="${CSS.escape(key)}"]`);
    if(!tile){tile=document.createElement('button');tile.type='button';tile.className='krakenOrganTile';tile.dataset.organTile=key;tile.innerHTML='<i class="krakenOrganTileNode"></i><div><span></span><b></b><small></small></div><em aria-hidden="true">+</em>';root.appendChild(tile)}
    tile.dataset.krakenFamily=family;tile.dataset.importance=card.dataset.importance||'quiet';tile.title=`${title} groß öffnen`;tile.setAttribute('aria-label',`${title} öffnen: ${summary}`);tile.querySelector('span').textContent=label;tile.querySelector('b').textContent=title;tile.querySelector('small').textContent=summary;
  }
  root.querySelectorAll('.krakenOrganTile').forEach(tile=>{if(!liveKeys.has(tile.dataset.organTile))tile.remove()});
  const count=$('krakenDockCount');if(count)count.textContent=`${cards.length} verbunden`;
}

function closeOrganDetail(){
  const card=document.querySelector('#livePanel .krakenOrgan.organFocused');
  if(card){card.classList.remove('organFocused');card.removeAttribute('role');card.removeAttribute('aria-modal');setOrganExpanded(card,false,false)}
  activeOrganKey='';document.body.classList.remove('krakenOrganDetailOpen');const backdrop=$('krakenOrganBackdrop');if(backdrop)backdrop.hidden=true;requestAnimationFrame(()=>{drawLinks();drawPageLinks()});
}

function openOrganDetail(key){
  const card=[...document.querySelectorAll('#livePanel .krakenOrgan')].find(node=>node.dataset.krakenKey===key);if(!card)return;
  closeOrganDetail();activeOrganKey=key;setOrganExpanded(card,true,false);card.classList.add('organFocused');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');document.body.classList.add('krakenOrganDetailOpen');
  const backdrop=$('krakenOrganBackdrop'),title=String(card.querySelector('h2,h3')?.textContent||card.dataset.krakenOrgan||'Bereich').trim();if(backdrop)backdrop.hidden=false;if($('krakenDetailTitle'))$('krakenDetailTitle').textContent=title;
  requestAnimationFrame(()=>{card.scrollTop=0;card.querySelector('.tableWrap,.chat')?.scrollTo?.({top:0});setTimeout(()=>window.dispatchEvent(new Event('resize')),80)});
}

function decorateOrgan(card,definition=organDefinition(card)){
    if(!card||card.id==='dataFlow')return false;
    const {label,family,key}=definition,wasNew=!card.classList.contains('krakenOrgan');
    card.classList.add('krakenOrgan');card.dataset.krakenFamily=family;card.dataset.krakenOrgan=label;card.dataset.krakenKey=key;
    if(!card.querySelector(':scope > .krakenOrganBadge')){
      const badge=document.createElement('span');badge.className='krakenOrganBadge';badge.textContent=label;const eyebrow=card.querySelector('.sectionEyebrow');if(eyebrow)eyebrow.insertAdjacentElement('afterend',badge);else card.prepend(badge);
    }
    const head=card.querySelector(':scope > .cardTitle,:scope > .liveNewsHead');
    if(head&&!head.querySelector('.krakenOrganToggle')){const button=document.createElement('button');button.type='button';button.className='krakenOrganToggle';button.setAttribute('aria-label',`${label} auf- oder zuklappen`);head.append(button)}
    if(!card.querySelector(':scope > .krakenOrganSummary')){const summary=document.createElement('div');summary.className='krakenOrganSummary';summary.textContent='Live-Zusammenfassung wird geladen …';head?.insertAdjacentElement('afterend',summary)}
    if(wasNew){const expanded=key in organPreferences?organPreferences[key]===true:DEFAULT_OPEN_ORGANS.has(key);setOrganExpanded(card,expanded,false)}
    return wasNew;
}

function decorateSenses(){
  const overview=$('overview');if(!overview)return;
  for(const [valueId,label,family] of KPI_SENSES){
    const card=$(valueId)?.closest('.kpiCard');if(!card)continue;
    card.classList.add('krakenSense');card.dataset.krakenSense=label;card.dataset.krakenFamily=family;card.setAttribute('aria-label',`${label}: ${card.textContent.trim()}`);
  }
}

function normalizeKrakenPlacement(){
  const page=$('livePanel'),grid=page?.querySelector('.dashboardGrid'),bar=$('scannerLiveBar');if(!page||!grid)return;
  grid.classList.add('krakenOrganGrid');
  if(bar){bar.classList.add('krakenScannerNerve');bar.dataset.krakenFamily='scan';if(bar.parentElement!==page)page.insertBefore(bar,$('overview')||page.firstChild)}
  for(const selector of ['#agmCalendarBottom','#positionTradeChart','#newsLearning','#futureWatch','#freeBudgetPanel','#orderApproval','#performanceDiagnostics','#zeroBrokerTarget','#macroRadar','#exposureNetwork']){
    const card=$(selector.slice(1));if(card&&card.parentElement===page)grid.appendChild(card);
  }
}

function updateOrganCount(){
  const count=$('krakenOrganCount');if(!count)return;
  count.textContent=`${document.querySelectorAll('#livePanel .krakenOrgan').length} Organe · ${document.querySelectorAll('#overview .krakenSense').length} Sinne`;
}

function decoratePageOrgans(){
  normalizeKrakenPlacement();decorateSenses();
  for(const [selector,label,family,key] of PAGE_ORGANS)document.querySelectorAll(selector).forEach(card=>decorateOrgan(card,{selector,label,family,key}));
  document.querySelectorAll('#livePanel .dashboardGrid > .card:not(.krakenOrgan)').forEach(card=>decorateOrgan(card));
  if(latestStatus)updateOrganSummaries(latestStatus);
  updateOrganCount();renderOrganDock();requestAnimationFrame(drawPageLinks);
}

function scheduleKrakenSync(){if(organSyncPending)return;organSyncPending=true;requestAnimationFrame(()=>{organSyncPending=false;decoratePageOrgans()})}

function watchDynamicOrgans(){
  const root=document.querySelector('.mainArea');if(!root)return;
  new MutationObserver(mutations=>{
    const relevant=mutations.some(mutation=>[...mutation.addedNodes].some(node=>node.nodeType===1&&(node.matches?.('.card,#scannerLiveBar')||node.querySelector?.('.card,#scannerLiveBar'))));
    if(relevant)scheduleKrakenSync();
  }).observe(root,{childList:true,subtree:true});
}

function drawPageLinks(){
  const page=$('livePanel'),svg=$('krakenPageLinks'),core=$('krakenCore');
  if(!page||!svg||!core||getComputedStyle(svg).display==='none')return;
  const pageBox=page.getBoundingClientRect(),coreBox=core.getBoundingClientRect(),from={x:coreBox.left+coreBox.width/2-pageBox.left,y:coreBox.top+coreBox.height/2-pageBox.top};
  const targets=[...page.querySelectorAll(document.body.classList.contains('krakenOnePager')?'.krakenScannerNerve,.krakenSense,.krakenOrganTile':'.krakenScannerNerve,.krakenSense,.krakenOrgan')];
  const paths=targets.map(card=>{
    const box=card.getBoundingClientRect(),right=box.left+box.width/2>coreBox.left+coreBox.width/2,above=box.bottom<coreBox.top,sense=card.matches('.krakenScannerNerve,.krakenSense'),to=sense?{x:box.left+box.width/2-pageBox.left,y:box.bottom-pageBox.top}:{x:(right?box.left:box.right)-pageBox.left,y:(above?box.bottom:box.top)+Math.min(26,box.height/3)-pageBox.top},midY=(from.y+to.y)/2,family=card.dataset.krakenFamily||'scan';
    return `<path class="${esc(family)}" d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${from.x.toFixed(1)} ${midY.toFixed(1)}, ${to.x.toFixed(1)} ${midY.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}"></path>`;
  });
  svg.setAttribute('viewBox',`0 0 ${Math.max(1,pageBox.width)} ${Math.max(1,page.scrollHeight)}`);svg.innerHTML=paths.join('');
}

function pulsePageOrgans(phase){
  document.querySelectorAll('.krakenOrgan.organProcessing').forEach(card=>card.classList.remove('organProcessing'));
  document.querySelectorAll('.krakenOrganTile.organProcessing').forEach(tile=>tile.classList.remove('organProcessing'));
  document.querySelectorAll('.krakenPageLinks path.active').forEach(path=>path.classList.remove('active'));
  for(const family of PHASE_ORGANS[phase]||[]){
    const cards=[...document.querySelectorAll(`.krakenOrgan[data-kraken-family="${family}"]`)];
    const card=cards[phaseIndex%Math.max(1,cards.length)];card?.classList.add('organProcessing');
    const tiles=[...document.querySelectorAll(`.krakenOrganTile[data-kraken-family="${family}"]`)];tiles[phaseIndex%Math.max(1,tiles.length)]?.classList.add('organProcessing');
    document.querySelectorAll(`.krakenPageLinks path.${family}`).forEach(path=>path.classList.add('active'));
  }
}

function updateThought(){
  if(!latestStatus)return;
  const fresh=scanFresh(latestStatus);
  const thought=$('krakenThought')?.querySelector('span');
  const core=$('krakenCore');
  document.querySelectorAll('.krakenNode.processing').forEach(node=>node.classList.remove('processing'));
  core?.classList.remove('processing');
  if(!fresh){
    pulsePageOrgans('');
    if(thought)thought.textContent=weekendPause()?'Wochenendpause · News und Risiko bleiben bereit …':latestStatus.config?.running?'Ruhezustand · wartet auf frische Scannerdaten …':'Bereit für den nächsten Planspiel-Start …';
    return;
  }
  const [target,text]=PHASES[phaseIndex%PHASES.length];
  if(thought)thought.textContent=text;
  if(target==='central')core?.classList.add('processing');
  else document.querySelector(`[data-kraken-source="${target}"]`)?.classList.add('processing');
  pulsePageOrgans(target);
  phaseIndex=(phaseIndex+1)%PHASES.length;
}

function render(status){
  latestStatus=status;
  const fresh=scanFresh(status);
  const stamp=Date.parse(String(status.config?.last_scan||''));
  const minutes=Number.isFinite(stamp)?Math.max(0,Math.floor((Date.now()-stamp)/60_000)):null;
  const freshness=$('krakenFreshness');
  freshness.textContent=fresh?'LIVE · verarbeitet':weekendPause()?'WOCHENENDPAUSE':status.config?.running?`PAUSE · Scan vor ${minutes??'–'} Min.`:'BEREIT · gestoppt';
  freshness.className=`tag ${fresh?'fresh':'stale'}`;
  $('krakenStage').classList.toggle('is-stale',!fresh);
  $('livePanel')?.classList.toggle('krakenDataFresh',fresh);

  renderSources(status);
  renderCore(status);
  renderFocus(status);
  renderCommandDeck(status);
  renderNewsFlights(status);
  renderPlankton(status);
  decorateSenses();
  updateOrganSummaries(status);
  renderExpectedWeekendPause();
  updateThought();
  requestAnimationFrame(()=>{enforceCollapsedLayout();drawLinks();drawPageLinks()});

  const signature=JSON.stringify([
    status.config?.last_scan,
    arr(status.candidates).slice(0,5).map(candidate=>[candidate.symbol,normalizedScore(candidate)]),
    arr(status.newsRadar).slice(0,3).map(item=>[item.symbol,item.news_at,item.headline])
  ]);
  if(latestSignature&&signature!==latestSignature&&fresh){
    const core=$('krakenCore');
    core.classList.remove('informationPulse');
    void core.offsetWidth;
    core.classList.add('informationPulse');
  }
  latestSignature=signature;
}

document.addEventListener('planspiel:status',event=>render(event.detail||{}));
document.addEventListener('click',event=>{
  const tile=event.target.closest?.('.krakenOrganTile');if(tile){event.preventDefault();openOrganDetail(tile.dataset.organTile);return}
  const close=event.target.closest?.('#krakenDetailClose');if(close){closeOrganDetail();return}
  const backdrop=event.target.closest?.('#krakenOrganBackdrop');if(backdrop&&event.target===backdrop){closeOrganDetail();return}
  const link=event.target.closest?.('a[href^="#"]'),target=link?document.querySelector(link.getAttribute('href')):null;if(link&&target?.classList.contains('krakenOrgan')&&document.body.classList.contains('krakenOnePager')){event.preventDefault();openOrganDetail(target.dataset.krakenKey);return}
  const button=event.target.closest?.('.krakenOrganToggle');if(!button)return;const card=button.closest('.krakenOrgan');if(card?.classList.contains('organFocused'))closeOrganDetail();else if(card)setOrganExpanded(card,card.classList.contains('organCollapsed'),true)
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeOrganKey)closeOrganDetail()});
$('krakenCompactAll')?.addEventListener('click',()=>{closeOrganDetail();setAllOrgans(false)});
$('krakenExpandAll')?.addEventListener('click',()=>setAllOrgans(true));
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{enforceCollapsedLayout();drawLinks();drawPageLinks()},120);
},{passive:true});
setInterval(updateThought,1800);
decoratePageOrgans();
watchDynamicOrgans();
requestAnimationFrame(drawPageLinks);
