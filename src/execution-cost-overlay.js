import {ZERO_FEE_MODEL} from './zero-fee-model.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const MAX_ROUNDTRIP_COST_PCT=2.0;
const WARN_ROUNDTRIP_COST_PCT=1.0;

function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function configFromPrompt(prompt){
  const cash=num(String(prompt).match(/Cash\s+([0-9.+-]+)/i)?.[1],0),currency=String(String(prompt).match(/Cash\s+[0-9.+-]+\s+([A-Z]{3})/i)?.[1]||'EUR'),slippagePercent=num(String(prompt).match(/Slippage\s+([0-9.+-]+)%/i)?.[1],0),candidates=parseJsonBetween(String(prompt),'Kandidaten=',' Gehalten='),types={};
  for(const c of Array.isArray(candidates)?candidates:[])if(c?.symbol)types[String(c.symbol).toUpperCase()]=String(c.type||'EQUITY').toUpperCase();
  return{cash,currency,slippagePercent,types,maxRoundTripCostPct:MAX_ROUNDTRIP_COST_PCT,warnRoundTripCostPct:WARN_ROUNDTRIP_COST_PCT,feeModel:ZERO_FEE_MODEL.version};
}
function brokerFeeUpperBound(notional,type){
  const n=Math.max(0,num(notional)),isEtf=String(type||'EQUITY').toUpperCase()==='ETF';if(!(n>0))return 0;
  if(isEtf)return n<ZERO_FEE_MODEL.smallOrderThresholdEur?2*ZERO_FEE_MODEL.smallOrderSurchargeEur:0;
  const wholeRoundTrip=n<ZERO_FEE_MODEL.smallOrderThresholdEur?2*ZERO_FEE_MODEL.smallOrderSurchargeEur:0;
  const fractionalRoundTrip=2*ZERO_FEE_MODEL.fractionalSurchargeEur;
  return wholeRoundTrip+fractionalRoundTrip;
}
function estimate(cfg,allocationPct,type='EQUITY'){
  const notional=Math.max(0,cfg.cash*Math.max(0,num(allocationPct))/100);if(!(notional>0))return{notional:0,costPct:Infinity,estimatedCost:0,estimatedBrokerFees:0};
  const estimatedBrokerFees=brokerFeeUpperBound(notional,type),executionCost=2*notional*cfg.slippagePercent/100,estimatedCost=estimatedBrokerFees+executionCost,costPct=estimatedCost/notional*100;
  return{notional,estimatedBrokerFees,estimatedExecutionCost:executionCost,estimatedCost,costPct,feeEstimate:'conservative upper bound; actual paper fill reconciles exact ZERO fee from quantity'};
}

export function applyExecutionCostDiscipline(fast,prompt){
  if(!fast)return fast;const cfg=configFromPrompt(prompt),actions=[],bySymbol={};
  for(const a of fast.actions||[]){
    if(a.action!=='BUY'){actions.push(a);continue}
    const symbol=String(a.symbol||'').toUpperCase(),type=cfg.types[symbol]||'EQUITY',e=estimate(cfg,a.allocation_pct,type);
    bySymbol[symbol]={allocationPct:num(a.allocation_pct),instrumentType:type,notional:+e.notional.toFixed(2),estimatedBrokerFees:+e.estimatedBrokerFees.toFixed(2),estimatedExecutionCost:+e.estimatedExecutionCost.toFixed(2),estimatedRoundTripCost:+e.estimatedCost.toFixed(2),estimatedRoundTripCostPct:Number.isFinite(e.costPct)?+e.costPct.toFixed(2):null,blockBuy:!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct,feeEstimate:e.feeEstimate};
    if(!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct)continue;
    actions.push(e.costPct>cfg.warnRoundTripCostPct?{...a,confidence:Math.min(num(a.confidence,.5),.75),allocation_pct:+(num(a.allocation_pct)*.80).toFixed(1),reason:`${a.reason} · ZERO-Roundtrip-Kosten ca. ${e.costPct.toFixed(1)}%: Einsatz reduziert`}:a)
  }
  return{...fast,actions,executionCost:{...cfg,bySymbol}};
}

export function estimateAiBuyCost(fast,allocationPct,symbol=''){
  const cfg=fast?.executionCost;if(!cfg)return null;const key=String(symbol||'').toUpperCase(),cached=cfg.bySymbol?.[key];if(cached&&Math.abs(num(cached.allocationPct)-num(allocationPct))<.01)return{notional:num(cached.notional),estimatedCost:num(cached.estimatedRoundTripCost),costPct:num(cached.estimatedRoundTripCostPct,Infinity),maxRoundTripCostPct:num(cfg.maxRoundTripCostPct,MAX_ROUNDTRIP_COST_PCT),warnRoundTripCostPct:num(cfg.warnRoundTripCostPct,WARN_ROUNDTRIP_COST_PCT)};
  const type=cfg.types?.[key]||'EQUITY';return{...estimate(cfg,allocationPct,type),maxRoundTripCostPct:num(cfg.maxRoundTripCostPct,MAX_ROUNDTRIP_COST_PCT),warnRoundTripCostPct:num(cfg.warnRoundTripCostPct,WARN_ROUNDTRIP_COST_PCT)};
}
