import {scoreAllV287} from './calibrated-action-score-v287.js';

const KEY='state/score-hysteresis-v289';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

export const SCORE_BEHAVIOR_V289={
  version:28.9,
  candidate:{
    exceptionalBuy:84,
    confirmedBuy:76,
    earlyRisingBuy:72,
    confirm:68,
    watch:58
  },
  position:{
    strongHold:60,
    hold:50,
    caution:48,
    breakExit:46,
    confirmedExit:42,
    urgentExit:30
  },
  trend:{
    risingDelta:3,
    strongRisingDelta:6,
    fallingDelta:-3,
    strongFallingDelta:-7,
    windowMinutes:6
  },
  minimumCoverage:.67,
  scoreOnlySellMinAgeMinutes:25,
  urgentScoreSellMinAgeMinutes:15,
  maxEarlyBuysPerDecision:2
};

function defaults(){return{version:1,histories:{},recent:[],stats:{earlyBuys:0,confirmedBuys:0,waits:0,softSellsHeld:0,scoreSells:0,fallingBuysBlocked:0},updatedAt:null}}
function hardReason(reason=''){return/(?:HARD[- ]?EVENT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST|TARGET-VENUE-BLOCK|VENUE|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|NEWS-IMPACT BLOCK|NEWS-SHOCK|ORDER[- ]?ECONOM|UNECONOMIC|STRONG[- ]?SELL|CONFIRMED REVERSAL)/i.test(String(reason))}
function buySafetyReason(reason=''){return hardReason(reason)||/(?:FALLING[- ]?KNIFE|FOMO|PEAK|OVERHEAT|HIGH[- ]?CHASE|VERKÄUFER|SELLER[- ]?TAKEOVER)/i.test(String(reason))}
function maturityHoldReason(reason=''){return/(?:THESIS-MATURITY V28\.0|RECOVERY-WINDOW V28\.0)/i.test(String(reason))}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at??p?.openedAt??''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}

function historyFor(mem,symbol,now=Date.now()){
  const rows=arr(mem?.histories?.[symbol]).filter(x=>now-num(x?.at,0)<=12*60000).sort((a,b)=>num(a.at)-num(b.at));
  return rows;
}
function trendFromHistory(history,currentScore,now=Date.now()){
  const cfg=SCORE_BEHAVIOR_V289.trend,rows=arr(history).filter(x=>now-num(x?.at,0)<=cfg.windowMinutes*60000&&num(x?.at,0)<now-15_000);
  const prev=rows.at(-1)||null,oldest=rows[0]||null;
  const delta1=prev?currentScore-num(prev.score,currentScore):0;
  const deltaWindow=oldest?currentScore-num(oldest.score,currentScore):0;
  const rising=delta1>=2||deltaWindow>=cfg.risingDelta;
  const strongRising=delta1>=4||deltaWindow>=cfg.strongRisingDelta;
  const falling=delta1<=-2||deltaWindow<=cfg.fallingDelta;
  const strongFalling=delta1<=-5||deltaWindow<=cfg.strongFallingDelta;
  const priorHigh=rows.filter(x=>num(x.score)>=72).length;
  const priorLow=rows.filter(x=>num(x.score)<=40).length;
  return{delta1:+delta1.toFixed(1),deltaWindow:+deltaWindow.toFixed(1),rising,strongRising,falling,strongFalling,confirmedHigh:priorHigh>=1&&currentScore>=72,confirmedLow:priorLow>=1&&currentScore<=40,samples:rows.length+1};
}

