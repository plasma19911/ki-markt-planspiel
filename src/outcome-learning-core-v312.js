import {canonicalEntryAssessmentV316,evidenceProfileV315,estimatedActionRoundTripCostPctV317,SHADOW_LEARNING_V314} from './shadow-learning-v314.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const canonicalScore=v=>{let x=num(v);if(x>0&&x<=10)x*=10;return clamp(x,0,100)};

export const OUTCOME_LEARNING_V312={
  version:31.2,
  patch:'31.2-continuous-outcome-learning',
  profitabilityPatch:'31.2.1-net-profit-after-costs',
  storageKey:'outcome-learning-v312',
  horizonsMinutes:[5,20,60,240],
  snapshotSpacingMinutes:4,
  maxSamplesPerSymbol:24,
  maxTrackedSymbols:48,
  maxRecentOutcomes:420,
  maxDecidedOutcomes:180,
  maxCounterfactualOutcomes:120,
  minLearningSamples:20,
  minCurrentScore:58,
  minForecastScore:70,
  maxPredictiveAllocationPct:42,
  maxOpenPositions:4,
  defaultBuyRoundTripCostPct:.45,
  minNetBuyWinPct:.10,
  cautiousAfterBuySamples:3,
  defensiveAfterBuySamples:8,
  missSetupCooldownMinutes:30,
  missRecoveryMinSetups:3,
  missRecoveryMinHitRate:.5,
  missRecoveryMinAvgNetPct:.2,
  missRecoveryMinDataQuality:85,
  missRecoveryMinOrthogonalConfirmations:1,
  missRecoveryMinExpectedNetEdgePct:.25,
  missRecoveryMinEntryScore:60,
  missRecoveryMinForecastScore:68,
  missRecoveryMaxAllocationPct:32,
  missRecoveryMinPositionEur:2200
};

const DEFAULT_WEIGHTS={velocity:3.6,m5:2.8,m20:2.6,accel:2.2,news:1.8,confidence:1.2,direction:1.2};
const WEIGHT_LIMITS={velocity:[.25,7],m5:[.2,6],m20:[.2,6],accel:[.15,5],news:[.1,4.5],confidence:[.05,3],direction:[.05,3]};
const HARD=/HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|REENTRY|SUSPEND|HALT|DELIST|MARKET CLOSED|TRADE-REPUBLIC-BLOCK|TARGET-VENUE/i;
const brokerExact=c=>c?.brokerVerified===true&&String(c?.assetClass||c?.type||c?.instrument_type||'EQUITY').toUpperCase()==='EQUITY'&&String(c?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'&&/Trade Republic/i.test(String(c?.brokerVerificationSource||''))&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(c?.isin||''));
const priceOf=c=>num(c?.price,num(c?.last_price,num(c?.regularMarketPrice,0)));
const scoreOf=c=>canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.daytradeChanceScore??c?.score);
const confidenceOf=c=>clamp(num(c?.liveConfidence,c?.confidence??c?.signal_confidence??.5),0,1);
const m5Of=c=>num(c?.momentum5Pct,c?.momentum5??c?.intraday5m??0);
const m20Of=c=>num(c?.momentum20Pct,c?.momentum20??c?.intraday20m??0);
const accelOf=c=>num(c?.acceleration5Pct,c?.momentumAcceleration5??c?.momentum_acceleration5??0);
const newsOf=c=>clamp(num(c?.newsScore,c?.news_score??c?.news??0),-1,1);
const dayOf=c=>num(c?.day_change,c?.day??c?.dayChange??c?.changePct??0);
const rsiOf=c=>num(c?.intradayRsi,c?.rsi??50);
const directionOf=c=>String(c?.chartDirectionMode||c?.chartDirection20m||c?.direction20m||'').toUpperCase();
const eventOf=c=>String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase();
const sellOf=c=>String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
const themeOf=c=>String(c?.theme||c?.sector||c?.industry||'UNKNOWN').trim().slice(0,80)||'UNKNOWN';
const sourceList=c=>[...new Set(arr(c?.newsSources||c?.news_sources).map(x=>String(x?.source||x||'').trim()).filter(Boolean).concat(String(c?.newsSource||c?.news_source||'').trim()).filter(Boolean))].slice(0,4);

function cleanMemory(memory={}){
  const m=memory&&typeof memory==='object'?memory:{};
  const oldStats=m.stats&&typeof m.stats==='object'?m.stats:{};
  const weights={...DEFAULT_WEIGHTS,...(m.weights&&typeof m.weights==='object'?m.weights:{})};
  for(const k of Object.keys(DEFAULT_WEIGHTS)){const [lo,hi]=WEIGHT_LIMITS[k];weights[k]=clamp(weights[k],lo,hi)}
  return{
    version:OUTCOME_LEARNING_V312.version,
    updatedAt:m.updatedAt||null,
    symbols:m.symbols&&typeof m.symbols==='object'?m.symbols:{},
    weights,
    recent20:trimRecent20(arr(m.recent20).filter(x=>x&&Number.isFinite(Number(x.ts)))),
    groupStats:m.groupStats&&typeof m.groupStats==='object'?m.groupStats:{regime:{},theme:{},source:{}},
    stats:{evaluated20:Math.max(0,num(oldStats.evaluated20,oldStats.matured)),weightUpdates:Math.max(0,num(oldStats.weightUpdates)),missedOpportunities:Math.max(0,num(oldStats.missedOpportunities)),badBuys:Math.max(0,num(oldStats.badBuys)),earlySells:Math.max(0,num(oldStats.earlySells)),correctSells:Math.max(0,num(oldStats.correctSells))}
  };
}

