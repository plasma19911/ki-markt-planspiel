import {stableDecisionScoresV293} from './decision-score-v293.js';

const KEY='state/score-entry-exit-v294';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

export const SCORE_ENTRY_EXIT_V294={
  version:29.4,
  positiveExitDelta:10,
  negativeExitDelta:-15,
  scoreSource:'V29.3_STABLE_DECISION',
  requiresFullChartScore:true,
  minimumHoldMinutes:0
};

function defaults(){return{version:29.4,entries:{},recent:[],stats:{entryScoresStored:0,positiveScoreExits:0,negativeScoreExits:0,partialScoreWaits:0},updatedAt:null}}

export function scoreEntryExitDecisionV294(entryScore,currentScore,{partial=false}={}){
  const entry=num(entryScore,NaN),current=num(currentScore,NaN);
  if(!Number.isFinite(entry)||!Number.isFinite(current))return{action:'HOLD',reason:'missing_score',entryScore:entry,currentScore:current,delta:null};
  const delta=+(current-entry).toFixed(1);
  if(partial&&SCORE_ENTRY_EXIT_V294.requiresFullChartScore)return{action:'HOLD',reason:'partial_chart_score',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
  if(delta>=SCORE_ENTRY_EXIT_V294.positiveExitDelta)return{action:'SELL',reason:'score_plus_10',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
  if(delta<=SCORE_ENTRY_EXIT_V294.negativeExitDelta)return{action:'SELL',reason:'score_minus_15',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
  return{action:'HOLD',reason:'inside_band',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceScoreEntryExitV294(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{positiveScoreExits:0,negativeScoreExits:0,entryScoresStored:0,partialScoreWaits:0}};
  const mem={...defaults(),...read(storage,defaults())};mem.entries={...(mem.entries||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
  const scores=stableDecisionScoresV293(state,storage,now,false),candidateScore=new Map(arr(scores.ranking).map(r=>[key(r),r])),positionScore=new Map(arr(scores.positionScores).map(r=>[key(r),r]));
  const held=new Set(arr(state?.positions).map(p=>key(p)).filter(Boolean)),actions=plan.actions.map(a=>({...a})),actionIndex=new Map();
  actions.forEach((a,i)=>{const s=key(a);if(s&&!actionIndex.has(s))actionIndex.set(s,i)});
  const counters={positiveScoreExits:0,negativeScoreExits:0,entryScoresStored:0,partialScoreWaits:0};

  // Exact purchase baseline: when V29.3 emits a new BUY, remember that same stabilized DecisionScore.
  for(const a of actions){
    const s=key(a);if(!s||held.has(s)||String(a?.action||'').toUpperCase()!=='BUY')continue;
    const row=candidateScore.get(s);if(!row)continue;
    const score=num(row?.decisionScore,row?.buyScore,NaN);if(!Number.isFinite(score))continue;
    mem.entries[s]={score:+score.toFixed(1),at:now,source:'BUY_DECISION_SCORE'};counters.entryScoresStored++;
  }

  // Existing positions from before V29.4 get a neutral baseline once, at the first full chart score.
  for(const p of arr(state?.positions)){
    const s=key(p);if(!s||mem.entries[s])continue;
    const row=positionScore.get(s)||candidateScore.get(s);if(!row||row?.partial)continue;
    const score=num(row?.decisionScore,row?.holdScore,row?.buyScore,NaN);if(!Number.isFinite(score))continue;
    mem.entries[s]={score:+score.toFixed(1),at:now,source:'FIRST_V294_FULL_SCORE'};counters.entryScoresStored++;
  }

  for(const p of arr(state?.positions)){
    const s=key(p),entry=mem.entries[s];if(!s||!entry)continue;
    const row=positionScore.get(s)||candidateScore.get(s);if(!row)continue;
    const current=num(row?.decisionScore,row?.holdScore,row?.buyScore,NaN);if(!Number.isFinite(current))continue;
    const d=scoreEntryExitDecisionV294(entry.score,current,{partial:Boolean(row?.partial)});
    if(d.reason==='partial_chart_score'){counters.partialScoreWaits++;continue}
    if(d.action!=='SELL')continue;
    let idx=actionIndex.get(s);if(idx===undefined){idx=actions.length;actionIndex.set(s,idx);actions.push({symbol:s,action:'HOLD',allocation_pct:0,confidence:.7,reason:'V29.4 score delta position'})}
    const positive=d.delta>=SCORE_ENTRY_EXIT_V294.positiveExitDelta;
    actions[idx]={...actions[idx],action:'SELL',allocation_pct:0,confidence:.88,reason:`V29.4 SCORE-EXIT: ${s} Einstiegsscore ${d.entryScore.toFixed(1)} -> aktueller DecisionScore ${d.currentScore.toFixed(1)} (${d.delta>=0?'+':''}${d.delta.toFixed(1)} Punkte). ${positive?'Score seit Kauf um mindestens 10 Punkte verbessert: SELL.':'Score seit Kauf um mindestens 15 Punkte gefallen: SELL.'}`};
    if(positive)counters.positiveScoreExits++;else counters.negativeScoreExits++;
  }

  // Delete baselines only after the position is really gone. Pending BUY baselines may stay for one day.
  for(const [s,e] of Object.entries(mem.entries))if(!held.has(s)&&!actions.some(a=>key(a)===s&&String(a?.action||'').toUpperCase()==='BUY')&&now-num(e?.at,0)>24*60*60_000)delete mem.entries[s];
  for(const k of Object.keys(counters))mem.stats[k]=num(mem.stats[k])+num(counters[k]);mem.updatedAt=new Date(now).toISOString();mem.recent.push({at:now,...counters});mem.recent=mem.recent.slice(-120);write(storage,mem);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,150)} · V29.4 Score-Exit: +10 => SELL ${counters.positiveScoreExits} · -15 => SELL ${counters.negativeScoreExits}.`;
  return{plan,counters,entries:mem.entries,positionScores:scores.positionScores};
}

export class ScoreEntryExitGuardV294{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceScoreEntryExitV294(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const mem={...defaults(),...read(this.storage,defaults())};return{enabled:true,version:29.4,authoritativePositionScoreExit:true,thresholds:SCORE_ENTRY_EXIT_V294,entries:mem.entries||{},latest:this.latest?.counters||null,stats:mem.stats||{},rule:'Nach einem BUY wird der stabilisierte DecisionScore als Einstiegsscore gespeichert. Bei +10 Punkten seit Kauf wird SELL ausgelöst; bei -15 Punkten seit Kauf ebenfalls SELL. Verglichen wird der geglättete DecisionScore. Ein unvollständiger Teilscore löst keinen chartbasierten Score-Exit aus.'}}
}