export function decideCandidateBehaviorV289(row={},history=[],now=Date.now()){
  const cfg=SCORE_BEHAVIOR_V289,score=num(row?.buyScore,row?.fusionScore),coverage=num(row?.coverage),trend=trendFromHistory(history,score,now),over=Boolean(row?.overextended),reclaim=Boolean(row?.reclaim),blocked=Boolean(row?.hardBlocked);
  if(blocked)return{action:'AVOID',label:'Blockiert',score,trend,reason:'hard_block'};
  if(over&&!reclaim){
    if(score>=cfg.candidate.exceptionalBuy&&trend.confirmedHigh&&!trend.strongFalling)return{action:'WAIT',label:'Sehr stark, aber überdehnt',score,trend,reason:'cooldown_after_extension'};
    return{action:'WAIT',label:'Warten auf Rücksetzer/Reclaim',score,trend,reason:'overextended'};
  }
  if(score>=cfg.candidate.exceptionalBuy&&coverage>=cfg.minimumCoverage&&!trend.falling)return{action:'BUY',label:'Sofort kaufbereit',score,trend,reason:'exceptional'};
  if(score>=cfg.candidate.confirmedBuy&&coverage>=cfg.minimumCoverage&&trend.confirmedHigh&&!trend.falling)return{action:'BUY',label:'Kaufbereit',score,trend,reason:'confirmed'};
  if(score>=cfg.candidate.earlyRisingBuy&&coverage>=cfg.minimumCoverage&&trend.strongRising&&!trend.falling)return{action:'BUY_EARLY',label:'Früher Einstieg',score,trend,reason:'strong_rising'};
  if(score>=cfg.candidate.confirm)return{action:'WAIT',label:trend.rising?'Bestätigung läuft':'Bestätigen',score,trend,reason:'confirm_zone'};
  if(score>=cfg.candidate.watch)return{action:'WATCH',label:trend.rising?'Beobachten · verbessert sich':'Beobachten',score,trend,reason:'watch_zone'};
  return{action:'AVOID',label:trend.rising?'Noch zu schwach · verbessert sich':'Schwach',score,trend,reason:'weak'};
}

export function decidePositionBehaviorV289(row={},history=[],position={},now=Date.now()){
  const cfg=SCORE_BEHAVIOR_V289,score=num(row?.holdScore,row?.fusionScore),coverage=num(row?.coverage),trend=trendFromHistory(history,score,now),age=ageMinutes(position,now),partial=Boolean(row?.partial);
  if(partial)return{action:'HOLD',label:'Halten · Teilscore',score,trend,age,reason:'partial_score'};
  if(score>=cfg.position.strongHold)return{action:'HOLD',label:'Stark halten',score,trend,age,reason:'strong_hold'};
  if(score>=cfg.position.hold)return{action:'HOLD',label:trend.strongFalling?'Halten · Trend beobachten':'Halten',score,trend,age,reason:'hold'};
  if(score>=cfg.position.caution)return{action:'HOLD',label:trend.strongFalling?'Halten · Trend kippt':'Halten',score,trend,age,reason:'hold_caution'};
  if(score<=cfg.position.breakExit&&coverage>=cfg.minimumCoverage&&age>=30&&trend.strongFalling&&!trend.strongRising)return{action:'SELL',label:'Verkaufen · Trendbruch',score,trend,age,reason:'strong_break'};
  if(score<=cfg.position.urgentExit&&coverage>=cfg.minimumCoverage&&age>=cfg.urgentScoreSellMinAgeMinutes&&!trend.strongRising)return{action:'SELL',label:'Verkaufen',score,trend,age,reason:'urgent_low'};
  if(score<=cfg.position.confirmedExit&&coverage>=cfg.minimumCoverage&&age>=cfg.scoreOnlySellMinAgeMinutes&&(trend.confirmedLow||trend.strongFalling)&&!trend.strongRising)return{action:'SELL',label:'Verkaufen · bestätigt',score,trend,age,reason:'confirmed_low'};
  if(trend.strongRising)return{action:'HOLD',label:'Halten · Erholung läuft',score,trend,age,reason:'recovery_rising'};
  return{action:'SELL_WATCH',label:'Verkauf beobachten',score,trend,age,reason:'low_unconfirmed'};
}