function vector(c={}){
  return{symbol:key(c),price:priceOf(c),score:scoreOf(c),confidence:confidenceOf(c),m5:m5Of(c),m20:m20Of(c),accel:accelOf(c),news:newsOf(c),day:dayOf(c),rsi:rsiOf(c),direction:directionOf(c),event:eventOf(c),sell:sellOf(c),theme:themeOf(c),sources:sourceList(c)};
}
function regimeOf(v){if(Math.abs(v.day)>=4||Math.abs(v.m5)>=1.1)return'VOLATILE';if(v.day>=.8&&v.m20>=.05)return'BULL';if(v.day<=-.8&&v.m20<=-.05)return'BEAR';return'SIDEWAYS'}
function featureVector(v,velocity5=0){return{velocity:clamp(velocity5/4,-1.5,1.75),m5:clamp(v.m5/.35,-1.5,1.5),m20:clamp(v.m20/.6,-1.5,1.5),accel:clamp(v.accel/.08,-1.5,1.5),news:clamp(v.news,-1,1),confidence:clamp((v.confidence-.5)/.35,-1,1),direction:v.direction==='UP'?1:v.direction==='DOWN'?-1:0}}
function weightedAverage(rows,field,now){let sw=0,s=0;for(const r of rows){const age=Math.max(0,now-num(r.ts));const w=Math.exp(-age/(3*24*60*60*1000));const x=num(r?.[field]);s+=x*w;sw+=w}return sw?s/sw:null}
function buyNetReturn(row={}){return num(row?.netReturnPct,num(row?.returnPct)-num(row?.estimatedRoundTripCostPct,OUTCOME_LEARNING_V312.defaultBuyRoundTripCostPct))}
function counterfactualSetupOutcomes(rows=[]){
  const groups=new Map();
  for(const row of [...arr(rows)].sort((a,b)=>num(a?.sampleTs,a?.ts)-num(b?.sampleTs,b?.ts))){
    const id=String(row?.counterfactualSetupId||'');if(!id)continue;
    const group=groups.get(id)||{id,rows:[]};group.rows.push(row);groups.set(id,group);
  }
  const out=[];
  for(const group of groups.values()){
    const at=h=>group.rows.find(x=>num(x?.counterfactualHorizonMinutes,20)===h),r20=at(20),r60=at(60),base=r20||r60;
    if(!base)continue;
    const net20=r20?num(r20.counterfactualNetReturnPct):null,net60=r60?num(r60.counterfactualNetReturnPct):null;
    const combined=net20!=null&&net60!=null?net20*.65+net60*.35:net20!=null?net20:net60;
    out.push({...base,counterfactualNet20mPct:net20,counterfactualNet60mPct:net60,counterfactualNetReturnPct:+num(combined).toFixed(4),counterfactualComplete60m:net60!=null});
  }
  return out;
}
function learningProfile(m,now=Date.now()){
  const allRecent=arr(m.recent20).filter(x=>now-num(x.ts)<7*24*60*60*1000),recent=allRecent.filter(x=>x?.counterfactualOnly!==true),matured=recent.length,buys=recent.filter(x=>x.action==='BUY'),holds=recent.filter(x=>x.action==='HOLD'),sells=recent.filter(x=>x.action==='SELL');
  const newsRows=recent.filter(x=>Math.abs(num(x.newsSignal))>=.05),positiveNewsRows=newsRows.filter(x=>num(x.newsSignal)>0),negativeNewsRows=newsRows.filter(x=>num(x.newsSignal)<0),avgNews20m=weightedAverage(newsRows,'returnPct',now);
  const buyRows=buys.map(x=>({...x,netReturnPct:buyNetReturn(x)}));
  const buyWins=buyRows.filter(x=>num(x.netReturnPct)>=OUTCOME_LEARNING_V312.minNetBuyWinPct).length,buyHitRate=buys.length?buyWins/buys.length:null,avgBuyNet=weightedAverage(buyRows,'netReturnPct',now),avgBuyRaw=weightedAverage(buys,'returnPct',now),avgAll=weightedAverage(recent,'returnPct',now);
  const missedObservations=holds.filter(x=>num(x.returnPct)>=.5).length,actionableSetups=counterfactualSetupOutcomes(allRecent.filter(x=>x?.counterfactualEligible===true)),missedRows=actionableSetups.filter(x=>num(x?.counterfactualNetReturnPct)>=OUTCOME_LEARNING_V312.minNetBuyWinPct),missed=missedRows.length,actionableMissRate=actionableSetups.length?missed/actionableSetups.length:0,avgMissedNet=weightedAverage(missedRows,'counterfactualNetReturnPct',now),badBuys=buyRows.filter(x=>num(x.netReturnPct)<=0).length,earlySells=sells.filter(x=>num(x.returnPct)>=.5).length,correctSells=sells.filter(x=>num(x.returnPct)<=-.25).length;
  const missRecoveryActive=missed>=OUTCOME_LEARNING_V312.missRecoveryMinSetups&&actionableMissRate>=OUTCOME_LEARNING_V312.missRecoveryMinHitRate&&num(avgMissedNet)>=OUTCOME_LEARNING_V312.missRecoveryMinAvgNetPct;
  let thresholdAdjustment=0,allocationAdjustment=0,mode='WARMUP';
  if(matured>=OUTCOME_LEARNING_V312.minLearningSamples){
    mode='BALANCED';
    const badBuyRate=buys.length?badBuys/buys.length:0,missRate=actionableMissRate,hasCautiousEvidence=buys.length>=OUTCOME_LEARNING_V312.cautiousAfterBuySamples,hasDefensiveEvidence=buys.length>=OUTCOME_LEARNING_V312.defensiveAfterBuySamples;
    if(hasDefensiveEvidence&&((buyHitRate??0)<.45||(avgBuyNet??0)<=0||badBuyRate>=.5)){thresholdAdjustment=3;allocationAdjustment=-4;mode='DEFENSIVE'}
    else if(hasCautiousEvidence&&((buyHitRate??0)<.55||(avgBuyNet??0)<.08)){thresholdAdjustment=1.5;allocationAdjustment=-2;mode='CAUTIOUS'}
    else if(missRate>.28&&(!hasCautiousEvidence||((buyHitRate??0)>=.55&&(avgBuyNet??0)>=.05))){thresholdAdjustment=-2;allocationAdjustment=4;mode='OPPORTUNITY'}
    else if(buys.length>=8&&(buyHitRate??0)>=.62&&(avgBuyNet??0)>=.15){thresholdAdjustment=-2;allocationAdjustment=6;mode='CONFIDENT'}
    else if(missRate>.16&&(!hasCautiousEvidence||((buyHitRate??0)>=.55&&(avgBuyNet??0)>=.05))){thresholdAdjustment=-1;allocationAdjustment=2;mode='PROACTIVE'}
  }
  return{mode,matured,buySamples:buys.length,newsSamples:newsRows.length,positiveNewsSamples:positiveNewsRows.length,negativeNewsSamples:negativeNewsRows.length,avgNews20mReturnPct:avgNews20m==null?null:+avgNews20m.toFixed(3),buyHitRate:buyHitRate==null?null:+(buyHitRate*100).toFixed(1),avgBuy20mReturnPct:avgBuyNet==null?null:+avgBuyNet.toFixed(3),avgBuy20mNetReturnPct:avgBuyNet==null?null:+avgBuyNet.toFixed(3),avgBuy20mRawReturnPct:avgBuyRaw==null?null:+avgBuyRaw.toFixed(3),avg20mReturnPct:avgAll==null?null:+avgAll.toFixed(3),missedOpportunities:missed,missedObservations,actionableHoldSetups:actionableSetups.length,actionableMissRate:+(actionableMissRate*100).toFixed(1),avgMissedNetReturnPct:avgMissedNet==null?null:+avgMissedNet.toFixed(3),missRecoveryActive,badBuys,earlySells,correctSells,thresholdAdjustment,allocationAdjustment,costAwareBuyLearning:true,newsOutcomeLearning:true,counterfactualLearning:true,defaultBuyRoundTripCostPct:OUTCOME_LEARNING_V312.defaultBuyRoundTripCostPct};
}

