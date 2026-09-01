const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const canonicalScore=v=>{let x=num(v);if(x>0&&x<=10)x*=10;return clamp(x,0,100)};
const normName=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/&/g,' AND ').replace(/\b(SE|SA|AG|NV|PLC|ASA|AB|OYJ|SPA|S P A|INC|CORP|CORPORATION|LTD|LIMITED|HOLDING|HOLDINGS|GROUP|GROUPE)\b/g,' ').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();

export const PAPER_EXPLORATION_V3172={
  version:31.74,
  enabled:true,
  paperOnly:true,
  minMatured:80,
  minMissedOpportunities:5,
  maxExistingBuySamples:0,
  minScore:28,
  minForecastScore:28,
  minSignalConfidence:.40,
  minAgreement:2,
  minVelocity5:.5,
  staticMinScore:58,
  staticMinForecastUplift:2.5,
  staticMinConfidence:.60,
  staticMinAgreement:1,
  allocationPct:6,
  maxOpenPositionsForProbe:0,
  minMinutesBetweenProbes:20,
  reentryMinutes:45
};

const HARD=/HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|REENTRY|SUSPEND|HALT|DELIST|MARKET CLOSED|TRADE-REPUBLIC-BLOCK|TARGET-VENUE/i;
const brokerExact=c=>c?.brokerVerified===true&&String(c?.assetClass||c?.type||c?.instrument_type||'EQUITY').toUpperCase()==='EQUITY'&&String(c?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'&&/Trade Republic/i.test(String(c?.brokerVerificationSource||''))&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(c?.isin||''));
const eventOf=c=>String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase();
const sellOf=c=>String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
const lastTs=x=>Date.parse(String(x?.ts||x?.at||x?.timestamp||x?.time||''));

function brokerMap(state={},brokerRows=[]){
  const bySymbol=new Map(),byName=new Map();
  for(const r of arr(brokerRows)){
    const s=key(r);if(s)bySymbol.set(s,r);
    for(const n of [r?.tradeRepublicName,r?.name,r?.displayName,r?.instrumentName]){const nn=normName(n);if(nn&&!byName.has(nn))byName.set(nn,r)}
  }
  const out=new Map();
  for(const c of arr(state?.candidates)){
    const s=key(c);if(!s)continue;
    const cn=normName(c?.tradeRepublicName||c?.name),r=bySymbol.get(s)||byName.get(cn);
    out.set(s,r?{...r,...c,isin:r?.isin||c?.isin,brokerVerified:r?.brokerVerified===true,brokerMatchMode:r?.brokerMatchMode||c?.brokerMatchMode,brokerVerificationSource:r?.brokerVerificationSource||c?.brokerVerificationSource,assetClass:r?.assetClass||c?.assetClass,tradeRepublicName:r?.tradeRepublicName||c?.tradeRepublicName}:c);
  }
  return out;
}
function recentGlobalProbeBlocked(state,now,cfg){
  const cutoff=cfg.minMinutesBetweenProbes*60000;
  return arr(state?.history).some(x=>['BUY','KAUF'].includes(String(x?.action||x?.side||'').toUpperCase())&&Number.isFinite(lastTs(x))&&now-lastTs(x)>=0&&now-lastTs(x)<cutoff);
}
function recentSellBlocked(state,symbol,now,cfg){
  const rows=arr(state?.history).filter(x=>key(x)===symbol&&['SELL','VERKAUF'].includes(String(x?.action||x?.side||'').toUpperCase())).sort((a,b)=>lastTs(b)-lastTs(a));
  const t=lastTs(rows[0]);return Number.isFinite(t)&&now-t>=0&&now-t<cfg.reentryMinutes*60000;
}
function candidateAgreement(c={}){
  const score=canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score),m5=num(c?.momentum5Pct,c?.momentum5),m20=num(c?.momentum20Pct,c?.momentum20),news=clamp(num(c?.newsScore??c?.news_score??c?.news),-1,1);
  return Number(score>=58)+Number(m5>0)+Number(m20>0)+Number(news>=.05);
}
function candidatePrediction(c={}){
  const score=canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score),velocity=num(c?.scoreDeltaStable,num(c?.liveFeedbackScorePoints,num(c?.scoreDeltaRaw,0)));
  return{symbol:key(c),score,forecast20mScore:score,signalConfidence:clamp(num(c?.liveConfidence??c?.confidence,.5),0,1),velocity5:velocity,agreement:candidateAgreement(c),m5:num(c?.momentum5Pct,c?.momentum5),m20:num(c?.momentum20Pct,c?.momentum20),accel:num(c?.acceleration5Pct,c?.momentumAcceleration5),news:clamp(num(c?.newsScore??c?.news_score??c?.news),-1,1),day:num(c?.day_change??c?.dayChange??c?.day),rsi:num(c?.intradayRsi??c?.rsi,50),direction:String(c?.chartDirectionMode||c?.chartDirection20m||'').toUpperCase(),regime:String(c?.marketRegime||c?.regime||'').toUpperCase(),currentTapeFallback:true};
}
function candidateEligible(p,c,a,state,now,cfg){
  const symbol=key(c||p);
  if(!p||!c||!brokerExact(c))return{ok:false,reason:'BROKER_NOT_EXACT',symbol};
  if(HARD.test(String(a?.reason||''))||eventOf(c)==='HIGH'||sellOf(c)==='STRONG')return{ok:false,reason:'HARD_RISK',symbol};
  if(recentSellBlocked(state,symbol,now,cfg))return{ok:false,reason:'REENTRY_COOLDOWN',symbol};
  const score=canonicalScore(p?.score??c?.daytradeLiveScore??c?.decisionScore??c?.score),forecast=num(p?.forecast20mScore,score),confidence=clamp(num(p?.signalConfidence,c?.liveConfidence??c?.confidence??.5),0,1),velocity=num(p?.velocity5),agreement=Math.max(0,Math.round(num(p?.agreement,candidateAgreement(c)))),m5=num(p?.m5,c?.momentum5Pct??c?.momentum5),m20=num(p?.m20,c?.momentum20Pct??c?.momentum20),acc=num(p?.accel,c?.acceleration5Pct??c?.momentumAcceleration5),news=clamp(num(p?.news,c?.newsScore??c?.news_score??c?.news),-1,1),day=num(p?.day,c?.day_change??c?.dayChange??c?.day),rsi=num(p?.rsi,c?.intradayRsi??c?.rsi??50),direction=String(p?.direction||c?.chartDirectionMode||c?.chartDirection20m||'').toUpperCase(),regime=String(p?.regime||'').toUpperCase(),quoteAge=num(c?.quoteAgeMinutes,NaN),uplift=forecast-score;
  const market=String(state?.marketPhase||state?.market_phase||state?.config?.market_phase||state?.config?.marketPhase||'').toUpperCase();
  const diag={symbol,score:+score.toFixed(1),forecast:+forecast.toFixed(2),uplift:+uplift.toFixed(2),confidence:+confidence.toFixed(3),velocity:+velocity.toFixed(2),agreement,m5:+m5.toFixed(3),m20:+m20.toFixed(3),direction,regime};
  if(/CLOSED|OFFLINE|HOLIDAY/.test(market))return{ok:false,reason:'MARKET_CLOSED',...diag};
  if(Number.isFinite(quoteAge)&&quoteAge>3)return{ok:false,reason:'STALE_QUOTE',...diag};
  if(score<cfg.minScore||forecast<cfg.minForecastScore||forecast<score-1)return{ok:false,reason:'SCORE',...diag};
  if(regime==='BEAR'||regime==='VOLATILE'||news<=-.25||day<=-3.5||day>=4||rsi>=74)return{ok:false,reason:'RISK_PROFILE',...diag};
  const dynamicConfirm=confidence>=cfg.minSignalConfidence&&velocity>=cfg.minVelocity5&&agreement>=cfg.minAgreement;
  const staticConfirm=score>=cfg.staticMinScore&&uplift>=cfg.staticMinForecastUplift&&confidence>=cfg.staticMinConfidence&&agreement>=cfg.staticMinAgreement;
  const currentTapeConfirm=p?.currentTapeFallback===true&&score>=cfg.staticMinScore&&confidence>=cfg.staticMinConfidence&&agreement>=2&&m5>=.03&&m20>=.04&&news>-.15;
  if(!dynamicConfirm&&!staticConfirm&&!currentTapeConfirm)return{ok:false,reason:'CONFIRMATION',dynamicConfirm,staticConfirm,currentTapeConfirm,...diag};
  const directional=(m5>0||m20>0||direction==='UP'),notFalling=m5>=-.08&&m20>=-.12,impulse=(m5>=.03||m20>=.04||acc>=.005||direction==='UP');
  const learnedStaticTape=(staticConfirm||currentTapeConfirm)&&agreement>=2&&m5>=-.03&&m20>=-.05;
  if((!directional||!notFalling||!impulse)&&!learnedStaticTape)return{ok:false,reason:'NO_POSITIVE_TAPE',dynamicConfirm,staticConfirm,currentTapeConfirm,...diag};
  const rank=forecast+score*.35+velocity*.35+confidence*8+agreement*1.5+Math.max(0,m5)*2+Math.max(0,m20);
  return{ok:true,rank,score,forecast,confidence,velocity,agreement,m5,m20,acc,news,day,rsi,confirmationMode:dynamicConfirm?'DYNAMIC':staticConfirm?'STATIC_FORECAST':'CURRENT_TAPE'};
}

