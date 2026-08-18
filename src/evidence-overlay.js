import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function styleFromPrompt(prompt){return String(String(prompt).match(/Handelsstil=([^.;\n]+)/)?.[1]||'offensiv').trim().toLowerCase()}
function cashFromPrompt(prompt){return num(String(prompt).match(/Cash\s+([0-9.+-]+)/i)?.[1],0)}
function holdScores(reason){const m=String(reason||'').match(/BUY\s+([0-9.+-]+)\s*\/\s*SELL\s+([0-9.+-]+)/i);return m?{buy:num(m[1]),sell:num(m[2])}:{buy:0,sell:99}}
function continuationAllocation(style,confidence,cash){const small=cash>0&&cash<=1500,base=small?(style==='vorsichtig'?16:style==='ausgewogen'?20:24):(style==='vorsichtig'?8:style==='ausgewogen'?12:16);return Math.max(6,Math.min(28,base+(num(confidence)-.65)*8))}
function opportunityAllocation(style,cash){if(cash>0&&cash<=1500)return style==='vorsichtig'?16:style==='ausgewogen'?20:24;return style==='vorsichtig'?8:style==='ausgewogen'?12:16}
function activeFirstAllocation(style,cash){if(cash>0&&cash<=1500)return style==='vorsichtig'?14:style==='ausgewogen'?18:24;return style==='vorsichtig'?7:style==='ausgewogen'?10:14}
function cashDeployAllocation(style,cash){if(cash>0&&cash<=1500)return style==='vorsichtig'?14:style==='ausgewogen'?18:24;return style==='vorsichtig'?6:style==='ausgewogen'?9:12}
function deployRawConfidenceFloor(style){return style==='vorsichtig'?.38:style==='ausgewogen'?.33:.28}
function deployLiveScoreFloor(style){return style==='vorsichtig'?0:style==='ausgewogen'?-.15:-.35}

