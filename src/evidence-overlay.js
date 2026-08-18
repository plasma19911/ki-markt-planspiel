import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function styleFromPrompt(prompt){return String(String(prompt).match(/Handelsstil=([^.;\n]+)/)?.[1]||'offensiv').trim().toLowerCase()}
function holdScores(reason){const m=String(reason||'').match(/BUY\s+([0-9.+-]+)\s*\/\s*SELL\s+([0-9.+-]+)/i);return m?{buy:num(m[1]),sell:num(m[2])}:{buy:0,sell:99}}
function continuationAllocation(style,confidence){const base=style==='vorsichtig'?8:style==='ausgewogen'?12:16;return Math.max(6,Math.min(20,base+(num(confidence)-.65)*10))}

export function applyEvidenceDiversity(fast,prompt){
  if(!fast)return fast;
  const candidates=parseJsonBetween(prompt,'Kandidaten=',' Gehalten='),cm=new Map((Array.isArray(candidates)?candidates:[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),gap=new Map((fast.gapContext||[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),ratios=fast?.volumeConfirmation?.ratios||{},minVol=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),context=[],evidenceMap=new Map(),continuation=[];
  const strongAdx=num(FAST_CALIBRATION.strongAdx,22),baseBuy=num(FAST_CALIBRATION.buyThreshold,4.2),maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8),style=styleFromPrompt(prompt);
  for(const c of fast.context||[]){
    const key=String(c.symbol||'').toUpperCase(),raw=cm.get(key)||{},g=gap.get(key),ratio=Object.prototype.hasOwnProperty.call(ratios,key)?ratios[key]:null,tech=c.technical||{},mtf=c.multiTimeframe||{},regional=c.regionalBenchmark||{},pillars=[];
    const trend=tech.fresh===true&&num(tech.vwapDistancePct)>0&&num(tech.adx)>=num(FAST_CALIBRATION.minAdxBuy,18)&&num(mtf.longVotes)>=2;
    const momentum=['BREAKOUT','BUILDING'].includes(String(raw.momentumState||''));
    const participation=(ratio!=null&&num(ratio)>=minVol)&&(num(c?.liquidity?.avgVolume)<=0||num(c?.liquidity?.avgVolume)>=15000);
    const relative=num(c.marketRelative20m)>.12||num(c.sectorRelativeDay)>.25||num(regional.relative20m)>.20;
    const catalyst=num(raw.news)>.25||g?.state==='GAP_AND_GO';
    if(trend)pillars.push('TREND_STRUKTUR');if(momentum)pillars.push('MOMENTUM');if(participation)pillars.push('TEILNAHME_VOL');if(relative)pillars.push('RELATIVE_STAERKE');if(catalyst)pillars.push('KATALYSATOR');
    const enough=pillars.length>=3,e={count:pillars.length,pillars,enoughForFastBuy:enough,minimum:3};evidenceMap.set(key,e);const enriched={...c,evidenceDiversity:e};context.push(enriched);

    // Ein starker, sauber bestaetigter Aufwaertstrend darf gekauft werden, auch wenn der
    // 1m-Momentumzustand gerade NORMAL statt BREAKOUT/BUILDING lautet. Kein Fallback:
    // Volumen, ADX/DI, MTF, VWAP und mindestens drei unabhaengige Saeulen bleiben Pflicht.
    const hs=holdScores(c.reason),spread=c?.liquidity?.spreadPct,continuationReady=
      c.fastAction==='HOLD'&&String(raw.momentumState||'NORMAL')==='NORMAL'&&String(raw.momentumSellSignal||'NONE')==='NONE'&&
      hs.buy>=baseBuy+.30&&hs.sell<1.2&&tech.fresh===true&&num(tech.vwapDistancePct)>.10&&num(tech.adx)>=strongAdx&&num(tech.plusDI)>num(tech.minusDI)&&
      num(mtf.longVotes)>=3&&c.regime!=='TREND_DOWN'&&participation&&enough&&!g?.blockBuy&&!regional?.blockBuy&&c?.fxSafety?.valid!==false&&
      (spread==null||num(spread)<=maxSpread);
    if(continuationReady){const confidence=Math.max(.66,Math.min(.86,.60+hs.buy*.04+Math.min(2,e.count)*.015));continuation.push({symbol:c.symbol,action:'BUY',confidence,allocation_pct:+continuationAllocation(style,confidence).toFixed(1),reason:`TREND-CONTINUATION: starker ADX ${num(tech.adx).toFixed(0)} · ${num(mtf.longVotes)}/4 Zeitebenen aufwärts · über VWAP · Volumen bestätigt · ${e.count} unabhängige Signalsäulen`,rank:hs.buy+e.count*.25+num(c.marketRelative20m)*.2})}
  }
  const actions=[];for(const a of fast.actions||[]){if(a.action!=='BUY'){actions.push(a);continue}const e=evidenceMap.get(String(a.symbol||'').toUpperCase());if(!e?.enoughForFastBuy)continue;actions.push({...a,reason:`${a.reason} · ${e.count} unabhängige Signalsäulen`})}
  if(!actions.some(x=>x.action==='BUY')&&continuation.length){continuation.sort((a,b)=>num(b.rank)-num(a.rank));const best=continuation[0],{rank,...clean}=best;actions.push(clean)}
  return{...fast,actions,context,evidenceDiversity:{minimumPillars:3,results:Object.fromEntries(evidenceMap),blockedBuys:[...evidenceMap].filter(([,v])=>!v.enoughForFastBuy).map(([k])=>k),trendContinuationCandidates:continuation.map(x=>x.symbol)}};
}