// Rebuild the same policy state from durable memory after a Worker restart.
// Keeping this calculation in one place prevents the dashboard from falling
// back to WARMUP while the decision engine is already using mature samples.
export function outcomeLearningStatusV312(memory={},now=Date.now()){
  return learningProfile(cleanMemory(memory),now);
}
// HOLD-Messungen entstehen viel haeufiger als echte Kauf-/Verkaufsergebnisse.
// Sie duerfen die wenigen entscheidungsrelevanten Trades nicht mehr aus dem
// gemeinsamen Ringpuffer verdraengen.
function trimRecent20(rows){
  const all=arr(rows),decided=all.filter(x=>x&&x.action!=='HOLD'),counterfactual=all.filter(x=>x&&x.action==='HOLD'&&x.counterfactualEligible===true),holds=all.filter(x=>!x||(x.action==='HOLD'&&x.counterfactualEligible!==true));
  const keptDecided=decided.slice(-OUTCOME_LEARNING_V312.maxDecidedOutcomes);
  const counterBudget=Math.min(OUTCOME_LEARNING_V312.maxCounterfactualOutcomes,Math.max(0,OUTCOME_LEARNING_V312.maxRecentOutcomes-keptDecided.length)),keptCounter=counterfactual.slice(-counterBudget);
  const holdBudget=Math.max(0,OUTCOME_LEARNING_V312.maxRecentOutcomes-keptDecided.length-keptCounter.length);
  return [...keptDecided,...keptCounter,...holds.slice(-holdBudget)].sort((a,b)=>num(a?.ts)-num(b?.ts));
}
function groupUpdate(bucket,name,ret){if(!name)return;const r=bucket[name]&&typeof bucket[name]==='object'?bucket[name]:{n:0,sum:0,wins:0};r.n++;r.sum+=ret;if(ret>=OUTCOME_LEARNING_V312.minNetBuyWinPct)r.wins++;r.avg=+(r.sum/r.n).toFixed(4);r.hitRate=+(r.wins/r.n*100).toFixed(1);bucket[name]=r}
function learnWeights(m,sample,ret){const target=clamp(ret*6,-8,8),predicted=num(sample.forecast20mScore)-num(sample.score),error=clamp(target-predicted,-12,12),lr=.035;for(const [k,f] of Object.entries(sample.features||{})){if(!(k in DEFAULT_WEIGHTS))continue;const [lo,hi]=WEIGHT_LIMITS[k];m.weights[k]=clamp(num(m.weights[k],DEFAULT_WEIGHTS[k])+lr*error*num(f),lo,hi)}m.stats.weightUpdates++}
function evaluateSamples(m,observations,now){
  for(const [symbol,slot] of Object.entries(m.symbols)){
    const obs=observations.get(symbol);if(!obs||!(obs.price>0))continue;
    const samples=arr(slot?.samples);
    for(const sample of samples){if(!(num(sample.price)>0))continue;sample.evaluations=sample.evaluations&&typeof sample.evaluations==='object'?sample.evaluations:{};
      for(const h of OUTCOME_LEARNING_V312.horizonsMinutes){if(sample.evaluations[h])continue;const age=now-num(sample.ts),min=h*60000,max=(h+(h>=240?120:h>=60?45:20))*60000;if(age<min||age>max)continue;const ret=(obs.price/num(sample.price)-1)*100,action=String(sample.action||'HOLD').toUpperCase(),costPct=action==='BUY'?num(sample.estimatedRoundTripCostPct,OUTCOME_LEARNING_V312.defaultBuyRoundTripCostPct):0,netRet=action==='BUY'?ret-costPct:ret,counterCost=sample?.counterfactualEligible===true?num(sample?.counterfactualEstimatedCostPct,OUTCOME_LEARNING_V312.defaultBuyRoundTripCostPct):0,counterNet=sample?.counterfactualEligible===true?ret-counterCost:null;sample.evaluations[h]={ts:now,returnPct:+ret.toFixed(4),netReturnPct:+netRet.toFixed(4),estimatedRoundTripCostPct:+costPct.toFixed(4),counterfactualNetReturnPct:counterNet==null?null:+counterNet.toFixed(4)};
        if(h===20||h===60&&sample?.counterfactualEligible===true){const row={ts:now,sampleTs:num(sample.ts),symbol,action,returnPct:+ret.toFixed(4),netReturnPct:+netRet.toFixed(4),estimatedRoundTripCostPct:+costPct.toFixed(4),score:num(sample.score),forecast20mScore:num(sample.forecast20mScore),newsSignal:num(sample?.features?.news),sources:arr(sample.sources).slice(0,4),theme:sample.theme||'UNKNOWN',regime:sample.regime||'SIDEWAYS',counterfactualOnly:h===60,counterfactualEligible:sample?.counterfactualEligible===true,counterfactualSetupId:sample?.counterfactualSetupId||null,counterfactualReason:sample?.counterfactualReason||null,counterfactualHorizonMinutes:h,counterfactualEstimatedCostPct:counterCost,counterfactualNetReturnPct:counterNet==null?null:+counterNet.toFixed(4),counterfactualEntryScore:sample?.counterfactualEntryScore??null,counterfactualDataQuality:sample?.counterfactualDataQuality??null,counterfactualOrthogonalConfirmations:sample?.counterfactualOrthogonalConfirmations??null,counterfactualExpectedNetEdgePct:sample?.counterfactualExpectedNetEdgePct??null};m.recent20.push(row);m.recent20=trimRecent20(m.recent20);
          if(h===20){m.stats.evaluated20++;if(action==='HOLD'&&ret>=.5)m.stats.missedOpportunities++;if(action==='BUY'&&netRet<=0)m.stats.badBuys++;if(action==='SELL'&&ret>=.5)m.stats.earlySells++;if(action==='SELL'&&ret<=-.25)m.stats.correctSells++;const learnRet=sample?.counterfactualEligible===true?counterNet:action==='BUY'?netRet:ret;learnWeights(m,sample,learnRet);groupUpdate(m.groupStats.regime,sample.regime||'SIDEWAYS',learnRet);groupUpdate(m.groupStats.theme,sample.theme||'UNKNOWN',learnRet);for(const src of arr(sample.sources))groupUpdate(m.groupStats.source,src,learnRet)}
        }
      }
    }
  }
}
function candidateRows(state={}){const rows=arr(state?.candidates).filter(c=>key(c)&&priceOf(c)>0);rows.sort((a,b)=>(scoreOf(b)+Math.max(0,m5Of(b))*2)-(scoreOf(a)+Math.max(0,m5Of(a))*2));return rows.slice(0,32)}
function observationMap(state={}){const map=new Map();for(const c of [...candidateRows(state),...arr(state?.positions)]){const v=vector(c);if(v.symbol&&v.price>0){const old=map.get(v.symbol);if(!old||scoreOf(c)>=num(old.score))map.set(v.symbol,v)}}return map}
function forecastFor(v,previous,profile,weights,now){let velocity5=0,previousAgeMinutes=null;if(previous&&Number.isFinite(Number(previous.ts))){const mins=Math.max(.25,(now-num(previous.ts))/60000);previousAgeMinutes=mins;if(mins<=20)velocity5=(v.score-num(previous.score,v.score))/mins*5}const f=featureVector(v,velocity5);let learnedBonus=0;for(const k of Object.keys(DEFAULT_WEIGHTS))learnedBonus+=num(weights[k],DEFAULT_WEIGHTS[k])*num(f[k]);let chasePenalty=0;if(v.day>5)chasePenalty-=8;else if(v.day>3.5)chasePenalty-=4;if(v.rsi>=78)chasePenalty-=6;else if(v.rsi>=74)chasePenalty-=3;if(v.m5<0&&velocity5<=0)chasePenalty-=2.5;const regime=regimeOf(v),forecastScore=clamp(v.score+learnedBonus+chasePenalty,0,100);const agreement=[velocity5>=.6,v.m5>=.06,v.m20>=.04,v.accel>=.005,v.news>=.05,v.direction==='UP'].filter(Boolean).length,signalConfidence=clamp(v.confidence*.6+(agreement/6)*.28+(forecastScore-v.score>4?.08:0),.35,.95),currentFloor=OUTCOME_LEARNING_V312.minCurrentScore+profile.thresholdAdjustment,forecastFloor=OUTCOME_LEARNING_V312.minForecastScore+Math.max(-2,profile.thresholdAdjustment),leadingMove=(velocity5>=.6&&v.m5>=.05&&v.m20>=0)||(v.m5>=.08&&v.accel>=.005&&v.m20>=0)||(v.m5>=.14&&v.m20>=.06),safe=v.event!=='HIGH'&&v.sell!=='STRONG'&&v.news>-.4&&v.day>=-4&&v.day<=4&&v.rsi<76,earlySignal=profile.mode!=='DEFENSIVE'&&v.score>=currentFloor&&v.score<68&&forecastScore>=forecastFloor&&signalConfidence>=.56&&leadingMove&&safe&&v.price>0;return{...v,regime,features:f,velocity5:+velocity5.toFixed(3),previousAgeMinutes:previousAgeMinutes==null?null:+previousAgeMinutes.toFixed(2),forecast20mScore:+forecastScore.toFixed(2),signalConfidence:+signalConfidence.toFixed(3),currentFloor:+currentFloor.toFixed(2),forecastFloor:+forecastFloor.toFixed(2),agreement,earlySignal}}

