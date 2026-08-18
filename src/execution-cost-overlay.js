import {ZERO_FEE_MODEL,zeroRoundTripBrokerFees} from './zero-fee-model.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const MAX_ROUNDTRIP_COST_PCT=2.0;
const WARN_ROUNDTRIP_COST_PCT=1.0;
const SMALL_IDLE_PORTFOLIO_MAX_EUR=1500;
const SMALL_IDLE_SINGLE_BUY_FLOOR_PCT=24;

function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function configFromPrompt(prompt){
  const cash=num(String(prompt).match(/Cash\s+([0-9.+-]+)/i)?.[1],0),currency=String(String(prompt).match(/Cash\s+[0-9.+-]+\s+([A-Z]{3})/i)?.[1]||'EUR'),slippagePercent=num(String(prompt).match(/Slippage\s+([0-9.+-]+)%/i)?.[1],0),candidates=parseJsonBetween(String(prompt),'Kandidaten=',' Gehalten='),types={},prices={};
  for(const c of Array.isArray(candidates)?candidates:[])if(c?.symbol){const k=String(c.symbol).toUpperCase();types[k]=String(c.type||'EQUITY').toUpperCase();const p=num(c.price||c.livePrice||c.last_price,0);if(p>0)prices[k]=p}
  return{cash,currency,slippagePercent,types,prices,maxRoundTripCostPct:MAX_ROUNDTRIP_COST_PCT,warnRoundTripCostPct:WARN_ROUNDTRIP_COST_PCT,feeModel:ZERO_FEE_MODEL.version};
}
function brokerFeeEstimate(notional,type,price=0){
  const n=Math.max(0,num(notional)),t=String(type||'EQUITY').toUpperCase();if(!(n>0))return 0;
  if(num(price)>0){const exact=zeroRoundTripBrokerFees({notionalEur:n,priceEur:num(price),instrumentType:t,fractionalAllowed:t!=='ETF'});if(exact.affordable)return num(exact.total)}
  return n<ZERO_FEE_MODEL.smallOrderThresholdEur?2*ZERO_FEE_MODEL.smallOrderSurchargeEur:0;
}
function estimate(cfg,allocationPct,type='EQUITY',price=0){
  const notional=Math.max(0,cfg.cash*Math.max(0,num(allocationPct))/100);if(!(notional>0))return{notional:0,costPct:Infinity,estimatedCost:0,estimatedBrokerFees:0};
  const estimatedBrokerFees=brokerFeeEstimate(notional,type,price),executionCost=2*notional*cfg.slippagePercent/100,estimatedCost=estimatedBrokerFees+executionCost,costPct=estimatedCost/notional*100;
  return{notional,estimatedBrokerFees,estimatedExecutionCost:executionCost,estimatedCost,costPct,feeEstimate:price>0?'ZERO quantity-aware estimate':'ZERO realistic fallback estimate; exact paper fill reconciles quantity'};
}

export function applyExecutionCostDiscipline(fast,prompt){
  if(!fast)return fast;const cfg=configFromPrompt(prompt),actions=[],bySymbol={},buyCount=(fast.actions||[]).filter(x=>x.action==='BUY').length,idleInitial=Boolean(fast?.evidenceDiversity?.idlePortfolio)&&cfg.cash>0&&cfg.cash<=SMALL_IDLE_PORTFOLIO_MAX_EUR&&buyCount===1;
  for(const a of fast.actions||[]){
    if(a.action!=='BUY'){actions.push(a);continue}
    let working=a;
    if(idleInitial&&num(a.allocation_pct)<SMALL_IDLE_SINGLE_BUY_FLOOR_PCT){working={...a,allocation_pct:SMALL_IDLE_SINGLE_BUY_FLOOR_PCT,reason:`${a.reason} · kleines leeres Depot: Erstposition kostenökonomisch auf ${SMALL_IDLE_SINGLE_BUY_FLOOR_PCT}% gesetzt`}}
    const symbol=String(working.symbol||'').toUpperCase(),type=cfg.types[symbol]||'EQUITY',price=num(cfg.prices[symbol]),e=estimate(cfg,working.allocation_pct,type,price);
    bySymbol[symbol]={allocationPct:num(working.allocation_pct),instrumentType:type,referencePrice:price||null,notional:+e.notional.toFixed(2),estimatedBrokerFees:+e.estimatedBrokerFees.toFixed(2),estimatedExecutionCost:+e.estimatedExecutionCost.toFixed(2),estimatedRoundTripCost:+e.estimatedCost.toFixed(2),estimatedRoundTripCostPct:Number.isFinite(e.costPct)?+e.costPct.toFixed(2):null,blockBuy:!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct,feeEstimate:e.feeEstimate,initialSizingFloorApplied:working!==a};
    if(!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct)continue;
    actions.push(e.costPct>cfg.warnRoundTripCostPct?{...working,confidence:Math.min(num(working.confidence,.5),.75),reason:`${working.reason} · ZERO-Roundtrip-Kosten ca. ${e.costPct.toFixed(1)}%: Kostenwarnung, Positionsgröße beibehalten`}:working)
  }
  return{...fast,actions,executionCost:{...cfg,smallIdleSingleBuyFloorPct:SMALL_IDLE_SINGLE_BUY_FLOOR_PCT,smallIdlePortfolioMaxEur:SMALL_IDLE_PORTFOLIO_MAX_EUR,bySymbol}};
}

export function estimateAiBuyCost(fast,allocationPct,symbol=''){
  const cfg=fast?.executionCost;if(!cfg)return null;const key=String(symbol||'').toUpperCase(),cached=cfg.bySymbol?.[key];if(cached&&Math.abs(num(cached.allocationPct)-num(allocationPct))<.01)return{notional:num(cached.notional),estimatedCost:num(cached.estimatedRoundTripCost),costPct:num(cached.estimatedRoundTripCostPct,Infinity),maxRoundTripCostPct:num(cfg.maxRoundTripCostPct,MAX_ROUNDTRIP_COST_PCT),warnRoundTripCostPct:num(cfg.warnRoundTripCostPct,WARN_ROUNDTRIP_COST_PCT)};
  const type=cfg.types?.[key]||'EQUITY',price=num(cfg.prices?.[key]);return{...estimate(cfg,allocationPct,type,price),maxRoundTripCostPct:num(cfg.maxRoundTripCostPct,MAX_ROUNDTRIP_COST_PCT),warnRoundTripCostPct:num(cfg.warnRoundTripCostPct,WARN_ROUNDTRIP_COST_PCT)};
}
