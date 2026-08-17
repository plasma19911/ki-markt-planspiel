import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function responseText(r){return String(r?.response||r?.result?.response||'')}

export function enforceFastExecutionGuards(aiResponse,fast){
  if(!fast)return aiResponse;
  const raw=responseText(aiResponse),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<=a)return aiResponse;
  try{
    const j=JSON.parse(raw.slice(a,b+1)),actions=Array.isArray(j.actions)?j.actions:[];
    const ctx=new Map((fast.context||[]).map(x=>[String(x.symbol||'').toUpperCase(),x]));
    const gaps=new Map((fast.gapContext||[]).map(x=>[String(x.symbol||'').toUpperCase(),x]));
    const maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8);
    j.actions=actions.map(action=>{
      if(String(action?.action||'').toUpperCase()!=='BUY')return action;
      const symbol=String(action?.symbol||'').toUpperCase(),c=ctx.get(symbol),g=gaps.get(symbol),blocks=[];
      if(g?.blockBuy)blocks.push(`Gap/Opening-Range ${g.state||'BLOCK'}`);
      const spread=c?.liquidity?.spreadPct;
      if(spread!=null&&num(spread)>maxSpread)blocks.push(`Spread ${num(spread).toFixed(2)}% > ${maxSpread.toFixed(2)}%`);
      const avgVolume=num(c?.liquidity?.avgVolume);
      if(avgVolume>0&&avgVolume<15000)blocks.push('Liquidität zu niedrig');
      if(!blocks.length)return action;
      return{...action,action:'HOLD',allocation_pct:0,confidence:Math.min(num(action.confidence,.5),.55),reason:`HARD-BUY-BLOCK: ${blocks.join(' · ')}. ${String(action.reason||'').slice(0,220)}`};
    });
    const blocked=j.actions.filter(x=>String(x.reason||'').startsWith('HARD-BUY-BLOCK:')).length;
    if(blocked)j.summary=`${String(j.summary||'KI-Plan').slice(0,310)} · ${blocked} BUY durch Ausführungs-Schutz blockiert.`;
    return{...aiResponse,response:JSON.stringify(j)};
  }catch{return aiResponse}
}

export function isLowerAiPlanCooldown(aiResponse){
  const raw=responseText(aiResponse);
  return raw.includes('KI-Wartefenster: Markt und News werden weiter jede Minute gescannt');
}
