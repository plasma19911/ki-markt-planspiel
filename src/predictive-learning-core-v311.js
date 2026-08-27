const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const canonicalScore=v=>{let x=num(v);if(x>0&&x<=10)x*=10;return clamp(x,0,100)};

export const PREDICTIVE_LEARNING_V311={
  version:31.1,
  patch:'31.1-predictive-self-learning-entry',
  storageKey:'predictive-learning-v311',
  horizonMinutes:20,
  snapshotSpacingMinutes:4,
  maxSamplesPerSymbol:28,
  minCurrentScore:60,
  minForecastScore:72,
  maxPredictiveAllocationPct:36,
  maxOpenPositions:4,
  minLearningSamples:12
};

const HARD=/HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|REENTRY|SUSPEND|HALT|DELIST|MARKET CLOSED|TRADE-REPUBLIC-BLOCK|TARGET-VENUE/i;
const brokerExact=c=>c?.brokerVerified===true&&String(c?.assetClass||c?.type||'EQUITY').toUpperCase()==='EQUITY'&&String(c?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'&&/Trade Republic/i.test(String(c?.brokerVerificationSource||''))&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(c?.isin||''));
const priceOf=c=>num(c?.price,num(c?.last_price,num(c?.regularMarketPrice,0)));
const scoreOf=c=>canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score);
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

function cleanMemory(memory={}){
  const m=memory&&typeof memory==='object'?memory:{};
  const stats=m.stats&&typeof m.stats==='object'?m.stats:{};
  return{
    version:PREDICTIVE_LEARNING_V311.version,
    updatedAt:m.updatedAt||null,
    symbols:m.symbols&&typeof m.symbols==='object'?m.symbols:{},
    stats:{matured:Math.max(0,num(stats.matured)),wins:Math.max(0,num(stats.wins)),sumReturn:num(stats.sumReturn),sumAbsReturn:Math.max(0,num(stats.sumAbsReturn))}
  };
}

function learningProfile(stats={}){
  const matured=Math.max(0,num(stats.matured)),wins=Math.max(0,num(stats.wins)),hitRate=matured?wins/matured:null,avgReturn=matured?num(stats.sumReturn)/matured:null;
  let thresholdAdjustment=0,allocationAdjustment=0,mode='WARMUP';
  if(matured>=PREDICTIVE_LEARNING_V311.minLearningSamples){
    mode='CALIBRATED';
    if((hitRate??0)<.42||(avgReturn??0)<-.12){thresholdAdjustment=4;allocationAdjustment=-6;mode='DEFENSIVE'}
    else if((hitRate??0)<.49||(avgReturn??0)<0){thresholdAdjustment=2;allocationAdjustment=-3;mode='CAUTIOUS'}
    else if((hitRate??0)>=.64&&(avgReturn??0)>=.18){thresholdAdjustment=-2;allocationAdjustment=5;mode='CONFIDENT'}
    else if((hitRate??0)>=.57&&(avgReturn??0)>=.08){thresholdAdjustment=-1;allocationAdjustment=2;mode='POSITIVE'}
  }
  return{matured,wins,hitRate:hitRate===null?null:+(hitRate*100).toFixed(1),avg20mReturnPct:avgReturn===null?null:+avgReturn.toFixed(3),thresholdAdjustment,allocationAdjustment,mode};
}

function vector(c={}){
  return{symbol:key(c),price:priceOf(c),score:scoreOf(c),confidence:confidenceOf(c),m5:m5Of(c),m20:m20Of(c),accel:accelOf(c),news:newsOf(c),day:dayOf(c),rsi:rsiOf(c),direction:directionOf(c),event:eventOf(c),sell:sellOf(c)};
}