export function updateOutcomeLearningMemoryV312(memory={},state={},now=Date.now()){
  const m=cleanMemory(memory),observations=observationMap(state);evaluateSamples(m,observations,now);const profile=learningProfile(m,now),predictions={};
  for(const c of candidateRows(state)){const v=vector(c),slot=m.symbols[v.symbol]&&typeof m.symbols[v.symbol]==='object'?m.symbols[v.symbol]:{samples:[]},previous=[...arr(slot.samples)].reverse().find(x=>now-num(x.ts)<=20*60000)||null;predictions[v.symbol]=forecastFor(v,previous,profile,m.weights,now)}
  m.updatedAt=new Date(now).toISOString();const top=Object.values(predictions).sort((a,b)=>b.forecast20mScore-a.forecast20mScore||b.velocity5-a.velocity5).slice(0,12).map(p=>({symbol:p.symbol,score:p.score,forecast20mScore:p.forecast20mScore,velocity5:p.velocity5,confidence:p.signalConfidence,earlySignal:p.earlySignal,regime:p.regime}));const recentMisses=counterfactualSetupOutcomes(arr(m.recent20).filter(x=>x?.counterfactualEligible===true)).filter(x=>num(x.counterfactualNetReturnPct)>=OUTCOME_LEARNING_V312.minNetBuyWinPct).slice(-8).reverse().map(x=>({symbol:x.symbol,setupId:x.counterfactualSetupId,netReturnPct:x.counterfactualNetReturnPct,net20mPct:x.counterfactualNet20mPct,net60mPct:x.counterfactualNet60mPct,estimatedCostPct:x.counterfactualEstimatedCostPct,ts:x.ts}));
  return{memory:m,predictions,status:{enabled:true,...OUTCOME_LEARNING_V312,...profile,trackedSymbols:Object.keys(m.symbols).length,currentCandidates:Object.keys(predictions).length,weights:{...m.weights},topForecasts:top,recentMissedOpportunities:recentMisses,rule:'V31.7.51 misst verpasste Chancen nur noch als eindeutige, damals frische und exakt bei Trade Republic handelbare Setups mit positiver kanonischer Netto-Kante. Doppelte Vier-Minuten-HOLDs werden nicht mehrfach gezaehlt; 20m und 60m werden nach Kosten kombiniert. Ab drei belastbaren Fehlpaessen darf ein streng begrenzter Recovery-BUY vorgeschlagen werden, alle Sicherheitsfilter bleiben bindend.'}};
}

