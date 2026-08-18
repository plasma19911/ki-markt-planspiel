const KEY='state/zero-live-signal-learning-v1';
const HORIZONS=[15,30,60];
const CHECKPOINT_GRACE_MIN=8;
const MIN_TIMING_SAMPLES=6;
const HARD_TIMING_SAMPLES=12;
const REBOUND_HARD_SAMPLES=18;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase();

function heldFromPrompt(prompt){const marker=' Gehalten=',i=prompt.indexOf(marker);if(i<0)return[];try{const x=JSON.parse(prompt.slice(i+marker.length).trim());return Array.isArray(x)?x:[]}catch{return[]}}
function candidatesFromPrompt(prompt){const a=prompt.indexOf('Kandidaten='),b=a>=0?prompt.indexOf(' Gehalten=',a):-1;if(a<0||b<0)return[];try{const x=JSON.parse(prompt.slice(a+'Kandidaten='.length,b).trim());return Array.isArray(x)?x:[]}catch{return[]}}

export function classifyEntryTiming(c={},fastCtx=null){
  const state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase();
  const draw=num(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,-99),day=num(c?.day??c?.day_change),m5=num(c?.intraday5m??c?.momentum5),m20=num(c?.intraday20m??c?.momentum20),rsi=num(c?.intradayRsi??c?.rsi,50),breakout=num(c?.momentumBreakoutScore??c?.momentum_breakout_score),vol=num(c?.volumeRatio??c?.volume_ratio,1);
  const t=fastCtx?.technical||{},mtf=fastCtx?.multiTimeframe||{},reason=String(fastCtx?.reason||'');
  const near20High=draw>-0.20,nearResistance=Number.isFinite(Number(t?.priceVsResistancePct))?num(t.priceVsResistancePct)>-0.28:near20High;
  const volumeConfirmed=vol>=1.25||/Volumen x/i.test(reason),trendConfirmed=num(mtf?.longVotes)>=3||(m5>0.05&&m20>0.15);
  const breakoutConfirmed=(state==='BREAKOUT'||breakout>=2||/Breakout|Widerstand gebrochen/i.test(reason))&&trendConfirmed&&volumeConfirmed&&rsi<79;
  const extended=day>3.5||m20>1.25||rsi>74||num(t?.vwapDistancePct)>1.15;
  const pullbackRetest=draw<=-0.22&&draw>=-1.35&&m20>0&&m5>=-0.20&&rsi<72&&num(mtf?.shortVotes)<2;
  const reboundObserved=Boolean(c?.reboundWatch)||day<=-1.2;
  const reboundConfirmed=reboundObserved&&day>=-12&&day<=-1.2&&m5>0.08&&m20>-0.35&&state!=='REVERSAL'&&rsi>=24&&rsi<74&&num(mtf?.shortVotes)<3;
  if(reboundConfirmed)return'REBOUND_REVERSAL';
  if((near20High||nearResistance)&&!breakoutConfirmed)return'CHASE_NEAR_HIGH';
  if(breakoutConfirmed&&(near20High||nearResistance))return'CONFIRMED_BREAKOUT';
  if(pullbackRetest)return'PULLBACK_RETEST';
  if(extended)return'EXTENDED_MOMENTUM';
  return'NORMAL_ENTRY';
}