export function enforcePaperExplorationV3172(plan,state={},learning={},brokerRows=[],now=Date.now(),cfg=PAPER_EXPLORATION_V3172){
  const counters={eligible:0,injected:0,reason:null,chosen:null,blocked:[]};
  if(!plan||!Array.isArray(plan.actions)||cfg.enabled!==true)return{plan,counters:{...counters,reason:'DISABLED_OR_INVALID'}};
  const profile=learning?.status||{},positions=arr(state?.positions);
  if(positions.length>cfg.maxOpenPositionsForProbe)return{plan,counters:{...counters,reason:'POSITION_ALREADY_OPEN'}};
  if(arr(plan.actions).some(a=>String(a?.action||'').toUpperCase()==='BUY'))return{plan,counters:{...counters,reason:'NORMAL_BUY_ALREADY_EXISTS'}};
  if(num(profile?.matured)<cfg.minMatured||num(profile?.buySamples)>cfg.maxExistingBuySamples||num(profile?.missedOpportunities)<cfg.minMissedOpportunities)return{plan,counters:{...counters,reason:'LEARNING_TRIGGER_NOT_MET'}};
  if(recentGlobalProbeBlocked(state,now,cfg))return{plan,counters:{...counters,reason:'PROBE_SPACING'}};
  const cmap=brokerMap(state,brokerRows),predictions=learning?.predictions||{},actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const rows=[],blocked=[],symbols=new Set([...Object.keys(predictions).map(key),...arr(state?.candidates).map(key)]);
  for(const s of symbols){
    const c=cmap.get(s);if(!s||!c){blocked.push({symbol:s,reason:'MISSING_CURRENT_CANDIDATE'});continue}
    const p=predictions[s]||predictions[Object.keys(predictions).find(x=>key(x)===s)]||candidatePrediction(c),i=idx.get(s),a=i===undefined?{}:actions[i],assessment=candidateEligible({...p,symbol:s},c,a,state,now,cfg);if(assessment.ok)rows.push({s,c,p,a,i,...assessment});else blocked.push(assessment);
  }
  rows.sort((a,b)=>b.rank-a.rank);counters.eligible=rows.length;counters.blocked=blocked.slice(0,8);
  const chosen=rows[0];if(!chosen)return{plan,counters:{...counters,reason:'NO_CONFIRMED_EXPLORATION_CANDIDATE'}};
  const pct=cfg.allocationPct,buy={...chosen.a,symbol:chosen.s,name:chosen.c?.name||chosen.s,action:'BUY',allocation_pct:pct,confidence:chosen.confidence,paperExplorationV3172:true,outcomeLearningProbeV3172:true,explorationConfirmationMode:chosen.confirmationMode,forecast20mScore:+chosen.forecast.toFixed(2),scoreVelocity5m:+chosen.velocity.toFixed(2),entryDecisionScore:+chosen.score.toFixed(1),reason:`V31.7.4 PAPER-EXPLORATION: Nach ${num(profile.matured)} ausgewerteten 20m-Fällen, ${num(profile.missedOpportunities)} verpassten Chancen und weiterhin 0 BUY-Samples wird genau eine kleine Lernposition eröffnet. ${chosen.s}: Score ${chosen.score.toFixed(1)}, Prognose ${chosen.forecast.toFixed(1)}, Geschwindigkeit ${chosen.velocity>=0?'+':''}${chosen.velocity.toFixed(2)}/5m, Konfidenz ${(chosen.confidence*100).toFixed(0)}%, Bestätigungen ${chosen.agreement}, Modus ${chosen.confirmationMode}, Momentum 5m ${chosen.m5.toFixed(2)}% / 20m ${chosen.m20.toFixed(2)}%. Trade-Republic-Asset ist exakt verifiziert; harte News-, Markt-, Quote- und Re-Entry-Sperren bleiben bindend. Starter ${pct.toFixed(1)}%.`};
  if(chosen.i===undefined)actions.push(buy);else actions[chosen.i]=buy;
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,118)} · V31.7.4 Lern-Probe BUY ${chosen.s} ${pct.toFixed(1)}%.`;
  counters.injected=1;counters.reason='CONTROLLED_PAPER_EXPLORATION';counters.chosen={symbol:chosen.s,score:+chosen.score.toFixed(1),forecast:+chosen.forecast.toFixed(1),confidence:+chosen.confidence.toFixed(3),velocity:+chosen.velocity.toFixed(2),agreement:chosen.agreement,confirmationMode:chosen.confirmationMode,allocationPct:pct};
  return{plan,counters};
}