function estimatedBuyRoundTripCostPct(state={},action={},symbol=''){
  const held=arr(state?.positions).find(p=>key(p)===key(symbol)),heldNotional=num(held?.invested,0),cash=Math.max(0,num(state?.config?.cash,0)),pct=clamp(num(action?.allocation_pct,0),0,100),planned=cash>0&&pct>0?cash*pct/100:0,notional=heldNotional>0?heldNotional:planned;
  if(!(notional>0))return OUTCOME_LEARNING_V312.defaultBuyRoundTripCostPct;
  const fixedFeesPct=2/notional*100,slippage=Math.max(0,num(state?.config?.slippage_percent,.1));
  return +clamp(fixedFeesPct+2*slippage,.2,5).toFixed(4);
}
export function recordOutcomeDecisionsV312(memory={},state={},plan={},predictions={},now=Date.now(),counterfactuals={}){
  const m=cleanMemory(memory),actionRows=new Map(arr(plan?.actions).map(a=>[key(a),a])),rows=new Map();for(const c of candidateRows(state))rows.set(key(c),c);for(const p of arr(state?.positions))if(key(p))rows.set(key(p),p);
  for(const [symbol,c] of rows){const v=vector(c);if(!(v.price>0))continue;const p=predictions[symbol]||forecastFor(v,null,learningProfile(m,now),m.weights,now),planAction=actionRows.get(symbol)||{},rawAction=String(planAction?.action||'HOLD').toUpperCase(),action=['BUY','SELL','HOLD'].includes(rawAction)?rawAction:'HOLD',slot=m.symbols[symbol]&&typeof m.symbols[symbol]==='object'?m.symbols[symbol]:{samples:[]};let samples=arr(slot.samples).filter(x=>x&&Number.isFinite(Number(x.ts))&&now-num(x.ts)<36*60*60*1000);const cf=counterfactuals?.[symbol]||{},reason=String(planAction?.reason||''),blocked=HARD.test(reason)||planAction?.shadowLearningV314===true||planAction?.newsCatalystBlockV31710===true||planAction?.newsCatalystChaseBlockV31710===true,cfEligible=action==='HOLD'&&cf?.eligible===true&&!blocked,activeSetup=[...samples].reverse().find(x=>x?.counterfactualEligible===true&&now-num(x.ts)<=OUTCOME_LEARNING_V312.missSetupCooldownMinutes*60000),newSetup=cfEligible&&!activeSetup,last=samples.at(-1),spacing=OUTCOME_LEARNING_V312.snapshotSpacingMinutes*60000;if(!last||now-num(last.ts)>=spacing||String(last.action)!==action||newSetup){samples.push({ts:now,price:v.price,score:v.score,action,forecast20mScore:p.forecast20mScore,signalConfidence:p.signalConfidence,features:{...(p.features||featureVector(v,0))},earlySignal:p.earlySignal===true,theme:v.theme,regime:p.regime||regimeOf(v),sources:v.sources,estimatedRoundTripCostPct:action==='BUY'?estimatedBuyRoundTripCostPct(state,planAction,symbol):0,counterfactualEligible:newSetup,counterfactualSetupId:newSetup?`${symbol}@${now}`:null,counterfactualReason:newSetup?cf.reason:null,counterfactualEstimatedCostPct:newSetup?num(cf.estimatedCostPct):0,counterfactualEntryScore:newSetup?cf.entryScore:null,counterfactualDataQuality:newSetup?cf.dataQuality:null,counterfactualOrthogonalConfirmations:newSetup?cf.orthogonalConfirmations:null,counterfactualExpectedNetEdgePct:newSetup?cf.expectedNetEdgePct:null,evaluations:{}})}samples=samples.slice(-OUTCOME_LEARNING_V312.maxSamplesPerSymbol);m.symbols[symbol]={samples,lastForecast:p.forecast20mScore,lastScore:v.score,lastAction:action,lastSeenAt:now,theme:v.theme}}
  const entries=Object.entries(m.symbols).sort((a,b)=>num(b[1]?.lastSeenAt)-num(a[1]?.lastSeenAt));for(const [symbol] of entries.slice(OUTCOME_LEARNING_V312.maxTrackedSymbols))delete m.symbols[symbol];m.updatedAt=new Date(now).toISOString();const profile=learningProfile(m,now);return{memory:m,status:{enabled:true,...OUTCOME_LEARNING_V312,...profile,trackedSymbols:Object.keys(m.symbols).length,currentCandidates:Object.keys(predictions).length,weights:{...m.weights},topForecasts:Object.values(predictions).sort((a,b)=>b.forecast20mScore-a.forecast20mScore).slice(0,12).map(p=>({symbol:p.symbol,score:p.score,forecast20mScore:p.forecast20mScore,velocity5:p.velocity5,confidence:p.signalConfidence,earlySignal:p.earlySignal,regime:p.regime}))}}
}

