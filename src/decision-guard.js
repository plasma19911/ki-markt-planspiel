import {FAST_CALIBRATION} from './generated-fast-calibration.js';
import {estimateAiBuyCost} from './execution-cost-overlay.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function responseText(r){return String(r?.response||r?.result?.response||'')}
function qualityRank(a){
  const live=num(a?.liveScore),buy=num(a?.buyScore,a?.fastScore),sell=num(a?.sellScore),confidence=num(a?.confidence,a?.liveConfidence);
  return live*.60+buy*.80-sell*.70+confidence*1.40;
}
function symbolKey(x){return String(x?.symbol||'').toUpperCase()}
const HARD_HOLD=/HARD-BUY-BLOCK|HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|MARKET CLOSED|TRADE-REPUBLIC-BLOCK|TARGET-VENUE|SUSPEND|HALT|DELIST/i;

function qualifiedOpportunityFallbackEligible(action,fast){
  const symbol=symbolKey(action),c=(fast?.context||[]).find(x=>symbolKey(x)===symbol),g=(fast?.gapContext||[]).find(x=>symbolKey(x)===symbol),ratios=fast?.volumeConfirmation?.ratios||{},hasRatio=Object.prototype.hasOwnProperty.call(ratios,symbol)&&ratios[symbol]!=null,ratio=hasRatio?num(ratios[symbol],NaN):NaN;
  if(!c||!/QUALIFIED-OPPORTUNITY/i.test(String(action?.reason||'')))return false;
  const e=c?.evidenceDiversity||{},pillars=Array.isArray(e?.pillars)?e.pillars:[],buy=num(action?.buyScore,action?.fastScore),live=num(action?.liveScore,c?.liveScore),spread=c?.liquidity?.spreadPct,avgVolume=num(c?.liquidity?.avgVolume),minAdx=Math.max(22,num(FAST_CALIBRATION.minAdxBuy,18)),maxSpread=Math.min(.50,num(FAST_CALIBRATION.maxSpreadPct,.8));
  const orthogonal=pillars.includes('RELATIVE_STAERKE')||pillars.includes('KATALYSATOR')||pillars.includes('TEILNAHME_VOL');
  return Boolean(
    buy>=Math.max(5.2,num(FAST_CALIBRATION.buyThreshold,4.2)+1)&&live>=4.5&&
    c?.technical?.fresh===true&&num(c?.technical?.vwapDistancePct)>.10&&num(c?.technical?.adx)>=minAdx&&num(c?.technical?.plusDI)>num(c?.technical?.minusDI)&&
    num(c?.multiTimeframe?.longVotes)>=2&&c?.fxSafety?.valid!==false&&
    e?.enoughForQualifiedOpportunity===true&&num(e?.count)>=2&&orthogonal&&
    hasRatio&&Number.isFinite(ratio)&&ratio>=.65&&
    (spread==null||num(spread)<=maxSpread)&&(avgVolume<=0||avgVolume>=15000)&&
    g?.blockBuy!==true&&c?.regionalBenchmark?.blockBuy!==true&&c?.regime!=='TREND_DOWN'&&c?.regime!=='VOLATILE'
  );
}

function strictFallbackFastBuyEligible(action,fast){
  if(FAST_CALIBRATION.validated===true)return true;
  if(qualifiedOpportunityFallbackEligible(action,fast))return true;
  const symbol=symbolKey(action),c=(fast?.context||[]).find(x=>symbolKey(x)===symbol),g=(fast?.gapContext||[]).find(x=>symbolKey(x)===symbol),ratios=fast?.volumeConfirmation?.ratios||{},ratio=Object.prototype.hasOwnProperty.call(ratios,symbol)?num(ratios[symbol],NaN):NaN;
  const minVolume=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),minAdx=Math.max(22,num(FAST_CALIBRATION.minAdxBuy,18)+2),maxSpread=Math.min(.50,num(FAST_CALIBRATION.maxSpreadPct,.8)),spread=c?.liquidity?.spreadPct;
  return Boolean(c&&c?.technical?.fresh===true&&num(c?.technical?.vwapDistancePct)>.10&&num(c?.technical?.adx)>=minAdx&&num(c?.multiTimeframe?.longVotes)>=3&&c?.fxSafety?.valid!==false&&c?.evidenceDiversity?.enoughForFastBuy===true&&Number.isFinite(ratio)&&ratio>=minVolume&&spread!=null&&num(spread)<=maxSpread&&g?.blockBuy!==true&&c?.regionalBenchmark?.blockBuy!==true&&c?.regime!=='TREND_DOWN'&&c?.regime!=='VOLATILE');
}

