import {daytradeLiveScoresV302} from './daytrade-live-feedback-v302.js';

// V31.4: Kandidaten als Shadow-Samples messen, ohne eine zweite
// Entscheidungsautoritaet einzufuehren. Nur neue BUYs werden gefiltert.
const KEY='shadow-learning-v314';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const canonicalScore=v=>{let x=num(v);if(x>0&&x<=10)x*=10;return clamp(x,0,100)};
const priceOf=v=>num(v?.price,v?.last_price);
const fxOf=v=>num(v?.fx_rate??v?.fxRate??v?.last_fx,1)||1;
const read=async(storage,d)=>{try{
  if(storage?.get)return(await storage.get(KEY))||d;
  if(storage?.kv?.get)return(await storage.kv.get(KEY))||d;
  return d;
}catch{return d}};
const write=async(storage,v)=>{try{
  if(storage?.put){await storage.put(KEY,v);return true}
  if(storage?.kv?.put){await storage.kv.put(KEY,v);return true}
  return false;
}catch{return false}};

export const SHADOW_LEARNING_V314={
  version:31.5,storageKey:KEY,horizonMinutes:60,snapshotSpacingMinutes:5,
  maxOpenSnapshots:600,maxMaturedSamples:1500,buckets:[50,55,60,65,70,75,80],
  minBucketSamples:25,minEdgeCostMultiple:3,defaultBuyThreshold:56,
  maxBuyThreshold:78,maxPerTheme:2,maxPerCurrency:3,minEntrySpacingMinutes:20,
  evidenceMinSamples:25,negativeNewsBlock:-.35,negativeNewsMinConfidence:.6,negativeNewsMinSources:2
};

function defaults(){return{version:31.5,open:{},matured:[],lastEntryAt:0,
  stats:{snapshots:0,matured:0,expired:0,themeBlocks:0,currencyBlocks:0,spacingBlocks:0,thresholdBlocks:0},
  threshold:null,updatedAt:null}}
