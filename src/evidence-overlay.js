import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function styleFromPrompt(prompt){return String(String(prompt).match(/Handelsstil=([^.;\n]+)/)?.[1]||'offensiv').trim().toLowerCase()}
function cashFromPrompt(prompt){return num(String(prompt).match(/Cash\s+([0-9.+-]+)/i)?.[1],0)}
function signalScores(c){
  const m=String(c?.reason||'').match(/BUY\s+([0-9.+-]+)\s*\/\s*SELL\s+([0-9.+-]+)/i);
  if(m)return{buy:num(m[1]),sell:num(m[2])};
  const action=String(c?.fastAction||'HOLD').toUpperCase(),score=num(c?.fastScore);
  if(action==='BUY')return{buy:Math.max(0,score),sell:0};
  if(action==='SELL')return{buy:0,sell:Math.max(0,score)};
  return score>=0?{buy:score,sell:0}:{buy:0,sell:Math.abs(score)};
}
function continuationAllocation(style,confidence,cash){const small=cash>0&&cash<=1500,base=small?(style==='vorsichtig'?16:style==='ausgewogen'?20:24):(style==='vorsichtig'?8:style==='ausgewogen'?12:16);return Math.max(6,Math.min(28,base+(num(confidence)-.65)*8))}
function opportunityAllocation(style,cash){if(cash>0&&cash<=1500)return style==='vorsichtig'?16:style==='ausgewogen'?20:24;return style==='vorsichtig'?8:style==='ausgewogen'?12:16}