function candidateMap(state={},brokerRows=[]){const master=new Map(arr(brokerRows).map(r=>[key(r),r]).filter(([s])=>s)),out=new Map();for(const c of arr(state?.candidates)){const s=key(c);if(!s)continue;const r=master.get(s);out.set(s,r?{...r,...c,isin:r.isin||c?.isin,brokerVerified:r.brokerVerified===true,brokerMatchMode:r.brokerMatchMode||c?.brokerMatchMode,brokerVerificationSource:r.brokerVerificationSource||c?.brokerVerificationSource,assetClass:r.assetClass||c?.assetClass}:c)}return out}

function candidateFresh(c={},now=Date.now(),maxAgeMinutes=3){
  if(c?.stale===true||c?.quoteStale===true||c?.quote_stale===true||c?.fresh===false||Number(c?.fresh)===0)return false;
  const age=Number(c?.quoteAgeMinutes??c?.quote_age_minutes);if(Number.isFinite(age))return age>=0&&age<=maxAgeMinutes;
  const raw=Number(c?.marketTimestamp??c?.market_timestamp),marketMs=Number.isFinite(raw)&&raw>0?(raw>1e12?raw:raw*1000):NaN,textMs=Date.parse(String(c?.quoteUpdatedAt||c?.last_quote_at||c?.updated_at||c?.updatedAt||'')),ts=Number.isFinite(marketMs)?marketMs:textMs;
  if(Number.isFinite(ts))return now-ts>=0&&now-ts<=maxAgeMinutes*60000;
  return c?.fresh===true||Number(c?.fresh)===1;
}