function forecastFor(v,previous,profile,now){
  let velocity5=0,previousAgeMinutes=null;
  if(previous&&Number.isFinite(Number(previous.ts))){
    const mins=Math.max(.25,(now-num(previous.ts))/60000);previousAgeMinutes=mins;
    if(mins<=18)velocity5=(v.score-num(previous.score,v.score))/mins*5;
  }
  const velocityBonus=clamp(velocity5*1.35,-6,10);
  const m5Bonus=clamp(v.m5*5,-3,4.5),m20Bonus=clamp(v.m20*2.7,-3,5),accelBonus=clamp(v.accel*8,-2.5,4.5),newsBonus=clamp(v.news*4,-3.5,3.5);
  const confidenceBonus=clamp((v.confidence-.55)*7,-1.5,2.2),directionBonus=v.direction==='UP'?1.5:v.direction==='DOWN'?-2:0;
  let chasePenalty=0;if(v.day>5)chasePenalty-=8;else if(v.day>3.5)chasePenalty-=4;if(v.rsi>=78)chasePenalty-=6;else if(v.rsi>=74)chasePenalty-=3;if(v.m5<0&&velocity5<=0)chasePenalty-=2.5;
  const forecastScore=clamp(v.score+velocityBonus+m5Bonus+m20Bonus+accelBonus+newsBonus+confidenceBonus+directionBonus+chasePenalty,0,100);
  const agreement=[velocity5>=1,v.m5>=.08,v.m20>=.05,v.accel>=.01,v.news>=0,v.direction==='UP'].filter(Boolean).length;
  const signalConfidence=clamp(v.confidence*.62+(agreement/6)*.28+(forecastScore-v.score>5?.08:0),.35,.94);
  const currentFloor=PREDICTIVE_LEARNING_V311.minCurrentScore+profile.thresholdAdjustment,forecastFloor=PREDICTIVE_LEARNING_V311.minForecastScore+Math.max(-1,profile.thresholdAdjustment);
  const leadingMove=velocity5>=1||(v.m5>=.08&&v.accel>=.01)||(v.m5>=.15&&v.m20>=.08);
  const safe=v.event!=='HIGH'&&v.sell!=='STRONG'&&v.news>-.35&&v.day>=-4&&v.day<=3.5&&v.rsi<74;
  const earlySignal=v.score>=currentFloor&&v.score<68&&forecastScore>=forecastFloor&&signalConfidence>=.58&&leadingMove&&safe&&v.price>0;
  return{...v,velocity5:+velocity5.toFixed(3),previousAgeMinutes:previousAgeMinutes===null?null:+previousAgeMinutes.toFixed(2),forecast20mScore:+forecastScore.toFixed(2),signalConfidence:+signalConfidence.toFixed(3),earlySignal,currentFloor,forecastFloor,agreement};
}

export function updatePredictiveLearningMemory(memory={},candidates=[],now=Date.now()){
  const m=cleanMemory(memory),profileBefore=learningProfile(m.stats),predictions={};
  const seen=new Set();
  for(const c of arr(candidates)){
    const v=vector(c);if(!v.symbol)continue;seen.add(v.symbol);
    const slot=m.symbols[v.symbol]&&typeof m.symbols[v.symbol]==='object'?m.symbols[v.symbol]:{samples:[]};
    let samples=arr(slot.samples).filter(x=>x&&Number.isFinite(Number(x.ts))&&now-num(x.ts)<8*60*60*1000);
    for(const sample of samples){
      if(sample.evaluated||sample.earlySignal!==true||!(num(sample.price)>0)||!(v.price>0))continue;
      const age=now-num(sample.ts);if(age<PREDICTIVE_LEARNING_V311.horizonMinutes*60000||age>75*60000)continue;
      const ret=(v.price/num(sample.price)-1)*100;sample.evaluated=true;sample.evaluatedAt=now;sample.outcomePct=+ret.toFixed(4);m.stats.matured++;m.stats.sumReturn+=ret;m.stats.sumAbsReturn+=Math.abs(ret);if(ret>=.12)m.stats.wins++;
    }
    const previous=[...samples].reverse().find(x=>now-num(x.ts)<=18*60000)||null;
    const profile=learningProfile(m.stats),p=forecastFor(v,previous,profile,now);predictions[v.symbol]=p;
    const last=samples.at(-1),spacing=PREDICTIVE_LEARNING_V311.snapshotSpacingMinutes*60000;
    if(!last||now-num(last.ts)>=spacing){samples.push({ts:now,price:v.price,score:v.score,forecast20mScore:p.forecast20mScore,signalConfidence:p.signalConfidence,earlySignal:p.earlySignal,evaluated:false});}
    samples=samples.slice(-PREDICTIVE_LEARNING_V311.maxSamplesPerSymbol);m.symbols[v.symbol]={samples,lastForecast:p.forecast20mScore,lastScore:v.score,lastSeenAt:now};
  }
  for(const [s,slot] of Object.entries(m.symbols)){if(!seen.has(s)&&now-num(slot?.lastSeenAt)>6*60*60*1000)delete m.symbols[s]}
  m.updatedAt=new Date(now).toISOString();
  const profile=learningProfile(m.stats),top=Object.values(predictions).sort((a,b)=>b.forecast20mScore-a.forecast20mScore||b.velocity5-a.velocity5).slice(0,10).map(p=>({symbol:p.symbol,score:p.score,forecast20mScore:p.forecast20mScore,velocity5:p.velocity5,confidence:p.signalConfidence,earlySignal:p.earlySignal}));
  return{memory:m,predictions,status:{enabled:true,...PREDICTIVE_LEARNING_V311,...profile,trackedSymbols:Object.keys(m.symbols).length,topForecasts:top,previousMode:profileBefore.mode,rule:'Jeder Kandidat bekommt aus Score-Verlauf, 5m/20m-Momentum, Beschleunigung, News und Chart-Richtung eine ca. 20-Minuten-Prognose. Früh-Signale werden nach dem späteren Kurs automatisch als Treffer/Fehler bewertet; Trefferquote und mittlere Folgebewegung passen Einstiegsschwelle und Positionsgröße konservativ an.'}};
}