const bucketOf=(score,cfg)=>{let out=null;for(const x of cfg.buckets)if(score>=x)out=x;return out};
const themeOf=c=>String(c?.theme||c?.sector||c?.industry||'UNKNOWN').toUpperCase();
const currencyOf=c=>String(c?.currency||c?.quote_currency||'EUR').toUpperCase();
const median=values=>{const xs=values.filter(finite).map(Number).sort((a,b)=>a-b);if(!xs.length)return 0;const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2};
export function evidenceProfileV315(candidate={},universe=[]){
  const m5=num(candidate?.momentum5Pct,candidate?.momentum5??candidate?.intraday5m),m20=num(candidate?.momentum20Pct,candidate?.momentum20??candidate?.intraday20m);
  const peers=arr(universe).map(c=>num(c?.momentum20Pct,c?.momentum20??c?.intraday20m)).filter(finite),peerMedian=median(peers);
  const volume=num(candidate?.volumeRatio??candidate?.volume_ratio,1),news=clamp(candidate?.newsScore??candidate?.news_score??candidate?.news,-1,1);
  const newsConfidence=clamp(candidate?.newsConfidence??candidate?.news_confidence,0,1),sources=arr(candidate?.newsSources??candidate?.news_sources).length;
  const rsi=num(candidate?.rsi??candidate?.intradayRsi,50),day=num(candidate?.day_change??candidate?.dayChange??candidate?.day),acc=num(candidate?.momentumAcceleration5??candidate?.momentum_acceleration5);
  const pillars={trend:m5>0&&m20>0,relativeStrength:m20>peerMedian+.05,volume:volume>1.15,catalyst:news>=.08&&newsConfidence>=.4};
  let quality=(pillars.trend?30:0)+(pillars.relativeStrength?25:0)+(pillars.volume?20:0)+(pillars.catalyst?25:0);
  if(m5<0&&m20>0)quality-=15;if(rsi>=74||day>=4)quality-=15;if(acc<-.2)quality-=10;if(news<=-.15)quality-=20;
  quality=clamp(quality,0,100);
  return{quality:+quality.toFixed(1),pillarCount:Object.values(pillars).filter(Boolean).length,pillars,peerMedian20:+peerMedian.toFixed(3),
    m5,m20,volume,news,newsConfidence,newsSources:sources,negativeNewsConfirmed:news<=SHADOW_LEARNING_V314.negativeNewsBlock&&newsConfidence>=SHADOW_LEARNING_V314.negativeNewsMinConfidence&&sources>=SHADOW_LEARNING_V314.negativeNewsMinSources};
}
function latestActualEntryAt(state={}){
  let latest=0;
  for(const p of arr(state?.positions)){const at=Date.parse(String(p?.opened_at??p?.openedAt??''));if(Number.isFinite(at))latest=Math.max(latest,at)}
  for(const row of arr(state?.history)){if(!['KAUF','BUY'].includes(String(row?.action||'').toUpperCase()))continue;const at=Date.parse(String(row?.ts||''));if(Number.isFinite(at))latest=Math.max(latest,at)}
  return latest;
}
function finalScoredCandidates(state,storage,now){
  try{
    const ranked=arr(daytradeLiveScoresV302(state,storage,now)?.ranking);
    if(ranked.length){const raw=new Map(arr(state?.candidates).map(c=>[key(c),c]));return ranked.map(r=>{const c=raw.get(key(r))||{};return{...c,...r,
      newsScore:r?.newsScore??r?.news_score??c?.newsScore??c?.news_score,newsConfidence:r?.newsConfidence??r?.news_confidence??c?.newsConfidence??c?.news_confidence,
      newsSources:r?.newsSources??r?.news_sources??c?.newsSources??c?.news_sources,headlines:r?.headlines??c?.headlines,
      volumeRatio:r?.volumeRatio??r?.volume_ratio??c?.volumeRatio??c?.volume_ratio};})}
  }catch{}
  return arr(state?.candidates);
}

export function recordShadowSnapshots(mem,candidates,now,cfg=SHADOW_LEARNING_V314){
  const spacing=cfg.snapshotSpacingMinutes*60000;
  for(const c of arr(candidates)){
    const symbol=key(c),price=priceOf(c),score=canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score);
    if(!symbol||!(price>0)||bucketOf(score,cfg)===null)continue;
    const id=`${symbol}@${Math.floor(now/spacing)}`;
    if(mem.open[id])continue;
    const evidence=evidenceProfileV315(c,candidates);
    mem.open[id]={symbol,at:now,price,fx:fxOf(c),score:+score.toFixed(1),evidenceVersion:31.5,evidenceQuality:evidence.quality,evidencePillars:evidence.pillarCount,
      theme:themeOf(c),currency:currencyOf(c),m5:num(c?.momentum5),m20:num(c?.momentum20),
      rsi:num(c?.rsi,50),day:num(c?.day_change??c?.dayChange)};
    mem.stats.snapshots++;
  }
  const ids=Object.keys(mem.open).sort((a,b)=>num(mem.open[a]?.at)-num(mem.open[b]?.at));
  for(const id of ids.slice(0,Math.max(0,ids.length-cfg.maxOpenSnapshots))){delete mem.open[id];mem.stats.expired++}
  return mem;
}

export function matureShadowSnapshots(mem,candidates,now,cfg=SHADOW_LEARNING_V314){
  const prices=new Map(arr(candidates).map(c=>[key(c),{price:priceOf(c),fx:fxOf(c)}]));
  const horizon=cfg.horizonMinutes*60000;
  for(const [id,snap] of Object.entries(mem.open)){
    const age=now-num(snap?.at,now);if(age<horizon)continue;
    const current=prices.get(snap.symbol);
    if(!current||!(current.price>0)){if(age>horizon*3){delete mem.open[id];mem.stats.expired++}continue}
    const from=snap.price*num(snap.fx,1),to=current.price*current.fx;
    if(from>0)mem.matured.push({symbol:snap.symbol,score:snap.score,theme:snap.theme,evidenceVersion:snap.evidenceVersion||null,evidenceQuality:num(snap.evidenceQuality),evidencePillars:num(snap.evidencePillars),
      ret:+(((to/from)-1)*100).toFixed(4),at:now});
    mem.stats.matured++;delete mem.open[id];
  }
  if(mem.matured.length>cfg.maxMaturedSamples)mem.matured=mem.matured.slice(-cfg.maxMaturedSamples);
  return mem;
}

