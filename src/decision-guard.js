import {FAST_CALIBRATION} from './generated-fast-calibration.js';
import {estimateAiBuyCost} from './execution-cost-overlay.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function responseText(r){return String(r?.response||r?.result?.response||'')}
function qualityRank(a){
  const live=num(a?.liveScore),buy=num(a?.buyScore,a?.fastScore),sell=num(a?.sellScore),confidence=num(a?.confidence,a?.liveConfidence);
  return live*.60+buy*.80-sell*.70+confidence*1.40;
}
function symbolKey(x){return String(x?.symbol||'').toUpperCase()}

function bestValidatedFastBuy(fast,existingActions=[]){
  const existingSymbols=new Set((existingActions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY').map(symbolKey));
  const blockedSymbols=new Set((existingActions||[]).filter(x=>String(x?.action||'').toUpperCase()==='SELL').map(symbolKey));
  return (fast?.actions||[])
    .filter(x=>String(x?.action||'').toUpperCase()==='BUY')
    .filter(x=>!existingSymbols.has(symbolKey(x))&&!blockedSymbols.has(symbolKey(x)))
    .sort((a,b)=>qualityRank(b)-qualityRank(a)||num(b.confidence)-num(a.confidence)||num(b.fastScore)-num(a.fastScore))[0]||null;
}

function bestSafeCashDeploy(fast,existingActions=[]){
  const cash=num(fast?.executionCost?.cash,0);if(!(cash>0.01))return null;
  const blockedSymbols=new Set((existingActions||[]).filter(x=>String(x?.action||'').toUpperCase()==='SELL').map(symbolKey));
  const gaps=new Map((fast?.gapContext||[]).map(x=>[symbolKey(x),x])),maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8),diagnostics=fast?.evidenceDiversity?.diagnostics||{};
  const eligible=(fast?.context||[]).filter(c=>{
    const symbol=symbolKey(c),g=gaps.get(symbol),spread=c?.liquidity?.spreadPct,avgVolume=num(c?.liquidity?.avgVolume),diag=diagnostics[symbol];
    if(!symbol||blockedSymbols.has(symbol))return false;
    if(String(c?.fastAction||'HOLD').toUpperCase()==='SELL')return false;
    if(c?.technical?.fresh!==true)return false;
    if(c?.fxSafety?.valid===false||c?.regionalBenchmark?.blockBuy||g?.blockBuy)return false;
    if(spread!=null&&num(spread)>maxSpread)return false;
    if(avgVolume>0&&avgVolume<15000)return false;
    if(diag&&diag.hardSafe===false)return false;
    const cost=estimateAiBuyCost(fast,100,symbol);if(cost&&(!Number.isFinite(cost.costPct)||cost.costPct>cost.maxRoundTripCostPct))return false;
    return true;
  }).sort((a,b)=>qualityRank(b)-qualityRank(a)||num(b.fastScore)-num(a.fastScore)||num(b.liveScore)-num(a.liveScore));
  const c=eligible[0];if(!c)return null;
  const symbol=symbolKey(c),confidence=Math.max(.50,Math.min(.74,num(c.liveConfidence,.50)+Math.max(0,num(c.fastScore))*0.025));
  return{symbol:c.symbol,action:'BUY',confidence,allocation_pct:100,fastScore:num(c.fastScore),buyScore:num(c.buyScore,Math.max(0,num(c.fastScore))),sellScore:num(c.sellScore),liveScore:num(c.liveScore),reason:`FULL-CASH-BEST-AVAILABLE: bester aktuell vollständig ausführbarer Aktienkandidat · Scanner ${num(c.liveScore).toFixed(2)} · Fast ${num(c.fastScore).toFixed(2)} · verfügbare Liquidität wird vollständig eingesetzt`};
}

function fullyDeployAvailableCash(actions,fast){
  const cash=num(fast?.executionCost?.cash,0),nonBuys=(actions||[]).filter(x=>String(x?.action||'').toUpperCase()!=='BUY');
  let buys=(actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY');
  if(!(cash>0.01)||!buys.length)return{actions:[...nonBuys,...buys],applied:false,removedForCost:[]};
  const removedForCost=[];
  for(let pass=0;pass<4&&buys.length;pass++){
    const weights=buys.map(x=>Math.max(.1,num(x.allocation_pct,1))*Math.max(.35,1+qualityRank(x)/12)),sum=weights.reduce((a,b)=>a+b,0)||1;
    const allocated=buys.map((x,i)=>({...x,allocation_pct:+(100*weights[i]/sum).toFixed(4)}));
    const bad=allocated.filter(x=>{const c=estimateAiBuyCost(fast,x.allocation_pct,x.symbol);return c&&(!Number.isFinite(c.costPct)||c.costPct>c.maxRoundTripCostPct)});
    if(!bad.length){
      const total=allocated.reduce((a,x)=>a+num(x.allocation_pct),0),delta=+(100-total).toFixed(4);if(Math.abs(delta)>.0001)allocated[0].allocation_pct=+(num(allocated[0].allocation_pct)+delta).toFixed(4);
      return{actions:[...nonBuys,...allocated.map(x=>({...x,reason:`${String(x.reason||'').slice(0,360)} · FULL-CASH: Anteil am verfügbaren Cash ${num(x.allocation_pct).toFixed(2)}%`}))],applied:true,removedForCost};
    }
    const badSet=new Set(bad.map(symbolKey));for(const x of bad)removedForCost.push(symbolKey(x));buys=buys.filter(x=>!badSet.has(symbolKey(x)));
  }
  return{actions:[...nonBuys,...buys],applied:false,removedForCost};
}

export function enforceFastExecutionGuards(aiResponse,fast){
  if(!fast)return aiResponse;const raw=responseText(aiResponse),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return aiResponse;
  try{
    const j=JSON.parse(raw.slice(a,b+1)),actions=Array.isArray(j.actions)?j.actions:[],ctx=new Map((fast.context||[]).map(x=>[symbolKey(x),x])),gaps=new Map((fast.gapContext||[]).map(x=>[symbolKey(x),x])),ratios=fast?.volumeConfirmation?.ratios||{},prevalidated=new Set((fast.actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY').map(symbolKey)),minVolume=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8),minAdx=num(FAST_CALIBRATION.minAdxBuy,18);
    j.actions=actions.map(action=>{
      if(String(action?.action||'').toUpperCase()!=='BUY')return action;const symbol=symbolKey(action),c=ctx.get(symbol),g=gaps.get(symbol),blocks=[];let next={...action};
      if(!c)blocks.push('kein aktueller Fast-Deep-Check');
      if(c?.fxSafety?.valid===false)blocks.push(`FX-Ausführung unsicher (${c.fxSafety.currency||'?'}→${c.fxSafety.baseCurrency||'?'})`);
      if(c?.fastAction==='SELL')blocks.push('Fast-Layer meldet SELL-Risiko');
      if(g?.blockBuy)blocks.push(`Gap/Opening-Range ${g.state||'BLOCK'}`);
      if(c?.regionalBenchmark?.blockBuy)blocks.push(`regional schwach vs ${c.regionalBenchmark.benchmark||'Benchmark'}`);
      if(c?.evidenceDiversity&&!c.evidenceDiversity.enoughForFastBuy&&!prevalidated.has(symbol))blocks.push(`nur ${num(c.evidenceDiversity.count)}/${num(c.evidenceDiversity.minimum,3)} unabhängige Signalsäulen`);
      if(c?.technical){if(c.technical.fresh!==true)blocks.push('technische Daten nicht frisch');if(num(c.technical.vwapDistancePct)<=0)blocks.push('Kurs nicht über VWAP');if(num(c.technical.adx)<minAdx)blocks.push(`ADX ${num(c.technical.adx).toFixed(1)} < ${minAdx.toFixed(1)}`)}else if(c)blocks.push('technischer Deep-Check fehlt');
      if(c&&num(c?.multiTimeframe?.longVotes)<2)blocks.push('weniger als 2 positive Zeitebenen');if(c?.regime==='TREND_DOWN'&&num(c?.multiTimeframe?.longVotes)<3)blocks.push('Abwärtsregime ohne 3/4 MTF-Gegenbestätigung');
      const spread=c?.liquidity?.spreadPct;if(spread!=null&&num(spread)>maxSpread)blocks.push(`Spread ${num(spread).toFixed(2)}% > ${maxSpread.toFixed(2)}%`);const avgVolume=num(c?.liquidity?.avgVolume);if(avgVolume>0&&avgVolume<15000)blocks.push('Liquidität zu niedrig');
      const hasVolume=Object.prototype.hasOwnProperty.call(ratios,symbol)&&ratios[symbol]!=null;
      if(hasVolume&&num(ratios[symbol])<minVolume){next.confidence=Math.min(num(next.confidence,.5),num(ratios[symbol])<.55?.60:.66);next.reason=`5m-Volumen x${num(ratios[symbol]).toFixed(2)} unter x${minVolume.toFixed(2)}: Konfidenz reduziert. ${String(next.reason||'').slice(0,220)}`}
      if(!hasVolume){next.confidence=Math.min(num(next.confidence,.5),.64);next.reason=`Volumenbestätigung nicht verfügbar: Konfidenz reduziert. ${String(next.reason||'').slice(0,220)}`}
      const cost=estimateAiBuyCost(fast,next.allocation_pct,symbol);if(cost&&(!Number.isFinite(cost.costPct)||cost.costPct>cost.maxRoundTripCostPct))blocks.push(`geschätzte Roundtrip-Kosten ${Number.isFinite(cost.costPct)?cost.costPct.toFixed(1):'n/a'}% > ${cost.maxRoundTripCostPct.toFixed(1)}%`);
      if(!blocks.length)return{...next,fastScore:num(c?.fastScore,next.fastScore),buyScore:num(c?.buyScore,next.buyScore),sellScore:num(c?.sellScore,next.sellScore),liveScore:num(c?.liveScore,next.liveScore)};
      return{...next,action:'HOLD',allocation_pct:0,confidence:Math.min(num(next.confidence,.5),.55),reason:`HARD-BUY-BLOCK: ${blocks.join(' · ')}. ${String(next.reason||'').slice(0,220)}`};
    });
    const blocked=j.actions.filter(x=>String(x.reason||'').startsWith('HARD-BUY-BLOCK:')).length;
    let hasExecutableBuy=j.actions.some(x=>String(x?.action||'').toUpperCase()==='BUY'),autoFastBuy=null,forcedCashBuy=null;
    if(!hasExecutableBuy){
      autoFastBuy=bestValidatedFastBuy(fast,j.actions);
      if(autoFastBuy){j.actions.push({...autoFastBuy,reason:`BEST-VALIDATED-BUY: ${String(autoFastBuy.reason||'Vollständig geprüfter Fast-BUY').slice(0,260)}`});hasExecutableBuy=true}
    }
    if(!hasExecutableBuy){
      forcedCashBuy=bestSafeCashDeploy(fast,j.actions);
      if(forcedCashBuy){j.actions.push(forcedCashBuy);hasExecutableBuy=true}
    }
    const deployed=fullyDeployAvailableCash(j.actions,fast);j.actions=deployed.actions;
    const notes=[];if(blocked)notes.push(`${blocked} BUY durch Ausführungs-Schutz blockiert`);if(autoFastBuy)notes.push(`bester vollständig validierter BUY ${String(autoFastBuy.symbol||'')} (Qualitätsrang ${qualityRank(autoFastBuy).toFixed(2)}) übernommen`);if(forcedCashBuy)notes.push(`Cash-Deployment auf besten sicheren Kandidaten ${forcedCashBuy.symbol}`);if(deployed.applied)notes.push('100% des verfügbaren Cashs auf finale BUYs verteilt');if(deployed.removedForCost.length)notes.push(`Kostenfilter entfernte ${[...new Set(deployed.removedForCost)].join(', ')}`);if(notes.length)j.summary=`${String(j.summary||'KI-Plan').slice(0,300)} · ${notes.join(' · ')}.`;
    return{...aiResponse,response:JSON.stringify(j)};
  }catch{return aiResponse}
}

export function isLowerAiPlanCooldown(aiResponse){return responseText(aiResponse).includes('KI-Wartefenster: Markt und News werden weiter jede Minute gescannt')}