export function counterfactualOpportunityMapV31751(state={},brokerRows=[],shadowMemory={},now=Date.now()){
  const out={},cmap=candidateMap(state,brokerRows),universe=[...cmap.values()],matured=arr(shadowMemory?.matured),cash=Math.max(0,num(state?.config?.cash,state?.cash)),positions=arr(state?.positions),minPct=cash>0?OUTCOME_LEARNING_V312.missRecoveryMinPositionEur/cash*100:Infinity,allocationPct=+clamp(Math.max(12,minPct),12,OUTCOME_LEARNING_V312.missRecoveryMaxAllocationPct).toFixed(1),market=String(state?.marketPhase||state?.market_phase||state?.config?.market_mode||state?.config?.marketPhase||'').toUpperCase();
  for(const [symbol,c] of cmap){
    const action={symbol,action:'BUY',allocation_pct:allocationPct},estimatedCost=estimatedActionRoundTripCostPctV317(state,action,c),entry=canonicalEntryAssessmentV316(c,universe,matured,estimatedCost),evidence=evidenceProfileV315(c,universe),edgeRows=entry.mature?num(entry.samples):num(entry.probationSamples),edge=entry.mature?entry.expectedNetEdgePct:entry.probationExpectedNetEdgePct,edgeChecked=entry.mature||edgeRows>=num(SHADOW_LEARNING_V314.probationMinNetEdgeSamples,3);let reason='ELIGIBLE';
    if(positions.length>=OUTCOME_LEARNING_V312.maxOpenPositions)reason='NO_FREE_SLOT';else if(positions.some(p=>key(p)===symbol))reason='ALREADY_HELD';else if(!brokerExact(c))reason='BROKER_NOT_EXACT';else if(/NEWS_ONLY|CLOSED|OFFLINE|HOLIDAY/.test(market))reason='MARKET_CLOSED';else if(!candidateFresh(c,now))reason='STALE_QUOTE';else if(cash<OUTCOME_LEARNING_V312.missRecoveryMinPositionEur||minPct>OUTCOME_LEARNING_V312.missRecoveryMaxAllocationPct)reason='SUB_ECONOMIC_CASH';else if(!Number.isFinite(estimatedCost))reason='ORDER_NOT_AFFORDABLE';else if(eventOf(c)==='HIGH'||sellOf(c)==='STRONG')reason='HARD_RISK';else if(evidence.negativeNewsConfirmed)reason='NEGATIVE_NEWS';else if(entry.dataQuality<OUTCOME_LEARNING_V312.missRecoveryMinDataQuality)reason='LOW_DATA_QUALITY';else if(entry.orthogonalConfirmations<OUTCOME_LEARNING_V312.missRecoveryMinOrthogonalConfirmations)reason='NO_ORTHOGONAL_CONFIRMATION';else if(entry.score<OUTCOME_LEARNING_V312.missRecoveryMinEntryScore)reason='ENTRY_SCORE';else if(entry.probationBlocked)reason='NEGATIVE_PROBATION';else if(!edgeChecked)reason='EDGE_NOT_MEASURED';else if(num(edge,-99)<OUTCOME_LEARNING_V312.missRecoveryMinExpectedNetEdgePct)reason='INSUFFICIENT_NET_EDGE';
    out[symbol]={eligible:reason==='ELIGIBLE',reason,allocationPct,estimatedCostPct:Number.isFinite(estimatedCost)?+estimatedCost.toFixed(3):null,entryScore:entry.score,dataQuality:entry.dataQuality,orthogonalConfirmations:entry.orthogonalConfirmations,expectedNetEdgePct:edge==null?null:+num(edge).toFixed(3),edgeSamples:edgeRows,edgeMature:entry.mature,entryBucket:entry.bucket};
  }
  return out;
}