export function applyEvidenceDiversity(fast,prompt){
  if(!fast)return fast;
  const candidates=parseJsonBetween(prompt,'Kandidaten=',' Gehalten='),held=parseJsonBetween(prompt,' Gehalten='),cm=new Map((Array.isArray(candidates)?candidates:[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),gap=new Map((fast.gapContext||[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),ratios=fast?.volumeConfirmation?.ratios||{},minVol=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),context=[],evidenceMap=new Map(),continuation=[],opportunities=[],diagnostics={};
  const strongAdx=num(FAST_CALIBRATION.strongAdx,22),minAdx=num(FAST_CALIBRATION.minAdxBuy,18),baseBuy=num(FAST_CALIBRATION.buyThreshold,4.2),qualifiedBuyFloor=Math.max(2.90,baseBuy-1.30),maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8),style=styleFromPrompt(prompt),cash=cashFromPrompt(prompt),idlePortfolio=!Array.isArray(held)||held.length===0;
  for(const c of fast.context||[]){
    const key=String(c.symbol||'').toUpperCase(),raw=cm.get(key)||{},g=gap.get(key),ratio=Object.prototype.hasOwnProperty.call(ratios,key)?ratios[key]:null,tech=c.technical||{},mtf=c.multiTimeframe||{},regional=c.regionalBenchmark||{},pillars=[],hs=signalScores(c);
    const trend=tech.fresh===true&&num(tech.vwapDistancePct)>0&&num(tech.adx)>=minAdx&&num(mtf.longVotes)>=2;
    const momentum=['BREAKOUT','BUILDING'].includes(String(raw.momentumState||''));
    const participation=(ratio!=null&&num(ratio)>=minVol)&&(num(c?.liquidity?.avgVolume)<=0||num(c?.liquidity?.avgVolume)>=15000);
    const relative=num(c.marketRelative20m)>.12||num(c.sectorRelativeDay)>.25||num(regional.relative20m)>.20;
    const catalyst=num(raw.news)>.25||g?.state==='GAP_AND_GO';
    if(trend)pillars.push('TREND_STRUKTUR');if(momentum)pillars.push('MOMENTUM');if(participation)pillars.push('TEILNAHME_VOL');if(relative)pillars.push('RELATIVE_STAERKE');if(catalyst)pillars.push('KATALYSATOR');
    const enough=pillars.length>=3,e={count:pillars.length,pillars,enoughForFastBuy:enough,enoughForQualifiedOpportunity:pillars.length>=2,minimum:3,qualifiedMinimum:2,buyScore:+hs.buy.toFixed(2),sellScore:+hs.sell.toFixed(2)};evidenceMap.set(key,e);

    const spread=c?.liquidity?.spreadPct,avgVolume=num(c?.liquidity?.avgVolume),state=String(raw.momentumState||'NORMAL'),sellSignal=String(raw.momentumSellSignal||'NONE'),nonBearishFast=String(c.fastAction||'HOLD').toUpperCase()!=='SELL',hardSafe=!g?.blockBuy&&!regional?.blockBuy&&c?.fxSafety?.valid!==false&&(spread==null||num(spread)<=maxSpread)&&(avgVolume<=0||avgVolume>=15000)&&sellSignal==='NONE'&&!['REVERSAL','EXHAUSTION'].includes(state);
    const enriched={...c,liveScore:+num(raw.liveScore).toFixed(2),liveConfidence:+num(raw.liveConfidence).toFixed(3),buyScore:+hs.buy.toFixed(2),sellScore:+hs.sell.toFixed(2),evidenceDiversity:e};context.push(enriched);

    const continuationReady=nonBearishFast&&state==='NORMAL'&&hs.buy>=baseBuy+.30&&hs.sell<1.2&&tech.fresh===true&&num(tech.vwapDistancePct)>.10&&num(tech.adx)>=strongAdx&&num(tech.plusDI)>num(tech.minusDI)&&num(mtf.longVotes)>=3&&c.regime!=='TREND_DOWN'&&participation&&enough&&hardSafe;
    if(continuationReady){const confidence=Math.max(.66,Math.min(.86,.60+hs.buy*.04+Math.min(2,e.count)*.015));continuation.push({symbol:c.symbol,action:'BUY',confidence,allocation_pct:+continuationAllocation(style,confidence,cash).toFixed(1),fastScore:+num(c.fastScore,hs.buy-hs.sell).toFixed(2),buyScore:+hs.buy.toFixed(2),sellScore:+hs.sell.toFixed(2),liveScore:+num(raw.liveScore).toFixed(2),reason:`TREND-CONTINUATION: starker ADX ${num(tech.adx).toFixed(0)} · ${num(mtf.longVotes)}/4 Zeitebenen aufwärts · über VWAP · Volumen bestätigt · ${e.count} unabhängige Signalsäulen`,rank:hs.buy+e.count*.25+num(raw.liveScore)*.12+num(c.marketRelative20m)*.2})}

    // Ein bereits vom Fast-Layer erkannter BUY darf nicht verloren gehen, nur weil die
    // nachgelagerte Evidence-Schicht exakt drei statt zwei wirklich unabhängige Säulen sieht.
    // QUALIFIED bleibt technisch streng: frische Daten, über VWAP, ADX, DI, MTF und Hard-Safety.
    const opportunityReady=nonBearishFast&&hs.buy>=qualifiedBuyFloor&&hs.sell<1.35&&tech.fresh===true&&num(tech.vwapDistancePct)>0&&num(tech.adx)>=minAdx&&num(tech.plusDI)>num(tech.minusDI)&&num(mtf.longVotes)>=2&&(c.regime!=='TREND_DOWN'||num(mtf.longVotes)>=3)&&e.enoughForQualifiedOpportunity&&hardSafe&&num(raw.news)>-.35&&num(raw.liveScore)>0&&num(raw.liveConfidence,.45)>=.38;
    if(opportunityReady){const confidence=Math.max(.60,Math.min(.80,.54+hs.buy*.035+e.count*.02+Math.min(2,Math.max(0,num(raw.liveScore)))*.01));opportunities.push({symbol:c.symbol,action:'BUY',confidence,allocation_pct:+opportunityAllocation(style,cash).toFixed(1),fastScore:+num(c.fastScore,hs.buy-hs.sell).toFixed(2),buyScore:+hs.buy.toFixed(2),sellScore:+hs.sell.toFixed(2),liveScore:+num(raw.liveScore).toFixed(2),reason:`QUALIFIED-OPPORTUNITY: BUY-Score ${hs.buy.toFixed(1)} · Scanner-Score ${num(raw.liveScore).toFixed(1)} · ADX ${num(tech.adx).toFixed(0)} · ${num(mtf.longVotes)}/4 Zeitebenen aufwärts · über VWAP · ${e.count} unabhängige Signalsäulen`,rank:hs.buy+e.count*.35+num(raw.liveScore)*.18+num(raw.liveConfidence)*.3+num(c.marketRelative20m)*.15})}

    diagnostics[key]={fastAction:String(c.fastAction||'HOLD'),fastScore:+num(c.fastScore).toFixed(2),buyScore:+hs.buy.toFixed(2),sellScore:+hs.sell.toFixed(2),liveScore:+num(raw.liveScore).toFixed(2),liveConfidence:+num(raw.liveConfidence).toFixed(3),evidenceCount:e.count,pillars,hardSafe,continuationReady,qualifiedReady:opportunityReady};
  }

  const actions=[];for(const a of fast.actions||[]){
    if(a.action!=='BUY'){actions.push(a);continue}
    const key=String(a.symbol||'').toUpperCase(),e=evidenceMap.get(key),c=context.find(x=>String(x.symbol||'').toUpperCase()===key);
    if(!e?.enoughForFastBuy)continue;
    actions.push({...a,fastScore:num(a.fastScore,c?.fastScore),buyScore:num(a.buyScore,c?.buyScore),sellScore:num(a.sellScore,c?.sellScore),liveScore:num(a.liveScore,c?.liveScore),reason:`${a.reason} · ${e.count} unabhängige Signalsäulen`});
  }
  if(!actions.some(x=>x.action==='BUY')&&continuation.length){continuation.sort((a,b)=>num(b.rank)-num(a.rank));const best=continuation[0],{rank,...clean}=best;actions.push(clean)}
  if(!actions.some(x=>x.action==='BUY')&&opportunities.length){opportunities.sort((a,b)=>num(b.rank)-num(a.rank));const best=opportunities[0],{rank,...clean}=best;actions.push(clean)}

  const generatedBuy=actions.find(x=>x.action==='BUY'&&/TREND-CONTINUATION|QUALIFIED-OPPORTUNITY/.test(String(x.reason||'')));
  const summary=generatedBuy?`${String(fast.summary||'Fast-Decision').slice(0,430)} Aktive Depotentscheidung: ${generatedBuy.symbol} BUY ${(num(generatedBuy.allocation_pct)).toFixed(1)}% · ${String(generatedBuy.reason).slice(0,260)}`:fast.summary;
  return{...fast,actions,context,summary,evidenceDiversity:{minimumPillars:3,qualifiedOpportunityMinimumPillars:2,qualifiedOpportunityBuyFloor:qualifiedBuyFloor,results:Object.fromEntries(evidenceMap),diagnostics,blockedBuys:[...evidenceMap].filter(([,v])=>!v.enoughForFastBuy).map(([k])=>k),trendContinuationCandidates:continuation.map(x=>x.symbol),qualifiedOpportunityCandidates:opportunities.map(x=>x.symbol),idlePortfolio}};
}