function contextMap(fast,prompt){
  const gaps=new Map(arr(fast?.gapContext).map(x=>[key(x.symbol),x])),cands=new Map(candidatesFromPrompt(prompt).map(x=>[key(x.symbol),x])),out=new Map();
  for(const c of arr(fast?.context)){
    const k=key(c.symbol),g=gaps.get(k),a=num(c?.multiTimeframe?.alignment),bucket=a>=3?'MTF_UP':a<=-3?'MTF_DOWN':'MTF_MIXED',gap=String(g?.state||'NO_GAP'),candidate=cands.get(k)||{};
    out.set(k,{signature:`${c.regime||'UNKNOWN'}|${bucket}|${gap}`,regime:c.regime||'UNKNOWN',mtf:a,gap,timingBucket:classifyEntryTiming(candidate,c),timingSnapshot:{day:num(candidate?.day),m5:num(candidate?.intraday5m),m20:num(candidate?.intraday20m),rsi:num(candidate?.intradayRsi,50),drawdown20m:num(candidate?.drawdownFrom20mHighPct),breakoutScore:num(candidate?.momentumBreakoutScore),volumeRatio:num(candidate?.volumeRatio,1),reboundWatch:Boolean(candidate?.reboundWatch),vwapDistancePct:num(c?.technical?.vwapDistancePct),priceVsResistancePct:num(c?.technical?.priceVsResistancePct)}})
  }
  return out;
}
function defaults(){return{version:3,open:{},pending:{},stats:{},completed:0,timingStats:{},timedCompleted:0,recentTiming:[]}}
function read(storage){try{return{...defaults(),...(storage?.kv?.get(KEY)||{})}}catch{return defaults()}}
function write(storage,state){try{storage?.kv?.put(KEY,state)}catch{}}
function addOutcome(state,signature,pnl){const s=state.stats[signature]||{count:0,wins:0,sumPnl:0,sumAbsPnl:0};s.count++;if(pnl>0)s.wins++;s.sumPnl+=pnl;s.sumAbsPnl+=Math.abs(pnl);state.stats[signature]=s;state.completed=num(state.completed)+1}
function addTimedOutcome(state,bucket,horizon,pnl,mae,mfe,symbol){
  state.timingStats=state.timingStats||{};const byBucket=state.timingStats[bucket]||(state.timingStats[bucket]={}),s=byBucket[horizon]||{count:0,wins:0,sumPnl:0,sumAbsPnl:0,sumMae:0,sumMfe:0};
  s.count++;if(pnl>0)s.wins++;s.sumPnl+=pnl;s.sumAbsPnl+=Math.abs(pnl);s.sumMae+=mae;s.sumMfe+=mfe;byBucket[horizon]=s;state.timedCompleted=num(state.timedCompleted)+1;
  state.recentTiming=arr(state.recentTiming);state.recentTiming.push({at:Date.now(),symbol,bucket,horizonMin:horizon,pnlPct:+pnl.toFixed(3),maePct:+mae.toFixed(3),mfePct:+mfe.toFixed(3)});if(state.recentTiming.length>60)state.recentTiming=state.recentTiming.slice(-60)
}
function timingAggregate(state,bucket){
  const rows=state?.timingStats?.[bucket]||{},weights={15:.50,30:.30,60:.20};let den=0,quality=0,win=0,samples15=0,total=0;
  for(const h of HORIZONS){const s=rows[h],count=num(s?.count);if(!count)continue;const w=weights[h],avg=num(s.sumPnl)/count,wr=num(s.wins)/count;quality+=avg*w;win+=wr*w;den+=w;total+=count;if(h===15)samples15=count}
  return{samples15,totalCheckpoints:total,quality:den?quality/den:0,winRate:den?win/den:null}
}
function adjustmentFromState(state,bucket){
  const a=timingAggregate(state,bucket),out={bucket,samples:a.samples15,totalCheckpoints:a.totalCheckpoints,quality:+a.quality.toFixed(3),winRate:a.winRate==null?null:+a.winRate.toFixed(3),confidenceDelta:0,scoreDelta:0,sizeMultiplier:1,block:false,reason:''};
  if(a.samples15<MIN_TIMING_SAMPLES)return out;
  if(a.quality<-.12||(a.winRate!=null&&a.winRate<.45)){
    const severity=clamp(Math.abs(a.quality)*1.8+(a.winRate==null?0:Math.max(0,.48-a.winRate))*2,.25,1.6);out.confidenceDelta=-clamp(.025+severity*.035,.03,.10);out.scoreDelta=-clamp(.35+severity*.75,.45,1.7);out.sizeMultiplier=clamp(1-severity*.22,.55,.9);out.reason=`Timing-Lernen bremst ${bucket}: ${a.samples15} 15m-Fälle, Ø-Qualität ${a.quality.toFixed(2)}%`;
    if(a.samples15>=HARD_TIMING_SAMPLES&&['CHASE_NEAR_HIGH','EXTENDED_MOMENTUM'].includes(bucket)&&a.quality<-.20&&a.winRate!=null&&a.winRate<.42){out.block=true;out.reason=`Timing-Lernen blockiert ${bucket}: ${a.samples15} Fälle, Ø ${a.quality.toFixed(2)}%, Treffer ${(a.winRate*100).toFixed(0)}%`}
    if(a.samples15>=REBOUND_HARD_SAMPLES&&bucket==='REBOUND_REVERSAL'&&a.quality<-.30&&a.winRate!=null&&a.winRate<.38){out.block=true;out.reason=`Rebound-Lernen blockiert schlechtes REVERSAL-Muster: ${a.samples15} Fälle, Ø ${a.quality.toFixed(2)}%, Treffer ${(a.winRate*100).toFixed(0)}%`}
  }else if(a.quality>.18&&a.winRate!=null&&a.winRate>.55){out.confidenceDelta=.025;out.scoreDelta=clamp(.25+a.quality*.35,.25,.65);out.sizeMultiplier=bucket==='REBOUND_REVERSAL'?1.05:1.08;out.reason=`Timing-Lernen bestätigt ${bucket}: ${a.samples15} Fälle, Ø ${a.quality.toFixed(2)}%, Treffer ${(a.winRate*100).toFixed(0)}%`}
  return out
}
export function getEntryTimingAdjustment(storage,candidate){const state=read(storage),bucket=classifyEntryTiming(candidate);return adjustmentFromState(state,bucket)}
export function getLiveLearningStatus(storage){
  const state=read(storage),buckets=Object.keys(state.timingStats||{}).map(bucket=>{const a=timingAggregate(state,bucket),adj=adjustmentFromState(state,bucket);return{bucket,samples15:a.samples15,totalCheckpoints:a.totalCheckpoints,qualityPct:+a.quality.toFixed(3),winRatePct:a.winRate==null?null:+(a.winRate*100).toFixed(1),block:adj.block,scoreDelta:adj.scoreDelta}}).sort((a,b)=>b.samples15-a.samples15||b.totalCheckpoints-a.totalCheckpoints);
  const rebound=buckets.find(x=>x.bucket==='REBOUND_REVERSAL')||{bucket:'REBOUND_REVERSAL',samples15:0,totalCheckpoints:0,qualityPct:0,winRatePct:null,block:false,scoreDelta:0};
  return{version:3,mode:'15/30/60-minute-entry-timing-learning',activePositions:Object.keys(state.open||{}).length,pendingEntries:Object.keys(state.pending||{}).length,completedTradeOutcomes:num(state.completed),timedCheckpoints:num(state.timedCompleted),horizonsMinutes:HORIZONS,minSamplesBeforeAdjustment:MIN_TIMING_SAMPLES,hardBlockSamples:HARD_TIMING_SAMPLES,reboundHardBlockSamples:REBOUND_HARD_SAMPLES,reboundTimingLearning:true,reboundTiming:rebound,matureTimingBuckets:buckets.filter(x=>x.samples15>=MIN_TIMING_SAMPLES).length,buckets:buckets.slice(0,12),recentTiming:arr(state.recentTiming).slice(-12).reverse()}
}