export function applyEvidenceDiversity(fast,prompt){
  if(!fast)return fast;
  const candidates=parseJsonBetween(prompt,'Kandidaten=',' Gehalten='),held=parseJsonBetween(prompt,' Gehalten='),cm=new Map((Array.isArray(candidates)?candidates:[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),gap=new Map((fast.gapContext||[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),ratios=fast?.volumeConfirmation?.ratios||{},minVol=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),context=[],evidenceMap=new Map(),continuation=[],opportunities=[],activeFirst=[],cashDeploy=[];
  const strongAdx=num(FAST_CALIBRATION.strongAdx,22),minAdx=num(FAST_CALIBRATION.minAdxBuy,18),baseBuy=num(FAST_CALIBRATION.buyThreshold,4.2),qualifiedBuyFloor=Math.max(2.90,baseBuy-1.30),activeBuyFloor=1.55,maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8),style=styleFromPrompt(prompt),cash=cashFromPrompt(prompt),idlePortfolio=!Array.isArray(held)||held.length===0,rawConfidenceFloor=deployRawConfidenceFloor(style),liveScoreFloor=deployLiveScoreFloor(style);
  for(const c of fast.context||[]){
    const key=String(c.symbol||'').toUpperCase(),raw=cm.get(key)||{},g=gap.get(key),ratio=Object.prototype.hasOwnProperty.call(ratios,key)?ratios[key]:null,tech=c.technical||{},mtf=c.multiTimeframe||{},regional=c.regionalBenchmark||{},pillars=[];
    const trend=tech.fresh===true&&num(tech.vwapDistancePct)>0&&num(tech.adx)>=minAdx&&num(mtf.longVotes)>=2;
    const momentum=['BREAKOUT','BUILDING'].includes(String(raw.momentumState||''));
    const participation=(ratio!=null&&num(ratio)>=minVol)&&(num(c?.liquidity?.avgVolume)<=0||num(c?.liquidity?.avgVolume)>=15000);
    const relative=num(c.marketRelative20m)>.12||num(c.sectorRelativeDay)>.25||num(regional.relative20m)>.20;
    const catalyst=num(raw.news)>.25||g?.state==='GAP_AND_GO';
    if(trend)pillars.push('TREND_STRUKTUR');if(momentum)pillars.push('MOMENTUM');if(participation)pillars.push('TEILNAHME_VOL');if(relative)pillars.push('RELATIVE_STAERKE');if(catalyst)pillars.push('KATALYSATOR');
    const enough=pillars.length>=3,e={count:pillars.length,pillars,enoughForFastBuy:enough,enoughForQualifiedOpportunity:pillars.length>=2,minimum:3,qualifiedMinimum:2};evidenceMap.set(key,e);context.push({...c,evidenceDiversity:e});

    const hs=holdScores(c.reason),spread=c?.liquidity?.spreadPct,avgVolume=num(c?.liquidity?.avgVolume),state=String(raw.momentumState||'NORMAL'),sellSignal=String(raw.momentumSellSignal||'NONE'),hardSafe=!g?.blockBuy&&!regional?.blockBuy&&c?.fxSafety?.valid!==false&&(spread==null||num(spread)<=maxSpread)&&(avgVolume<=0||avgVolume>=15000)&&sellSignal==='NONE'&&!['REVERSAL','EXHAUSTION'].includes(state);

    const continuationReady=c.fastAction==='HOLD'&&state==='NORMAL'&&hs.buy>=baseBuy+.30&&hs.sell<1.2&&tech.fresh===true&&num(tech.vwapDistancePct)>.10&&num(tech.adx)>=strongAdx&&num(tech.plusDI)>num(tech.minusDI)&&num(mtf.longVotes)>=3&&c.regime!=='TREND_DOWN'&&participation&&enough&&hardSafe;
    if(continuationReady){const confidence=Math.max(.66,Math.min(.86,.60+hs.buy*.04+Math.min(2,e.count)*.015));continuation.push({symbol:c.symbol,action:'BUY',confidence,allocation_pct:+continuationAllocation(style,confidence,cash).toFixed(1),reason:`TREND-CONTINUATION: starker ADX ${num(tech.adx).toFixed(0)} · ${num(mtf.longVotes)}/4 Zeitebenen aufwärts · über VWAP · Volumen bestätigt · ${e.count} unabhängige Signalsäulen`,rank:hs.buy+e.count*.25+num(c.marketRelative20m)*.2})}

    const opportunityReady=idlePortfolio&&c.fastAction==='HOLD'&&hs.buy>=qualifiedBuyFloor&&hs.sell<1.35&&tech.fresh===true&&num(tech.vwapDistancePct)>0&&num(tech.adx)>=minAdx&&num(tech.plusDI)>num(tech.minusDI)&&num(mtf.longVotes)>=2&&(c.regime!=='TREND_DOWN'||num(mtf.longVotes)>=3)&&e.enoughForQualifiedOpportunity&&hardSafe&&num(raw.news)>-.35&&num(raw.liveScore)>0&&num(raw.liveConfidence,.45)>=.42;
    if(opportunityReady){const confidence=Math.max(.60,Math.min(.76,.54+hs.buy*.035+e.count*.02));opportunities.push({symbol:c.symbol,action:'BUY',confidence,allocation_pct:+opportunityAllocation(style,cash).toFixed(1),reason:`QUALIFIED-OPPORTUNITY: bestes freies Setup · BUY-Score ${hs.buy.toFixed(1)} (Startschwelle ${qualifiedBuyFloor.toFixed(1)}) · ADX ${num(tech.adx).toFixed(0)} · ${num(mtf.longVotes)}/4 Zeitebenen aufwärts · über VWAP · ${e.count} unabhängige Signalsäulen`,rank:hs.buy+e.count*.3+num(raw.liveScore)*.12+num(raw.liveConfidence)*.3+num(c.marketRelative20m)*.15})}

    const activeReady=idlePortfolio&&c.fastAction==='HOLD'&&hs.buy>=activeBuyFloor&&hs.sell<1.55&&tech.fresh===true&&num(tech.vwapDistancePct)>-.08&&num(tech.adx)>=12&&num(tech.plusDI)>=num(tech.minusDI)*.85&&num(mtf.longVotes)>=1&&num(mtf.shortVotes)<3&&(c.regime!=='TREND_DOWN'||num(mtf.longVotes)>=2)&&hardSafe&&num(raw.news)>-.50&&num(raw.liveScore)>=0&&num(raw.liveConfidence,.45)>=.35;
    if(activeReady){const confidence=Math.max(.55,Math.min(.69,.50+hs.buy*.035+Math.max(0,num(raw.liveConfidence)-.3)*.2+Math.max(0,num(c.marketRelative20m))*.04));activeFirst.push({symbol:c.symbol,action:'BUY',confidence,allocation_pct:+activeFirstAllocation(style,cash).toFixed(1),reason:`ACTIVE-FIRST-ENTRY: bestes sicheres Setup im leeren Depot · BUY-Score ${hs.buy.toFixed(1)} · ADX ${num(tech.adx).toFixed(0)} · MTF ${num(mtf.longVotes)}/4 positiv · VWAP-Abstand ${num(tech.vwapDistancePct).toFixed(2)}% · harte Sicherheitschecks bestanden`,rank:hs.buy+num(raw.liveScore)*.20+num(raw.liveConfidence)*.45+num(mtf.longVotes)*.18+num(tech.adx)*.012+num(c.marketRelative20m)*.12})}

    const deployReady=idlePortfolio&&c.fastAction==='HOLD'&&hs.sell<1.70&&tech.fresh===true&&num(tech.vwapDistancePct)>-.30&&num(tech.adx)>=7&&num(mtf.shortVotes)<3&&(c.regime!=='TREND_DOWN'||num(mtf.longVotes)>=1)&&hardSafe&&num(raw.news)>-.70&&num(raw.liveScore)>=liveScoreFloor&&num(raw.liveConfidence,.35)>=rawConfidenceFloor;
    if(deployReady){const confidence=Math.max(.52,Math.min(.64,.49+Math.max(0,hs.buy)*.025+Math.max(.25,num(raw.liveConfidence,.35))*.13+Math.max(0,num(mtf.longVotes))*.015));cashDeploy.push({symbol:c.symbol,action:'BUY',confidence,allocation_pct:+cashDeployAllocation(style,cash).toFixed(1),reason:`BEST-SAFE-CASH-DEPLOY: bestes vollständig geprüftes, nicht-bärisches Setup · BUY ${hs.buy.toFixed(1)} / SELL ${hs.sell.toFixed(1)} · ADX ${num(tech.adx).toFixed(0)} · VWAP ${num(tech.vwapDistancePct).toFixed(2)}% · Roh-Konfidenz ${num(raw.liveConfidence).toFixed(2)} · keine harte Risikosperre`,rank:hs.buy-hs.sell*.8+num(raw.liveScore)*.30+num(raw.liveConfidence)*.50+num(mtf.longVotes)*.10-num(mtf.shortVotes)*.12+num(c.marketRelative20m)*.10})}
  }

  const actions=[];for(const a of fast.actions||[]){if(a.action!=='BUY'){actions.push(a);continue}const e=evidenceMap.get(String(a.symbol||'').toUpperCase());if(!e?.enoughForFastBuy)continue;actions.push({...a,reason:`${a.reason} · ${e.count} unabhängige Signalsäulen`})}
  if(!actions.some(x=>x.action==='BUY')&&continuation.length){continuation.sort((a,b)=>num(b.rank)-num(a.rank));const best=continuation[0],{rank,...clean}=best;actions.push(clean)}
  if(!actions.some(x=>x.action==='BUY')&&opportunities.length){opportunities.sort((a,b)=>num(b.rank)-num(a.rank));const best=opportunities[0],{rank,...clean}=best;actions.push(clean)}
  if(!actions.some(x=>x.action==='BUY')&&activeFirst.length){activeFirst.sort((a,b)=>num(b.rank)-num(a.rank));const best=activeFirst[0],{rank,...clean}=best;actions.push(clean)}
  if(!actions.some(x=>x.action==='BUY')&&cashDeploy.length){cashDeploy.sort((a,b)=>num(b.rank)-num(a.rank));const best=cashDeploy[0],{rank,...clean}=best;actions.push(clean)}

  const generatedBuy=actions.find(x=>x.action==='BUY'&&/TREND-CONTINUATION|QUALIFIED-OPPORTUNITY|ACTIVE-FIRST-ENTRY|BEST-SAFE-CASH-DEPLOY/.test(String(x.reason||'')));
  const summary=generatedBuy?`${String(fast.summary||'Fast-Decision').slice(0,430)} Aktive Depotentscheidung: ${generatedBuy.symbol} BUY ${(num(generatedBuy.allocation_pct)).toFixed(1)}% · ${String(generatedBuy.reason).slice(0,240)}`:fast.summary;
  return{...fast,actions,context,summary,evidenceDiversity:{minimumPillars:3,qualifiedOpportunityMinimumPillars:2,qualifiedOpportunityBuyFloor:qualifiedBuyFloor,activeFirstEntryBuyFloor:activeBuyFloor,bestSafeRawConfidenceFloor:rawConfidenceFloor,bestSafeLiveScoreFloor:liveScoreFloor,results:Object.fromEntries(evidenceMap),blockedBuys:[...evidenceMap].filter(([,v])=>!v.enoughForFastBuy).map(([k])=>k),trendContinuationCandidates:continuation.map(x=>x.symbol),qualifiedOpportunityCandidates:opportunities.map(x=>x.symbol),activeFirstEntryCandidates:activeFirst.map(x=>x.symbol),bestSafeCashDeployCandidates:cashDeploy.map(x=>x.symbol),idlePortfolio}};
}