function allocationPct(cash,score,early=false){let pct=(early?6:8)+Math.max(0,score-(early?72:76))*.18;if(cash>=500&&!early)pct=Math.max(pct,500/cash*100);return +clamp(pct,early?5:7,early?9:12).toFixed(2)}
function record(mem,rows,now){mem.histories=mem.histories||{};for(const row of rows){const s=key(row);if(!s)continue;const score=num(row?.position?row?.holdScore:row?.buyScore,row?.fusionScore);let h=historyFor(mem,s,now);if(h.length&&now-num(h.at(-1)?.at,0)<20_000)h[h.length-1]={at:now,score,coverage:num(row?.coverage),position:Boolean(row?.position)};else h.push({at:now,score,coverage:num(row?.coverage),position:Boolean(row?.position)});mem.histories[s]=h.slice(-8)}for(const s of Object.keys(mem.histories))if(!mem.histories[s].length||now-num(mem.histories[s].at(-1)?.at,0)>20*60000)delete mem.histories[s]}

export function enforceScoreHysteresisV289(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const mem={...defaults(),...read(storage,defaults())};mem.histories={...(mem.histories||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
  const scored=scoreAllV287(state,storage,now,false),byC=new Map(scored.ranking.map(x=>[key(x),x])),byP=new Map(scored.positionScores.map(x=>[key(x),x])),positions=new Map(arr(state?.positions).map(x=>[key(x),x])),actions=plan.actions.map(x=>({...x}));
  const counters={earlyBuys:0,confirmedBuys:0,waits:0,softSellsHeld:0,scoreSells:0,fallingBuysBlocked:0};
  const candidateBehaviors=[];
  for(const row of scored.ranking){candidateBehaviors.push({...decideCandidateBehaviorV289(row,historyFor(mem,key(row),now),now),symbol:key(row),coverage:num(row.coverage),overextended:Boolean(row.overextended),reclaim:Boolean(row.reclaim)})}
  const cBehavior=new Map(candidateBehaviors.map(x=>[x.symbol,x]));
  let promoted=0;
  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a),kind=String(a?.action||'').toUpperCase(),row=byC.get(s),behavior=cBehavior.get(s);
    if(kind==='BUY'&&row&&behavior){
      if(behavior.action==='AVOID'||behavior.action==='WATCH'||behavior.action==='WAIT'){
        actions[i]={...a,action:'HOLD',allocation_pct:0,reason:`SCORE-HYSTERESIS V28.9 WAIT: ${s} ${behavior.score.toFixed(1)}/100 · ${behavior.label} · Trend ${behavior.trend.deltaWindow>=0?'+':''}${behavior.trend.deltaWindow.toFixed(1)} Punkte. Einstieg erst bei bestätigter Stärke; starke Überdehnung wartet auf Reclaim statt FOMO.`};counters.waits++;if(behavior.trend.strongFalling)counters.fallingBuysBlocked++;
      }
    }
  }
  const promotable=candidateBehaviors.filter(x=>['BUY','BUY_EARLY'].includes(x.action)).sort((a,b)=>b.score-a.score);
  for(const behavior of promotable){
    if(promoted>=SCORE_BEHAVIOR_V289.maxEarlyBuysPerDecision)break;
    const idx=actions.findIndex(a=>key(a)===behavior.symbol&&String(a?.action||'').toUpperCase()==='HOLD'&&!buySafetyReason(a?.reason));if(idx<0)continue;
    const a=actions[idx],cash=Math.max(0,num(state?.config?.cash,state?.cash)),early=behavior.action==='BUY_EARLY';
    actions[idx]={...a,action:'BUY',allocation_pct:allocationPct(cash,behavior.score,early),confidence:clamp(Math.max(num(a?.confidence,.62),early?.64:.68),.60,.90),reason:`SCORE-HYSTERESIS V28.9 ${early?'EARLY BUY':'BUY'}: ${behavior.symbol} ${behavior.score.toFixed(1)}/100 · ${behavior.label} · Trend ${behavior.trend.deltaWindow>=0?'+':''}${behavior.trend.deltaWindow.toFixed(1)} Punkte · ${Math.round(behavior.coverage*100)}% Datenabdeckung. ${early?'Kleiner Starter, weil der Score schnell in die Kaufzone steigt; so wird nicht erst am späten Peak gekauft.':'Hoher Score ist über mehrere Scans bestätigt.'}`};promoted++;if(early)counters.earlyBuys++;else counters.confirmedBuys++;
  }
  const positionBehaviors=[];
  for(const row of scored.positionScores){const s=key(row),p=positions.get(s)||{},behavior=decidePositionBehaviorV289(row,historyFor(mem,s,now),p,now);positionBehaviors.push({...behavior,symbol:s,coverage:num(row.coverage),partial:Boolean(row.partial)})}
  const pBehavior=new Map(positionBehaviors.map(x=>[x.symbol,x]));
  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a),kind=String(a?.action||'').toUpperCase(),behavior=pBehavior.get(s),row=byP.get(s);
    if(!behavior||!row)continue;
    if(kind==='SELL'){
      if(hardReason(a?.reason))continue;
      if(behavior.action==='HOLD'||behavior.action==='SELL_WATCH'){
        actions[i]={...a,action:'HOLD',allocation_pct:0,reason:`SCORE-HYSTERESIS V28.9 HOLD: ${s} Haltescore ${behavior.score.toFixed(1)}/100 · ${behavior.label} · Trend ${behavior.trend.deltaWindow>=0?'+':''}${behavior.trend.deltaWindow.toFixed(1)} Punkte. Soft-SELL wird erst ausgeführt, wenn niedriger Score und fallende Richtung zusammen bestätigt sind.`};counters.softSellsHeld++;
      }
    }else if(kind==='HOLD'&&behavior.action==='SELL'&&!maturityHoldReason(a?.reason)){
      actions[i]={...a,action:'SELL',allocation_pct:0,confidence:.82,reason:`SCORE-HYSTERESIS V28.9 SELL: ${s} Haltescore ${behavior.score.toFixed(1)}/100 · ${behavior.label} · Trend ${behavior.trend.deltaWindow>=0?'+':''}${behavior.trend.deltaWindow.toFixed(1)} Punkte · Position ${behavior.age.toFixed(1)} Min. alt. Verkauf erst nach bestätigter Schwäche; Hard-Risiken bleiben weiterhin sofort.`};counters.scoreSells++;
    }
  }
  record(mem,[...scored.ranking,...scored.positionScores.map(x=>({...x,position:true}))],now);mem.stats.earlyBuys=num(mem.stats.earlyBuys)+counters.earlyBuys;mem.stats.confirmedBuys=num(mem.stats.confirmedBuys)+counters.confirmedBuys;mem.stats.waits=num(mem.stats.waits)+counters.waits;mem.stats.softSellsHeld=num(mem.stats.softSellsHeld)+counters.softSellsHeld;mem.stats.scoreSells=num(mem.stats.scoreSells)+counters.scoreSells;mem.stats.fallingBuysBlocked=num(mem.stats.fallingBuysBlocked)+counters.fallingBuysBlocked;mem.updatedAt=new Date(now).toISOString();mem.recent.push({at:now,...counters});mem.recent=mem.recent.slice(-100);write(storage,mem);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,155)} · HYSTERESIS V28.9: ${counters.earlyBuys} früher BUY · ${counters.confirmedBuys} bestätigt BUY · ${counters.waits} WAIT · ${counters.softSellsHeld} Soft-SELL gehalten · ${counters.scoreSells} bestätigte Score-SELL.`;
  return{plan,counters,candidateBehaviors,positionBehaviors,state:mem}
}

export class ScoreHysteresisGuardV289{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const plan=parsePlan(r);if(!plan)return r;const out=enforceScoreHysteresisV289(plan,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const mem={...defaults(),...read(this.storage,defaults())};return{enabled:true,version:28.9,thresholds:SCORE_BEHAVIOR_V289,latest:this.latest?.counters||null,candidateBehaviors:this.latest?.candidateBehaviors||[],positionBehaviors:this.latest?.positionBehaviors||[],stats:mem.stats||{},rule:'V28.9 nutzt Hysterese statt einer einzigen Schwelle: Kandidaten werden früher klein gekauft, wenn der Score schnell und sauber steigt; normale Käufe brauchen höhere/mehrfach bestätigte Werte. Positionen dürfen deutlich tiefer fallen als die Einstiegsschwelle, bevor ein Soft-SELL erlaubt wird. Score-Richtung und mehrere Scans verhindern Flip-Flop; Hard-Risiken bleiben sofort.'}}
}
