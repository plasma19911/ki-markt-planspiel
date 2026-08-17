import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}

export function applyEvidenceDiversity(fast,prompt){
  if(!fast)return fast;const candidates=parseJsonBetween(prompt,'Kandidaten=',' Gehalten='),cm=new Map((Array.isArray(candidates)?candidates:[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),gap=new Map((fast.gapContext||[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),ratios=fast?.volumeConfirmation?.ratios||{},minVol=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),context=[],evidenceMap=new Map();
  for(const c of fast.context||[]){const key=String(c.symbol||'').toUpperCase(),raw=cm.get(key)||{},g=gap.get(key),ratio=Object.prototype.hasOwnProperty.call(ratios,key)?ratios[key]:null,tech=c.technical||{},mtf=c.multiTimeframe||{},regional=c.regionalBenchmark||{},pillars=[];
    const trend=tech.fresh===true&&num(tech.vwapDistancePct)>0&&num(tech.adx)>=num(FAST_CALIBRATION.minAdxBuy,18)&&num(mtf.longVotes)>=2;
    const momentum=['BREAKOUT','BUILDING'].includes(String(raw.momentumState||''));
    const participation=(ratio!=null&&num(ratio)>=minVol)&&(num(c?.liquidity?.avgVolume)<=0||num(c?.liquidity?.avgVolume)>=15000);
    const relative=num(c.marketRelative20m)>.12||num(c.sectorRelativeDay)>.25||num(regional.relative20m)>.20;
    const catalyst=num(raw.news)>.25||g?.state==='GAP_AND_GO';
    if(trend)pillars.push('TREND_STRUKTUR');if(momentum)pillars.push('MOMENTUM');if(participation)pillars.push('TEILNAHME_VOL');if(relative)pillars.push('RELATIVE_STAERKE');if(catalyst)pillars.push('KATALYSATOR');
    const enough=pillars.length>=3,e={count:pillars.length,pillars,enoughForFastBuy:enough,minimum:3};evidenceMap.set(key,e);context.push({...c,evidenceDiversity:e});
  }
  const actions=[];for(const a of fast.actions||[]){if(a.action!=='BUY'){actions.push(a);continue}const e=evidenceMap.get(String(a.symbol||'').toUpperCase());if(!e?.enoughForFastBuy)continue;actions.push({...a,reason:`${a.reason} · ${e.count} unabhängige Signalsäulen`})}
  return{...fast,actions,context,evidenceDiversity:{minimumPillars:3,results:Object.fromEntries(evidenceMap),blockedBuys:[...evidenceMap].filter(([,v])=>!v.enoughForFastBuy).map(([k])=>k)}};
}