// Ein Fast-BUY darf einen zu vorsichtigen/ausgefallenen AI-Plan ersetzen, aber nur wenn
// der Fast-Layer selbst bereits BUY geliefert hat. Bei nicht validierter historischer
// Kalibrierung ist Auto-Injection nur mit besonders strenger Live-Bestaetigung erlaubt.
function bestValidatedFastBuy(fast,existingActions=[]){
  const existingSymbols=new Set((existingActions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY').map(symbolKey));
  const blockedSymbols=new Set((existingActions||[]).filter(x=>String(x?.action||'').toUpperCase()==='SELL'||HARD_HOLD.test(String(x?.reason||''))).map(symbolKey));
  return (fast?.actions||[])
    .filter(x=>String(x?.action||'').toUpperCase()==='BUY')
    .filter(x=>!existingSymbols.has(symbolKey(x))&&!blockedSymbols.has(symbolKey(x)))
    .filter(x=>strictFallbackFastBuyEligible(x,fast))
    .sort((a,b)=>qualityRank(b)-qualityRank(a)||num(b.confidence)-num(a.confidence)||num(b.fastScore)-num(a.fastScore))[0]||null;
}

// Positionsgroessen aus den vorgelagerten Profit-/Timing-Layern bleiben erhalten.
// Nur ein offensichtlich unmoeglicher Gesamtwert >100% wird proportional gekappt.
function capBuyAllocations(actions,fast){
  const nonBuys=(actions||[]).filter(x=>String(x?.action||'').toUpperCase()!=='BUY');
  let buys=(actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY').map(x=>({...x,allocation_pct:Math.max(0,num(x.allocation_pct))}));
  if(!buys.length)return{actions:[...nonBuys],scaled:false,removedForCost:[]};

  const removedForCost=[];
  buys=buys.filter(x=>{
    const c=estimateAiBuyCost(fast,x.allocation_pct,x.symbol);
    const bad=c&&(!Number.isFinite(c.costPct)||c.costPct>c.maxRoundTripCostPct);
    if(bad)removedForCost.push(symbolKey(x));
    return !bad;
  });
  if(!buys.length)return{actions:[...nonBuys],scaled:false,removedForCost};

  const total=buys.reduce((a,x)=>a+num(x.allocation_pct),0);
  if(total>100.0001){
    buys=buys.map(x=>({...x,allocation_pct:+(num(x.allocation_pct)/total*100).toFixed(4),reason:`${String(x.reason||'').slice(0,360)} · Positionssumme auf max. 100% gekappt`}));
    return{actions:[...nonBuys,...buys],scaled:true,removedForCost};
  }
  return{actions:[...nonBuys,...buys],scaled:false,removedForCost};
}

export function enforceFastExecutionGuards(aiResponse,fast){
  if(!fast)return aiResponse;const raw=responseText(aiResponse),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return aiResponse;
  try{
    const j=JSON.parse(raw.slice(a,b+1)),actions=Array.isArray(j.actions)?j.actions:[],ctx=new Map((fast.context||[]).map(x=>[symbolKey(x),x])),gaps=new Map((fast.gapContext||[]).map(x=>[symbolKey(x),x])),ratios=fast?.volumeConfirmation?.ratios||{},prevalidated=new Set((fast.actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY').map(symbolKey)),qualifiedPrevalidated=new Set((fast.actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='BUY'&&qualifiedOpportunityFallbackEligible(x,fast)).map(symbolKey)),minVolume=num(fast?.volumeConfirmation?.minRatio,FAST_CALIBRATION.minRelativeVolume||1.10),maxSpread=num(FAST_CALIBRATION.maxSpreadPct,.8),minAdx=num(FAST_CALIBRATION.minAdxBuy,18);
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
      if(hasVolume&&num(ratios[symbol])<minVolume&&!qualifiedPrevalidated.has(symbol))blocks.push(`5m-Volumen x${num(ratios[symbol]).toFixed(2)} < x${minVolume.toFixed(2)}`);
      if(hasVolume&&num(ratios[symbol])<minVolume&&qualifiedPrevalidated.has(symbol)){next.confidence=Math.min(num(next.confidence,.5),.70);next.reason=`QUALIFIED-HANDOFF: Volumen x${num(ratios[symbol]).toFixed(2)} schwächer, aber Score/Trend/relative Stärke vollständig geprüft. ${String(next.reason||'').slice(0,220)}`}
      if(!hasVolume){next.confidence=Math.min(num(next.confidence,.5),.64);next.reason=`Volumenbestätigung nicht verfügbar: Konfidenz reduziert. ${String(next.reason||'').slice(0,220)}`}
      const cost=estimateAiBuyCost(fast,next.allocation_pct,symbol);if(cost&&(!Number.isFinite(cost.costPct)||cost.costPct>cost.maxRoundTripCostPct))blocks.push(`geschätzte Roundtrip-Kosten ${Number.isFinite(cost.costPct)?cost.costPct.toFixed(1):'n/a'}% > ${num(cost.maxRoundTripCostPct).toFixed(1)}%`);
      if(!blocks.length)return{...next,fastScore:num(c?.fastScore,next.fastScore),buyScore:num(c?.buyScore,next.buyScore),sellScore:num(c?.sellScore,next.sellScore),liveScore:num(c?.liveScore,next.liveScore)};
      return{...next,action:'HOLD',allocation_pct:0,confidence:Math.min(num(next.confidence,.5),.55),reason:`HARD-BUY-BLOCK: ${blocks.join(' · ')}. ${String(next.reason||'').slice(0,220)}`};
    });

    const blocked=j.actions.filter(x=>String(x.reason||'').startsWith('HARD-BUY-BLOCK:')).length;
    let hasExecutableBuy=j.actions.some(x=>String(x?.action||'').toUpperCase()==='BUY'),autoFastBuy=null;
    if(!hasExecutableBuy){
      autoFastBuy=bestValidatedFastBuy(fast,j.actions);
      if(autoFastBuy){
        const qualified=qualifiedOpportunityFallbackEligible(autoFastBuy,fast);
        j.actions.push({...autoFastBuy,allocation_pct:Math.max(0,Math.min(100,num(autoFastBuy.allocation_pct,0))),fastHandoffV3173:true,reason:`${qualified?'QUALIFIED-HANDOFF':'BEST-VALIDATED-BUY'}: ${String(autoFastBuy.reason||'Vollständig geprüfter Fast-BUY').slice(0,260)}`});
        hasExecutableBuy=true;
      }
    }

    const sized=capBuyAllocations(j.actions,fast);j.actions=sized.actions;
    const notes=[];
    if(blocked)notes.push(`${blocked} BUY durch Ausführungs-Schutz blockiert`);
    if(autoFastBuy)notes.push(`bester vollständig validierter BUY ${String(autoFastBuy.symbol||'')} (Qualitätsrang ${qualityRank(autoFastBuy).toFixed(2)}) übernommen`);
    if(!hasExecutableBuy)notes.push(FAST_CALIBRATION.validated===true?'kein bestätigter BUY – Cash bleibt verfügbar':'kein streng bestätigter BUY – Fast-Kalibrierung ist noch nicht validiert, Cash bleibt verfügbar');
    if(sized.scaled)notes.push('BUY-Summe auf maximal 100% gekappt');
    if(sized.removedForCost.length)notes.push(`Kostenfilter entfernte ${[...new Set(sized.removedForCost)].join(', ')}`);
    if(notes.length)j.summary=`${String(j.summary||'KI-Plan').slice(0,300)} · ${notes.join(' · ')}.`;
    return{...aiResponse,response:JSON.stringify(j)};
  }catch{return aiResponse}
}

export function isLowerAiPlanCooldown(aiResponse){return responseText(aiResponse).includes('KI-Wartefenster: Markt und News werden weiter jede Minute gescannt')}
