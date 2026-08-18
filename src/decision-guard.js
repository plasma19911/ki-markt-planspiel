import {FAST_CALIBRATION} from './generated-fast-calibration.js';
import {estimateAiBuyCost} from './execution-cost-overlay.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function responseText(r){return String(r?.response||r?.result?.response||'')}

function bestValidatedFastBuy(fast,existingActions=[]){
  const existingSymbols=new Set((existingActions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY').map(x=>String(x?.symbol||'').toUpperCase()));
  const blockedSymbols=new Set((existingActions||[]).filter(x=>['SELL'].includes(String(x?.action||'').toUpperCase())).map(x=>String(x?.symbol||'').toUpperCase()));
  return (fast?.actions||[])
    .filter(x=>String(x?.action||'').toUpperCase()==='BUY')
    .filter(x=>!existingSymbols.has(String(x?.symbol||'').toUpperCase())&&!blockedSymbols.has(String(x?.symbol||'').toUpperCase()))
    .sort((a,b)=>num(b.confidence)-num(a.confidence)||num(b.fastScore)-num(a.fastScore))[0]||null;
}

export function enforceFastExecutionGuards(aiResponse,fast){
  if(!fast)return aiResponse;const raw=responseText(aiResponse),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return aiResponse;
  try{
    const j=JSON.parse(raw.slice(a,b+1)),actions=Array.isArray(j.actions)?j.actions:[],ctx=new Map((fast.context||[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),gaps=new Map((fast.gapContext||[]).map(x=>[String(x.symbol||'').toUpperCase(),x])),ratios=fast?.volumeConfirmation?.ratios||{},minVolume=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8),minAdx=num(FAST_CALIBRATION.minAdxBuy,18);
    j.actions=actions.map(action=>{
      if(String(action?.action||'').toUpperCase()!=='BUY')return action;const symbol=String(action?.symbol||'').toUpperCase(),c=ctx.get(symbol),g=gaps.get(symbol),blocks=[];let next={...action};
      if(!c)blocks.push('kein aktueller Fast-Deep-Check');
      if(c?.fxSafety?.valid===false)blocks.push(`FX-Ausführung unsicher (${c.fxSafety.currency||'?'}→${c.fxSafety.baseCurrency||'?'})`);
      if(c?.fastAction==='SELL')blocks.push('Fast-Layer meldet SELL-Risiko');
      if(g?.blockBuy)blocks.push(`Gap/Opening-Range ${g.state||'BLOCK'}`);
      if(c?.regionalBenchmark?.blockBuy)blocks.push(`regional schwach vs ${c.regionalBenchmark.benchmark||'Benchmark'}`);
      if(c?.evidenceDiversity&&!c.evidenceDiversity.enoughForFastBuy)blocks.push(`nur ${num(c.evidenceDiversity.count)}/${num(c.evidenceDiversity.minimum,3)} unabhängige Signalsäulen`);
      if(c?.technical){if(c.technical.fresh!==true)blocks.push('technische Daten nicht frisch');if(num(c.technical.vwapDistancePct)<=0)blocks.push('Kurs nicht über VWAP');if(num(c.technical.adx)<minAdx)blocks.push(`ADX ${num(c.technical.adx).toFixed(1)} < ${minAdx.toFixed(1)}`)}else if(c)blocks.push('technischer Deep-Check fehlt');
      if(c&&num(c?.multiTimeframe?.longVotes)<2)blocks.push('weniger als 2 positive Zeitebenen');if(c?.regime==='TREND_DOWN'&&num(c?.multiTimeframe?.longVotes)<3)blocks.push('Abwärtsregime ohne 3/4 MTF-Gegenbestätigung');
      const spread=c?.liquidity?.spreadPct;if(spread!=null&&num(spread)>maxSpread)blocks.push(`Spread ${num(spread).toFixed(2)}% > ${maxSpread.toFixed(2)}%`);const avgVolume=num(c?.liquidity?.avgVolume);if(avgVolume>0&&avgVolume<15000)blocks.push('Liquidität zu niedrig');

      // Relative 5m-Lautstärke ist ein Bestätigungssignal, kein alleiniger Hard-Block.
      // Vorher wurde bei fehlendem Volumen zusätzlich die Order verkleinert; bei festen
      // Brokergebühren erhöhte das paradoxerweise die Kostenquote und blockierte Käufe.
      const hasVolume=Object.prototype.hasOwnProperty.call(ratios,symbol)&&ratios[symbol]!=null;
      if(hasVolume&&num(ratios[symbol])<minVolume){next.confidence=Math.min(num(next.confidence,.5),num(ratios[symbol])<.55?.60:.66);next.reason=`5m-Volumen x${num(ratios[symbol]).toFixed(2)} unter x${minVolume.toFixed(2)}: Konfidenz reduziert. ${String(next.reason||'').slice(0,220)}`}
      if(!hasVolume){next.confidence=Math.min(num(next.confidence,.5),.64);next.reason=`Volumenbestätigung nicht verfügbar: Konfidenz reduziert. ${String(next.reason||'').slice(0,220)}`}

      const cost=estimateAiBuyCost(fast,next.allocation_pct,symbol);if(cost&&(!Number.isFinite(cost.costPct)||cost.costPct>cost.maxRoundTripCostPct))blocks.push(`geschätzte Roundtrip-Kosten ${Number.isFinite(cost.costPct)?cost.costPct.toFixed(1):'n/a'}% > ${cost.maxRoundTripCostPct.toFixed(1)}%`);
      if(!blocks.length)return next;return{...next,action:'HOLD',allocation_pct:0,confidence:Math.min(num(next.confidence,.5),.55),reason:`HARD-BUY-BLOCK: ${blocks.join(' · ')}. ${String(next.reason||'').slice(0,220)}`};
    });
    const blocked=j.actions.filter(x=>String(x.reason||'').startsWith('HARD-BUY-BLOCK:')).length;
    const hasExecutableBuy=j.actions.some(x=>String(x?.action||'').toUpperCase()==='BUY');
    let autoFastBuy=null;
    if(!hasExecutableBuy){
      autoFastBuy=bestValidatedFastBuy(fast,j.actions);
      if(autoFastBuy){j.actions.push({...autoFastBuy,reason:`BEST-VALIDATED-BUY: ${String(autoFastBuy.reason||'Vollständig geprüfter Fast-BUY').slice(0,260)}`})}
    }
    const notes=[];if(blocked)notes.push(`${blocked} BUY durch Ausführungs-Schutz blockiert`);if(autoFastBuy)notes.push(`bester vollständig validierter BUY ${String(autoFastBuy.symbol||'')} übernommen`);if(notes.length)j.summary=`${String(j.summary||'KI-Plan').slice(0,300)} · ${notes.join(' · ')}.`;
    return{...aiResponse,response:JSON.stringify(j)};
  }catch{return aiResponse}
}

export function isLowerAiPlanCooldown(aiResponse){return responseText(aiResponse).includes('KI-Wartefenster: Markt und News werden weiter jede Minute gescannt')}