export function enforceOutcomeMissRecoveryV31751(plan,state={},learning={},brokerRows=[],shadowMemory={},now=Date.now()){
  const counterfactuals=counterfactualOpportunityMapV31751(state,brokerRows,shadowMemory,now),profile=learning?.status||learningProfile(cleanMemory(learning?.memory||{}),now),counters={active:profile?.missRecoveryActive===true,eligible:0,injected:0,reason:null,chosen:null};
  if(!plan||!Array.isArray(plan.actions))return{plan,counterfactuals,counters:{...counters,reason:'INVALID_PLAN'}};
  if(profile?.missRecoveryActive!==true)return{plan,counterfactuals,counters:{...counters,reason:'LEARNING_TRIGGER_NOT_MET'}};
  if(arr(plan.actions).some(a=>String(a?.action||'').toUpperCase()==='BUY'))return{plan,counterfactuals,counters:{...counters,reason:'BUY_ALREADY_EXISTS'}};
  const cmap=candidateMap(state,brokerRows),predictions=learning?.predictions||{},actions=plan.actions.map(a=>({...a})),index=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!index.has(s))index.set(s,i)});const rows=[];
  for(const [symbol,cf] of Object.entries(counterfactuals)){const c=cmap.get(symbol),p=predictions[symbol],i=index.get(symbol),a=i===undefined?{}:actions[i],forecast=num(p?.forecast20mScore),confidence=clamp(num(p?.signalConfidence),0,1),m5=num(p?.m5,c?.momentum5Pct??c?.momentum5),m20=num(p?.m20,c?.momentum20Pct??c?.momentum20),accel=num(p?.accel,c?.acceleration5Pct??c?.momentumAcceleration5);if(!cf.eligible||!p||a?.shadowLearningV314===true||HARD.test(String(a?.reason||'')))continue;if(forecast<OUTCOME_LEARNING_V312.missRecoveryMinForecastScore||confidence<.58||m5<.05||m20<.04||accel<0)continue;rows.push({symbol,c,p,cf,i,a,rank:forecast+confidence*5+m5*2+m20+num(cf.expectedNetEdgePct)*2})}
  rows.sort((a,b)=>b.rank-a.rank);counters.eligible=rows.length;const chosen=rows[0];if(!chosen)return{plan,counterfactuals,counters:{...counters,reason:'NO_CURRENT_CONFIRMED_SETUP'}};
  const cash=Math.max(0,num(state?.config?.cash,state?.cash)),minPct=OUTCOME_LEARNING_V312.missRecoveryMinPositionEur/cash*100,pct=+clamp(Math.max(minPct,20+num(profile?.allocationAdjustment)+(chosen.p.forecast20mScore-OUTCOME_LEARNING_V312.missRecoveryMinForecastScore)*.8),12,OUTCOME_LEARNING_V312.missRecoveryMaxAllocationPct).toFixed(1),buy={...chosen.a,symbol:chosen.symbol,name:chosen.c?.name||chosen.symbol,action:'BUY',allocation_pct:pct,confidence:clamp(chosen.p.signalConfidence,.62,.92),missRecoveryV31751:true,outcomeEntryV312:true,forecast20mScore:chosen.p.forecast20mScore,scoreVelocity5m:chosen.p.velocity5,entryDecisionScore:chosen.cf.entryScore,reason:`V31.7.51 MISS-RECOVERY: ${profile.missedOpportunities} eindeutige handelbare Fehlpaesse, Trefferquote ${num(profile.actionableMissRate).toFixed(0)}%, durchschnittlich ${num(profile.avgMissedNetReturnPct).toFixed(2)}% nach Kosten. ${chosen.symbol}: kanonischer Score ${chosen.cf.entryScore.toFixed(1)}, Daten ${chosen.cf.dataQuality.toFixed(0)}/100, Netto-Edge ${num(chosen.cf.expectedNetEdgePct).toFixed(2)}%, 20m-Prognose ${chosen.p.forecast20mScore.toFixed(1)}. Wirtschaftliche ${pct.toFixed(1)}%-Position; frische Quote, exakte Trade-Republic-Zuordnung, News-, Edge-, Klumpen-, Abstands- und Risikofilter bleiben bindend.`};
  if(chosen.i===undefined)actions.push(buy);else actions[chosen.i]=buy;plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,106)} · V31.7.51 Miss-Recovery BUY ${chosen.symbol} ${pct.toFixed(1)}%.`;counters.injected=1;counters.reason='COUNTERFACTUAL_MISS_RECOVERY';counters.chosen={symbol:chosen.symbol,allocationPct:pct,forecast20mScore:chosen.p.forecast20mScore,entryScore:chosen.cf.entryScore,dataQuality:chosen.cf.dataQuality,expectedNetEdgePct:chosen.cf.expectedNetEdgePct};return{plan,counterfactuals,counters};
}
export function enforceOutcomeEarlyEntryV312(plan,state={},learning={},brokerRows=[]){if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};const positions=arr(state?.positions),held=new Set(positions.map(key));if(positions.length>=OUTCOME_LEARNING_V312.maxOpenPositions)return{plan,counters:{eligible:0,injected:0,reason:'NO_FREE_SLOT'}};const cmap=candidateMap(state,brokerRows),predictions=learning?.predictions||{},profile=learning?.status||learningProfile(cleanMemory(learning?.memory||{}),Date.now());if(profile?.mode==='DEFENSIVE')return{plan,counters:{eligible:0,injected:0,reason:'NET_BUY_LEARNING_DEFENSIVE',learningMode:'DEFENSIVE'}};const actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});const rows=[];for(const p of Object.values(predictions)){const s=p?.symbol,c=cmap.get(s);if(!s||!c||held.has(s)||p?.earlySignal!==true||!brokerExact(c))continue;const i=idx.get(s),a=i===undefined?{}:actions[i],reason=String(a?.reason||'');if(HARD.test(reason)||eventOf(c)==='HIGH'||sellOf(c)==='STRONG')continue;rows.push({p,c,s,i,a,rank:p.forecast20mScore+clamp(p.velocity5,-6,6)*1.5+p.signalConfidence*4})}rows.sort((a,b)=>b.rank-a.rank);const chosen=rows[0]||null;if(!chosen)return{plan,counters:{eligible:0,injected:0,learningMode:profile?.mode||'WARMUP'}};const p=chosen.p,adj=num(profile?.allocationAdjustment),pct=+clamp(20+(p.forecast20mScore-70)*1.4+(p.score-58)*.6+(p.signalConfidence-.56)*24+adj,12,OUTCOME_LEARNING_V312.maxPredictiveAllocationPct).toFixed(1),buy={...chosen.a,symbol:chosen.s,name:chosen.c?.name||chosen.s,action:'BUY',allocation_pct:pct,confidence:clamp(p.signalConfidence,.62,.92),predictiveEntryV311:true,outcomeEntryV312:true,forecast20mScore:p.forecast20mScore,scoreVelocity5m:p.velocity5,reason:`V31.2.1 NET-OUTCOME-EARLY-ENTRY: Score ${p.score.toFixed(1)}/100, 20m-Prognose ${p.forecast20mScore.toFixed(1)}/100, Score-Geschwindigkeit ${p.velocity5>=0?'+':''}${p.velocity5.toFixed(2)}/5m, Konfidenz ${(p.signalConfidence*100).toFixed(0)}%, Lernmodus ${profile?.mode||'WARMUP'}. ${pct.toFixed(1)}% Starter. BUY-Lernen bewertet nach geschätzten Roundtrip-Kosten; reine Velocity ohne positives 5m/20m-Tape reicht nicht mehr. Harte News-, Quote-, FX-, Markt- und Re-Entry-Sperren bleiben bindend.`};if(chosen.i===undefined)actions.push(buy);else actions[chosen.i]=buy;plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,120)} · V31.2.1 Net-Outcome: früher BUY ${chosen.s} ${p.score.toFixed(1)}→${p.forecast20mScore.toFixed(1)} (${pct.toFixed(1)}%).`;return{plan,counters:{eligible:rows.length,injected:1,learningMode:profile?.mode||'WARMUP',chosen:{symbol:chosen.s,score:+p.score.toFixed(1),forecast20mScore:+p.forecast20mScore.toFixed(1),velocity5:+p.velocity5.toFixed(2),confidence:+p.signalConfidence.toFixed(3),allocationPct:pct}}}}