function candidateMap(state={},brokerRows=[]){
  const master=new Map(arr(brokerRows).map(r=>[key(r),r]).filter(([s])=>s)),out=new Map();
  for(const c of arr(state?.candidates)){const s=key(c);if(!s)continue;const r=master.get(s);out.set(s,r?{...r,...c,isin:r.isin||c?.isin,brokerVerified:r.brokerVerified===true,brokerMatchMode:r.brokerMatchMode||c?.brokerMatchMode,brokerVerificationSource:r.brokerVerificationSource||c?.brokerVerificationSource,assetClass:r.assetClass||c?.assetClass}:c)}
  return out;
}

export function enforcePredictiveEarlyEntryV311(plan,state={},learning={},brokerRows=[]){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const positions=arr(state?.positions),held=new Set(positions.map(key));if(positions.length>=PREDICTIVE_LEARNING_V311.maxOpenPositions)return{plan,counters:{eligible:0,injected:0,reason:'NO_FREE_SLOT'}};
  const cmap=candidateMap(state,brokerRows),predictions=learning?.predictions||{},profile=learning?.status||learningProfile(learning?.memory?.stats||{}),actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const rows=[];
  for(const p of Object.values(predictions)){
    const s=p?.symbol,c=cmap.get(s);if(!s||!c||held.has(s)||p?.earlySignal!==true||!brokerExact(c))continue;
    const i=idx.get(s),a=i===undefined?{}:actions[i],reason=String(a?.reason||'');if(HARD.test(reason)||eventOf(c)==='HIGH'||sellOf(c)==='STRONG')continue;
    rows.push({p,c,s,i,a,rank:p.forecast20mScore+p.velocity5*1.5+p.signalConfidence*4});
  }
  rows.sort((a,b)=>b.rank-a.rank);const chosen=rows[0]||null;if(!chosen)return{plan,counters:{eligible:0,injected:0,learningMode:profile?.mode||'WARMUP'}};
  const p=chosen.p,adj=num(profile?.allocationAdjustment),pct=+clamp(18+(p.forecast20mScore-72)*1.35+(p.score-60)*.55+(p.signalConfidence-.58)*24+adj,12,PREDICTIVE_LEARNING_V311.maxPredictiveAllocationPct).toFixed(1);
  const buy={...chosen.a,symbol:chosen.s,name:chosen.c?.name||chosen.s,action:'BUY',allocation_pct:pct,confidence:clamp(p.signalConfidence,.62,.91),predictiveEntryV311:true,forecast20mScore:p.forecast20mScore,scoreVelocity5m:p.velocity5,reason:`V31.1 PREDICTIVE-EARLY-ENTRY: aktueller Score ${p.score.toFixed(1)}/100 ist noch unter der normalen 68er Schwelle, steigt aber mit ${p.velocity5>=0?'+':''}${p.velocity5.toFixed(2)} Scorepunkten/5m. 20m-Prognose ${p.forecast20mScore.toFixed(1)}/100, Signal-Konfidenz ${(p.signalConfidence*100).toFixed(0)}%, Lernmodus ${profile?.mode||'WARMUP'}. ${pct.toFixed(1)}% Starter, damit eine bestätigende Bewegung nicht erst nach dem Großteil des Anstiegs gekauft wird; harte News-, Quote-, FX-, Markt- und Re-Entry-Sperren bleiben bindend.`};
  if(chosen.i===undefined){actions.push(buy)}else actions[chosen.i]=buy;
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,120)} · V31.1 Predictor: früher BUY ${chosen.s} bei ${p.score.toFixed(1)}→${p.forecast20mScore.toFixed(1)} Prognose (${pct.toFixed(1)}%).`;
  return{plan,counters:{eligible:rows.length,injected:1,learningMode:profile?.mode||'WARMUP',chosen:{symbol:chosen.s,score:+p.score.toFixed(1),forecast20mScore:+p.forecast20mScore.toFixed(1),velocity5:+p.velocity5.toFixed(2),confidence:+p.signalConfidence.toFixed(3),allocationPct:pct}}};
}