export function applyLiveOutcomeLearning(fast,prompt,storage){
  if(!fast)return fast;const held=heldFromPrompt(prompt),heldMap=new Map(held.map(x=>[key(x.symbol),x])),candidateMap=new Map(candidatesFromPrompt(prompt).map(x=>[key(x.symbol),x])),ctx=contextMap(fast,prompt),state=read(storage),now=Date.now();state.open=state.open||{};state.pending=state.pending||{};state.stats=state.stats||{};state.timingStats=state.timingStats||{};
  for(const [symbol,o] of Object.entries(state.open))if(!heldMap.has(symbol)){addOutcome(state,o.signature||'UNKNOWN',num(o.lastPnlPct));delete state.open[symbol]}
  for(const [symbol,h] of heldMap){
    const pending=state.pending[symbol],currentCtx=ctx.get(symbol);let o=state.open[symbol];
    if(!o)o={signature:pending?.signature||currentCtx?.signature||'UNKNOWN',timingBucket:pending?.timingBucket||currentCtx?.timingBucket||'UNKNOWN_ENTRY',timingSnapshot:pending?.timingSnapshot||currentCtx?.timingSnapshot||null,openedAt:num(pending?.at,now),peakPnlPct:num(h.peakPnlPct,h.pnlPct),minPnlPct:num(h.pnlPct),maxPnlPct:num(h.pnlPct),checkpoints:{}};
    const pnl=num(h.pnlPct);o.lastPnlPct=pnl;o.peakPnlPct=Math.max(num(o.peakPnlPct),num(h.peakPnlPct,pnl));o.minPnlPct=Math.min(num(o.minPnlPct,pnl),pnl);o.maxPnlPct=Math.max(num(o.maxPnlPct,pnl),pnl);o.updatedAt=now;o.checkpoints=o.checkpoints||{};
    const ageMin=(now-num(o.openedAt,now))/60000;
    for(const horizon of HORIZONS){if(o.checkpoints[horizon])continue;if(ageMin>=horizon&&ageMin<=horizon+CHECKPOINT_GRACE_MIN){addTimedOutcome(state,o.timingBucket||'UNKNOWN_ENTRY',horizon,pnl,num(o.minPnlPct),num(o.maxPnlPct),symbol);o.checkpoints[horizon]={at:now,pnlPct:pnl}}else if(ageMin>horizon+CHECKPOINT_GRACE_MIN)o.checkpoints[horizon]={missed:true,at:now}}
    state.open[symbol]=o;delete state.pending[symbol]
  }
  for(const [symbol,p] of Object.entries(state.pending))if(now-num(p.at)>24*3600*1000)delete state.pending[symbol];

  const actions=[];for(const a of arr(fast.actions)){const symbol=key(a.symbol),c=ctx.get(symbol),candidate=candidateMap.get(symbol)||{},sig=c?.signature||'UNKNOWN',st=state.stats[sig],count=num(st?.count),winRate=count?num(st.wins)/count:null,avgPnl=count?num(st.sumPnl)/count:null,timingBucket=c?.timingBucket||classifyEntryTiming(candidate,c),timingAdj=adjustmentFromState(state,timingBucket);let next={...a,entryTimingBucket:timingBucket,entryTimingScoreDelta:timingAdj.scoreDelta};
    if(a.action==='BUY'&&count>=12){if(avgPnl<-.2||winRate<.42){next.confidence=clamp(num(a.confidence)-.07,.5,.95);next.reason=`${a.reason} · Live-Lernen bremst Setup (${count} Fälle, Ø ${avgPnl.toFixed(2)}%)`;if(count>=25&&avgPnl<-.45&&winRate<.4)continue}else if(avgPnl>.25&&winRate>.54){next.confidence=clamp(num(a.confidence)+.035,.5,.95);next.reason=`${a.reason} · Live-Lernen bestätigt Setup (${count} Fälle, Treffer ${(winRate*100).toFixed(0)}%)`}}
    if(next.action==='BUY'&&timingAdj.samples>=MIN_TIMING_SAMPLES){if(timingAdj.block){actions.push({symbol,action:'HOLD',confidence:clamp(num(next.confidence,.55),.5,.8),allocation_pct:0,reason:`ENTRY-TIMING-BLOCK: ${timingAdj.reason}`,entryTimingBucket:timingBucket,entryTimingScoreDelta:timingAdj.scoreDelta});continue}next.confidence=clamp(num(next.confidence)+timingAdj.confidenceDelta,.5,.95);next.allocation_pct=clamp(num(next.allocation_pct)*timingAdj.sizeMultiplier,0,100);next.reason=`${next.reason} · ${timingAdj.reason}`}
    if(next.action==='BUY')state.pending[symbol]={signature:sig,timingBucket,timingSnapshot:c?.timingSnapshot||null,at:now};actions.push(next)
  }
  state.version=3;state.updatedAt=now;write(storage,state);const learned=Object.entries(state.stats).filter(([,v])=>num(v.count)>=12).length,timingMature=Object.keys(state.timingStats).filter(x=>timingAggregate(state,x).samples15>=MIN_TIMING_SAMPLES).length;
  return{...fast,actions,liveLearning:{completedOutcomes:num(state.completed),matureSetupBuckets:learned,minOutcomesPerBucket:12,timedCheckpoints:num(state.timedCompleted),matureTimingBuckets:timingMature,timingHorizonsMinutes:HORIZONS,minTimingSamples:MIN_TIMING_SAMPLES,reboundTimingLearning:true,mode:'trade-outcome + 15/30/60-minute entry-timing learning'}}
}
