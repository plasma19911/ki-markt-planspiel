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
let resizeTimer=null;

const PAGE_ORGANS=[
  ['#signals','ENTDECKEN','scan'],['.dashboardChart','ERINNERN','learn'],['#futureCard','VORAUSDENKEN','news'],
  ['#positions','HALTEN','trade'],['.dashboardAllocation','VERTEILEN','trade'],['#liveStockNews','NEWS-PULS','news'],
  ['#replayCard','LERNEN','learn'],['.activityCard','HANDELN','trade'],['.dashboardNews','EINORDNEN','news'],
  ['#analysis','VERSTEHEN','scan'],['.dashboardStats','MESSEN','learn'],['.dashboardHealth','ÜBERWACHEN','risk'],
  ['#brain','ABWÄGEN','trade'],['.dashboardHistory','ARCHIVIEREN','learn'],['#setup','STEUERN','risk']
];
const PHASE_ORGANS={pc:['scan'],quotes:['scan'],charts:['scan'],news:['news'],macro:['news'],learning:['learn'],central:['trade']};

function scanFresh(status){
  const config=status?.config||{};
  const stamp=Date.parse(String(config.last_scan||''));
  return Boolean(config.running)&&Number.isFinite(stamp)&&Date.now()-stamp<180_000;
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
  setSource('pc',online?`${finalists||candidates.length} Finalisten · PC online`:'Offline · wartet auf PC-Scanner',online?'ok':'off');

  const quoteCount=candidates.filter(c=>num(c.last_price,num(c.price))>0).length+arr(status.positions).length;
  setSource('quotes',`${quoteCount} Werte · ${config.market_mode==='NEWS_ONLY'?'Börsen zu':'Kurse aktiv'}`,config.market_mode==='NEWS_ONLY'?'warn':'ok');

  const confirmedVolume=candidates.filter(c=>num(c.volume_ratio,num(c.volumeRatio))>=1.15).length;
  setSource('charts',`${confirmedVolume} mit Volumen-Bestätigung · ${candidates.length} geprüft`,candidates.length?'ok':'warn');

  const news=arr(status.newsRadar),policy=status.newsCatalystPolicy||{},decisionRows=decisionNews(status);
  const freshNews=news.filter(item=>{
    const stamp=Date.parse(String(item.news_at||item.ts||''));
    return Number.isFinite(stamp)&&Date.now()-stamp<6*60*60*1000;
  }).length;
  const confirmed=decisionRows.filter(item=>item.positiveConfirmed||item.negativeConfirmed).length;
  const decisionText=decisionRows.length?`${decisionRows.length} geprüft · ${confirmed} kursbestätigt · ${ageLabel(policy.updatedAt)}`:`${news.length} Radar-Meldungen · ${freshNews} frisch`;
  setSource('news',decisionText,policy.refreshError?'warn':decisionRows.length||news.length?'ok':'warn');

  const breadth=status.marketBreadth||status.marketRegime||{};
  const regime=String(breadth.label||breadth.regime||config.market_regime||config.news_tendency_label||'neutral').replaceAll('_',' ');
  const watchCount=arr(status.futureWatch?.candidates).length;
  setSource('macro',`${regime} · ${watchCount} Katalysatoren`,watchCount?'ok':'warn');

  const learning=status.outcomeLearningPolicy||status.predictiveLearningPolicy||status.outcomeLearning||status.shadowLearningPolicy||status.expectancyCorePolicy||{};
  const samples=num(learning.samples,
    num(learning.buySamples,
      num(learning.maturedSamples,
        num(learning.latest?.maturedSamples,num(status.statistics?.closedTrades)))));
  const mode=String(learning.mode||learning.learningMode||config.learning_mode||'lernt').replaceAll('_',' ');
  setSource('learning',`${samples} Samples · ${mode}`,samples?'ok':'warn');
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
  const ranked=[...unique.values()].sort((a,b)=>normalizedScore(b)-normalizedScore(a)).slice(0,5);
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

function decoratePageOrgans(){
  const grid=document.querySelector('.dashboardGrid');
  grid?.classList.add('krakenOrganGrid');
  for(const [selector,label,family] of PAGE_ORGANS){
    const card=document.querySelector(selector);if(!card)continue;
    card.classList.add('krakenOrgan');card.dataset.krakenFamily=family;card.dataset.krakenOrgan=label;
    if(!card.querySelector(':scope > .krakenOrganBadge')){
      const badge=document.createElement('span');badge.className='krakenOrganBadge';badge.textContent=label;card.prepend(badge);
    }
  }
}

function drawPageLinks(){
  const page=$('livePanel'),svg=$('krakenPageLinks'),core=$('krakenCore');
  if(!page||!svg||!core||getComputedStyle(svg).display==='none')return;
  const pageBox=page.getBoundingClientRect(),coreBox=core.getBoundingClientRect(),from={x:coreBox.left+coreBox.width/2-pageBox.left,y:coreBox.bottom-pageBox.top};
  const paths=[...page.querySelectorAll('.krakenOrgan')].map((card,index)=>{
    const box=card.getBoundingClientRect(),right=index%2===1,to={x:(right?box.right:box.left)-pageBox.left,y:box.top+Math.min(44,box.height/2)-pageBox.top},bend=right?Math.max(from.x+90,to.x-70):Math.min(from.x-90,to.x+70),family=card.dataset.krakenFamily||'scan';
    return `<path class="${esc(family)}" d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${bend.toFixed(1)} ${(from.y+70).toFixed(1)}, ${bend.toFixed(1)} ${(to.y-70).toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}"></path>`;
  });
  svg.setAttribute('viewBox',`0 0 ${Math.max(1,pageBox.width)} ${Math.max(1,page.scrollHeight)}`);svg.innerHTML=paths.join('');
}

function pulsePageOrgans(phase){
  document.querySelectorAll('.krakenOrgan.organProcessing').forEach(card=>card.classList.remove('organProcessing'));
  for(const family of PHASE_ORGANS[phase]||[]){
    const cards=[...document.querySelectorAll(`.krakenOrgan[data-kraken-family="${family}"]`)];
    const card=cards[phaseIndex%Math.max(1,cards.length)];card?.classList.add('organProcessing');
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
    if(thought)thought.textContent=latestStatus.config?.running?'Ruhezustand · wartet auf frische Scannerdaten …':'Bereit für den nächsten Planspiel-Start …';
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
  freshness.textContent=fresh?'LIVE · verarbeitet':status.config?.running?`PAUSE · Scan vor ${minutes??'–'} Min.`:'BEREIT · gestoppt';
  freshness.className=`tag ${fresh?'fresh':'stale'}`;
  $('krakenStage').classList.toggle('is-stale',!fresh);
  $('livePanel')?.classList.toggle('krakenDataFresh',fresh);

  renderSources(status);
  renderCore(status);
  renderFocus(status);
  renderNewsFlights(status);
  updateThought();
  requestAnimationFrame(()=>{drawLinks();drawPageLinks()});

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
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{drawLinks();drawPageLinks()},120);
},{passive:true});
setInterval(updateThought,1800);
decoratePageOrgans();
requestAnimationFrame(drawPageLinks);
