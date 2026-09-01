import {ZERO_FEE_MODEL,zeroRoundTripBrokerFees} from './zero-fee-model.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const MAX_ROUNDTRIP_COST_PCT=2.0;
const WARN_ROUNDTRIP_COST_PCT=1.0;
const MAX_COST_EFFICIENT_SIZING_BUMP_PCT=6.0;

function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function configFromPrompt(prompt){
  const cash=num(String(prompt).match(/Cash\s+([0-9.+-]+)/i)?.[1],0),currency=String(String(prompt).match(/Cash\s+[0-9.+-]+\s+([A-Z]{3})/i)?.[1]||'EUR'),slippagePercent=num(String(prompt).match(/Slippage\s+([0-9.+-]+)%/i)?.[1],0),candidates=parseJsonBetween(String(prompt),'Kandidaten=',' Gehalten='),types={},prices={};
  for(const c of Array.isArray(candidates)?candidates:[])if(c?.symbol){const k=String(c.symbol).toUpperCase();types[k]=String(c.type||'EQUITY').toUpperCase();const p=num(c.price||c.livePrice||c.last_price,0);if(p>0)prices[k]=p}
  return{cash,currency,slippagePercent,types,prices,maxRoundTripCostPct:MAX_ROUNDTRIP_COST_PCT,warnRoundTripCostPct:WARN_ROUNDTRIP_COST_PCT,feeModel:ZERO_FEE_MODEL.version,forcedSizingFloor:false,minimumBuyFloorPct:null};
}
function brokerExecution(notional,type,price=0){
  const n=Math.max(0,num(notional)),t=String(type||'EQUITY').toUpperCase();if(!(n>0))return{tradeNotional:0,fees:0,exact:false,affordable:false};
  if(num(price)>0){
    const exact=zeroRoundTripBrokerFees({notionalEur:n,priceEur:num(price),instrumentType:t});
    if(exact.affordable)return{tradeNotional:num(exact.tradeNotional),fees:num(exact.total),exact:true,affordable:true,selectionReason:exact.selectionReason||null};
    return{tradeNotional:0,fees:0,exact:true,affordable:false,selectionReason:'NOT_AFFORDABLE'};
  }
  const fallbackFees=2*Math.max(0,num(ZERO_FEE_MODEL.standardOrderFeeEur));
  return{tradeNotional:n,fees:fallbackFees,exact:false,affordable:true,selectionReason:'FALLBACK_NO_PRICE_WITH_STANDARD_FEES'};
}
function estimate(cfg,allocationPct,type='EQUITY',price=0){
  const budgetNotional=Math.max(0,cfg.cash*Math.max(0,num(allocationPct))/100);if(!(budgetNotional>0))return{budgetNotional:0,notional:0,costPct:Infinity,estimatedCost:0,estimatedBrokerFees:0,affordable:false};
  const execution=brokerExecution(budgetNotional,type,price);if(!execution.affordable||!(execution.tradeNotional>0))return{budgetNotional,notional:0,costPct:Infinity,estimatedCost:0,estimatedBrokerFees:0,affordable:false,selectionReason:execution.selectionReason};
  const actualNotional=execution.tradeNotional,estimatedBrokerFees=execution.fees,executionCost=2*actualNotional*cfg.slippagePercent/100,estimatedCost=estimatedBrokerFees+executionCost,costPct=estimatedCost/actualNotional*100;
  return{budgetNotional,notional:actualNotional,estimatedBrokerFees,estimatedExecutionCost:executionCost,estimatedCost,costPct,affordable:true,selectionReason:execution.selectionReason,feeEstimate:execution.exact?'Trade Republic quantity-aware actual-fill estimate':'Trade Republic conservative fallback with standard buy/sell fees; exact paper fill reconciles quantity'};
}
function costEfficientWholeShareSizing(cfg,allocationPct,type,price,initial){
  const basePct=Math.max(0,num(allocationPct)),t=String(type||'EQUITY').toUpperCase(),p=num(price),cash=num(cfg?.cash);
  if(t!=='EQUITY'||!(p>0&&cash>0))return{allocationPct:basePct,estimate:initial,applied:false};
  if(Number.isFinite(initial?.costPct)&&initial.costPct<=cfg.maxRoundTripCostPct)return{allocationPct:basePct,estimate:initial,applied:false};
  const buyFee=Math.max(0,num(ZERO_FEE_MODEL.standardOrderFeeEur)),baseBudget=cash*basePct/100;
  const currentQty=Math.max(0,Math.floor(Math.max(0,baseBudget-buyFee)/p+1e-9)),targetQty=Math.max(1,currentQty+1),neededBudget=targetQty*p+buyFee+.01,neededPct=neededBudget/cash*100,bump=neededPct-basePct;
  if(!(neededPct>basePct&&neededPct<=100&&bump<=MAX_COST_EFFICIENT_SIZING_BUMP_PCT))return{allocationPct:basePct,estimate:initial,applied:false};
  const next=estimate(cfg,neededPct,t,p);
  if(!Number.isFinite(next.costPct)||next.costPct>cfg.maxRoundTripCostPct)return{allocationPct:basePct,estimate:initial,applied:false};
  return{allocationPct:+neededPct.toFixed(3),estimate:next,applied:true,fromPct:+basePct.toFixed(3),toPct:+neededPct.toFixed(3),quantity:targetQty,bumpPct:+bump.toFixed(3)};
}