export function evidenceCalibrationV315(matured=[]){
  const eligible=arr(matured).filter(x=>num(x.evidenceVersion)===31.5);
  return [
    {label:'LOW',rows:eligible.filter(x=>num(x.evidenceQuality)<50)},
    {label:'CONFIRMED',rows:eligible.filter(x=>num(x.evidenceQuality)>=50)}
  ].map(group=>({label:group.label,samples:group.rows.length,avgReturnPct:group.rows.length?+(group.rows.reduce((s,x)=>s+num(x.ret),0)/group.rows.length).toFixed(3):null,hitRate:group.rows.length?+(group.rows.filter(x=>num(x.ret)>0).length/group.rows.length).toFixed(3):null}));
}

export function scoreCalibrationV314(matured,cfg=SHADOW_LEARNING_V314){
  return cfg.buckets.map((bucket,index)=>{
    const hi=cfg.buckets[index+1]??Infinity,rows=arr(matured).filter(r=>num(r.score,-1)>=bucket&&num(r.score,-1)<hi);
    if(!rows.length)return{bucket,samples:0,avgReturnPct:null,hitRate:null};
    const avg=rows.reduce((sum,row)=>sum+num(row.ret),0)/rows.length;
    return{bucket,samples:rows.length,avgReturnPct:+avg.toFixed(3),
      hitRate:+(rows.filter(row=>num(row.ret)>0).length/rows.length).toFixed(3)};
  });
}

export function calibratedBuyThresholdV314(matured,roundTripCostPct=.29,cfg=SHADOW_LEARNING_V314){
  const calibration=scoreCalibrationV314(matured,cfg),need=roundTripCostPct,highConvictionNeed=roundTripCostPct*cfg.minEdgeCostMultiple;
  for(const row of calibration)if(row.samples>=cfg.minBucketSamples&&num(row.avgReturnPct,-99)>=need)
    return{threshold:row.bucket,calibrated:true,need:+need.toFixed(3),highConvictionNeed:+highConvictionNeed.toFixed(3),row,calibration};
  const best=calibration.filter(row=>row.samples>=cfg.minBucketSamples)
    .sort((a,b)=>num(b.avgReturnPct,-99)-num(a.avgReturnPct,-99))[0]||null;
  return{threshold:best?best.bucket:cfg.defaultBuyThreshold,
    calibrated:Boolean(best),need:+need.toFixed(3),highConvictionNeed:+highConvictionNeed.toFixed(3),row:best,calibration};
}

export function calibratedScoreBucketGateV315(score,calibrated,cost,cfg=SHADOW_LEARNING_V314){
  const bucket=bucketOf(score,cfg),row=arr(calibrated?.calibration).find(x=>x.bucket===bucket);
  if(!row||row.samples<cfg.minBucketSamples)return{ok:true,bucket,row,mature:false};
  return{ok:num(row.avgReturnPct,-99)>=cost,bucket,row,mature:true};
}

