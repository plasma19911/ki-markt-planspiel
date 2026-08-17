const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const MAX_ROUNDTRIP_COST_PCT=4.0;
const WARN_ROUNDTRIP_COST_PCT=2.0;

function configFromPrompt(prompt){
  const cash=num(String(prompt).match(/Cash\s+([0-9.+-]+)/i)?.[1],0),currency=String(String(prompt).match(/Cash\s+[0-9.+-]+\s+([A-Z]{3})/i)?.[1]||'EUR'),feeFixed=num(String(prompt).match(/Kosten\s+([0-9.+-]+)\s+je Kauf\/Verkauf/i)?.[1],0),feePercent=num(String(prompt).match(/je Kauf\/Verkauf\s*\+\s*([0-9.+-]+)%/i)?.[1],0),slippagePercent=num(String(prompt).match(/Slippage\s+([0-9.+-]+)%/i)?.[1],0);
  return{cash,currency,feeFixed,feePercent,slippagePercent,maxRoundTripCostPct:MAX_ROUNDTRIP_COST_PCT,warnRoundTripCostPct:WARN_ROUNDTRIP_COST_PCT};
}

function estimate(cfg,allocationPct){const notional=Math.max(0,cfg.cash*Math.max(0,num(allocationPct))/100);if(!(notional>0))return{notional:0,costPct:Infinity,estimatedCost:0};const estimatedCost=2*cfg.feeFixed+2*notional*cfg.feePercent/100+2*notional*cfg.slippagePercent/100,costPct=estimatedCost/notional*100;return{notional,estimatedCost,costPct};}

export function applyExecutionCostDiscipline(fast,prompt){
  if(!fast)return fast;const cfg=configFromPrompt(prompt),actions=[],bySymbol={};
  for(const a of fast.actions||[]){if(a.action!=='BUY'){actions.push(a);continue}const e=estimate(cfg,a.allocation_pct);bySymbol[String(a.symbol||'').toUpperCase()]={allocationPct:num(a.allocation_pct),notional:+e.notional.toFixed(2),estimatedRoundTripCost:+e.estimatedCost.toFixed(2),estimatedRoundTripCostPct:Number.isFinite(e.costPct)?+e.costPct.toFixed(2):null,blockBuy:!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct};if(!Number.isFinite(e.costPct)||e.costPct>cfg.maxRoundTripCostPct)continue;actions.push(e.costPct>cfg.warnRoundTripCostPct?{...a,confidence:Math.min(num(a.confidence,.5),.78),reason:`${a.reason} · Kostenquote ca. ${e.costPct.toFixed(1)}% erhöht`}:a)}
  return{...fast,actions,executionCost:{...cfg,bySymbol}};
}

export function estimateAiBuyCost(fast,allocationPct){const cfg=fast?.executionCost;if(!cfg)return null;return{...estimate(cfg,allocationPct),maxRoundTripCostPct:num(cfg.maxRoundTripCostPct,MAX_ROUNDTRIP_COST_PCT),warnRoundTripCostPct:num(cfg.warnRoundTripCostPct,WARN_ROUNDTRIP_COST_PCT)};}