export function applyExecutionCostDiscipline(fast,prompt){
  if(!fast)return fast;const cfg=configFromPrompt(prompt),actions=[],bySymbol={};let sizingAdjustments=0,minAdjustedPct=null;
  for(const a of fast.actions||[]){
    if(a.action!=='BUY'){actions.push(a);continue}
    const symbol=String(a.symbol||'').toUpperCase(),type=cfg.types[symbol]||'EQUITY',price=num(cfg.prices[symbol]);let allocationPct=num(a.allocation_pct),e=estimate(cfg,allocationPct,type,price),sizing=costEfficientWholeShareSizing(cfg,allocationPct,type,price,e),nextAction={...a};
    if(sizing.applied){allocationPct=sizing.allocationPct;e=sizing.estimate;sizingAdjustments++;minAdjustedPct=minAdjustedPct==null?allocationPct:Math.min(minAdjustedPct,allocationPct);nextAction={...nextAction,allocation_pct:allocationPct,costEfficientSizingV3174:true,reason:`${String(nextAction.reason||'BUY').slice(0,300)} · Kosten-effiziente Ganzaktiengröße ${sizing.fromPct.toFixed(1)}%→${sizing.toPct.toFixed(1)}% (${sizing.quantity} Stück), damit Fixkosten nicht künstlich über ${cfg.maxRoundTripCostPct.toFixed(1)}% steigen`}}
    bySymbol[symbol]={allocationPct,instrumentType:type,referencePrice:price||null,budgetNotional:+e.budgetNotional.toFixed(2),notional:+e.notional.toFixed(2),estimatedBrokerFees:+e.estimatedBrokerFees.toFixed(2),estimatedExecutionCost:+e.estimatedExecutionCost.toFixed(2),estimatedRoundTripCost:+e.estimatedCost.toFixed(2),estimatedRoundTripCostPct:Number.isFinite(e.costPct)?+e.costPct.toFixed(2):null,blockBuy:!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct,feeEstimate:e.feeEstimate||null,selectionReason:e.selectionReason||null,initialSizingFloorApplied:sizing.applied,sizingBumpPct:sizing.applied?sizing.bumpPct:0};
    if(!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct)continue;
    actions.push(e.costPct>cfg.warnRoundTripCostPct?{...nextAction,confidence:Math.min(num(nextAction.confidence,.5),.75),reason:`${nextAction.reason} · Trade-Republic-Roundtrip-Kosten ca. ${e.costPct.toFixed(1)}%: Kostenwarnung`}:nextAction)
  }
  return{...fast,actions,executionCost:{...cfg,smallIdleSingleBuyFloorPct:null,smallIdlePortfolioMaxEur:null,forcedSizingFloor:false,minimumBuyFloorPct:minAdjustedPct,costEfficientWholeShareSizing:true,maxSizingBumpPct:MAX_COST_EFFICIENT_SIZING_BUMP_PCT,sizingAdjustments,bySymbol}};
}

export function estimateAiBuyCost(fast,allocationPct,symbol=''){
  const cfg=fast?.executionCost;if(!cfg)return null;const key=String(symbol||'').toUpperCase(),cached=cfg.bySymbol?.[key];if(cached&&Math.abs(num(cached.allocationPct)-num(allocationPct))<.01)return{notional:num(cached.notional),budgetNotional:num(cached.budgetNotional,cached.notional),estimatedCost:num(cached.estimatedRoundTripCost),costPct:num(cached.estimatedRoundTripCostPct,Infinity),maxRoundTripCostPct:num(cfg.maxRoundTripCostPct,MAX_ROUNDTRIP_COST_PCT),warnRoundTripCostPct:num(cfg.warnRoundTripCostPct,WARN_ROUNDTRIP_COST_PCT)};
  const type=cfg.types?.[key]||'EQUITY',price=num(cfg.prices?.[key]);return{...estimate(cfg,allocationPct,type,price),maxRoundTripCostPct:num(cfg.maxRoundTripCostPct,MAX_ROUNDTRIP_COST_PCT),warnRoundTripCostPct:num(cfg.warnRoundTripCostPct,WARN_ROUNDTRIP_COST_PCT)};
}