export function correlationGateV314(symbol,candidate,positions,mem,now,cfg=SHADOW_LEARNING_V314){
  const theme=themeOf(candidate),currency=currencyOf(candidate),held=arr(positions).filter(p=>key(p)!==key(symbol));
  if(theme!=='UNKNOWN'&&held.filter(p=>themeOf(p)===theme).length>=cfg.maxPerTheme)
    return{ok:false,kind:'THEME_CLUSTER',theme};
  if(held.filter(p=>currencyOf(p)===currency).length>=cfg.maxPerCurrency)
    return{ok:false,kind:'CURRENCY_CLUSTER',currency};
  const since=(now-num(mem?.lastEntryAt,0))/60000;
  if(num(mem?.lastEntryAt)>0&&since<cfg.minEntrySpacingMinutes)
    return{ok:false,kind:'ENTRY_SPACING',minutesSinceLastEntry:+since.toFixed(1)};
  return{ok:true,kind:'OK'};
}

export function estimatedRoundTripCostPctV314(state={}){
  const c=state?.config||{},notional=Math.max(1,num(state?.expectancyMinPositionEur,2200));
  const brokerFee=Math.max(1,num(c?.fee_fixed,0)),percent=Math.max(0,num(c?.fee_percent,0));
  return +(2*Math.max(0,num(c?.slippage_percent,.1))+2*percent+2*brokerFee/notional*100).toFixed(3);
}

export async function enforceShadowLearningV314(plan,state={},storage=null,now=Date.now(),roundTripCostPct=null,cfg=SHADOW_LEARNING_V314){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  let mem={...defaults(),...(await read(storage,defaults())||{})};
  mem.open={...(mem.open||{})};mem.matured=arr(mem.matured).slice();mem.stats={...defaults().stats,...(mem.stats||{})};
  const candidates=finalScoredCandidates(state,storage,now),cost=roundTripCostPct!=null&&finite(roundTripCostPct)?Number(roundTripCostPct):estimatedRoundTripCostPctV314(state);
  matureShadowSnapshots(mem,candidates,now,cfg);recordShadowSnapshots(mem,candidates,now,cfg);
  const calibrated=calibratedBuyThresholdV314(mem.matured,cost,cfg);
  const evidenceCalibration=evidenceCalibrationV315(mem.matured),lowEvidence=evidenceCalibration.find(x=>x.label==='LOW');mem.threshold={...calibrated,evidenceCalibration};
  const bySymbol=new Map(candidates.map(c=>[key(c),c])),positions=arr(state?.positions);
  const actions=plan.actions.map(a=>({...a})),counters={themeBlocks:0,currencyBlocks:0,spacingBlocks:0,
    belowCalibratedThreshold:0,openSnapshots:Object.keys(mem.open).length,maturedSamples:mem.matured.length,
    buyThreshold:calibrated.threshold,calibrated:calibrated.calibrated,roundTripCostPct:cost,evidenceCalibration,negativeNewsBlocks:0,evidenceBlocks:0,unprofitableBucketBlocks:0};
  const actualEntryAt=latestActualEntryAt(state);let gateEntryAt=actualEntryAt;
  for(let i=0;i<actions.length;i++){
    const action=actions[i],symbol=key(action);
    if(!symbol||String(action?.action||'').toUpperCase()!=='BUY'||positions.some(p=>key(p)===symbol))continue;
    const candidate=bySymbol.get(symbol)||{},score=canonicalScore(candidate?.daytradeLiveScore??candidate?.decisionScore??candidate?.score??action?.entryDecisionScore);
    const evidence=evidenceProfileV315(candidate,candidates);
    if(evidence.negativeNewsConfirmed){
      actions[i]={...action,action:'HOLD',allocation_pct:0,shadowLearningV314:true,shadowBlockKind:'CONFIRMED_NEGATIVE_NEWS',evidenceQualityV315:evidence.quality,
        reason:`V31.5 NEWS-FILTER: ${symbol} hat bestätigte negative Firmennachrichten (${evidence.news.toFixed(2)}, ${evidence.newsSources} Quellen). Kein neuer Kauf gegen den Katalysator.`};
      counters.negativeNewsBlocks++;continue;
    }
    const bucketGate=calibratedScoreBucketGateV315(score,calibrated,cost,cfg);
    if(!bucketGate.ok){
      actions[i]={...action,action:'HOLD',allocation_pct:0,shadowLearningV314:true,shadowBlockKind:'UNPROFITABLE_SCORE_BUCKET',evidenceQualityV315:evidence.quality,
        reason:`V31.5 FLEX-BUCKET: Scorebereich ${bucketGate.bucket}–${bucketGate.bucket+4} erzielte mit ${bucketGate.row.samples} Samples Ø ${bucketGate.row.avgReturnPct.toFixed(2)}% und deckt ${cost.toFixed(2)}% Roundtrip-Kosten nicht.`};
      counters.unprofitableBucketBlocks++;continue;
    }
    if(lowEvidence?.samples>=cfg.evidenceMinSamples&&num(lowEvidence.avgReturnPct,99)<cost&&evidence.quality<50){
      actions[i]={...action,action:'HOLD',allocation_pct:0,shadowLearningV314:true,shadowBlockKind:'LOW_EVIDENCE_EXPECTANCY',evidenceQualityV315:evidence.quality,
        reason:`V31.5 EVIDENZ-FILTER: ${symbol} nur ${evidence.pillarCount}/4 unabhängige Bestätigungen; ${lowEvidence.samples} vergleichbare Shadow-Samples lagen nach Kosten nicht tragfähig.`};
      counters.evidenceBlocks++;continue;
    }
    if(calibrated.calibrated&&score<calibrated.threshold){
      actions[i]={...action,action:'HOLD',allocation_pct:0,shadowLearningV314:true,shadowBlockKind:'CALIBRATED_THRESHOLD',
        reason:`V31.4 KALIBRIERUNG: ${symbol} Score ${score.toFixed(1)} liegt unter der gelernten Schwelle ${calibrated.threshold}. ${mem.matured.length} reife 60-Minuten-Samples, Roundtrip ${cost.toFixed(2)}%.`};
      counters.belowCalibratedThreshold++;continue;
    }
    const gate=correlationGateV314(symbol,candidate,positions,{lastEntryAt:gateEntryAt},now,cfg);
    if(gate.ok){gateEntryAt=now;continue}
    actions[i]={...action,action:'HOLD',allocation_pct:0,shadowLearningV314:true,shadowBlockKind:gate.kind,
      reason:`V31.4 KLUMPENFILTER: ${symbol} · ${gate.kind==='THEME_CLUSTER'?`bereits ${cfg.maxPerTheme} Positionen im Thema ${gate.theme}`:gate.kind==='CURRENCY_CLUSTER'?`bereits ${cfg.maxPerCurrency} Positionen in ${gate.currency}`:`letzter Einstieg vor ${gate.minutesSinceLastEntry} Min.; Mindestabstand ${cfg.minEntrySpacingMinutes} Min.`}`};
    if(gate.kind==='THEME_CLUSTER')counters.themeBlocks++;else if(gate.kind==='CURRENCY_CLUSTER')counters.currencyBlocks++;else counters.spacingBlocks++;
  }
  mem.lastEntryAt=actualEntryAt;mem.stats.themeBlocks+=counters.themeBlocks;mem.stats.currencyBlocks+=counters.currencyBlocks;
  mem.stats.spacingBlocks+=counters.spacingBlocks;mem.stats.thresholdBlocks+=counters.belowCalibratedThreshold;
  mem.updatedAt=new Date(now).toISOString();const persisted=await write(storage,mem);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,112)} · V31.5 Flex: ${counters.maturedSamples} reif, bevorzugt ab ${calibrated.threshold}${calibrated.calibrated?'':' Warmup'}, ${counters.themeBlocks+counters.currencyBlocks+counters.spacingBlocks+counters.belowCalibratedThreshold+counters.negativeNewsBlocks+counters.evidenceBlocks+counters.unprofitableBucketBlocks} BUY-Filter.`;
  return{plan,counters,calibration:{...calibrated,evidenceCalibration},mem,persisted};
}
