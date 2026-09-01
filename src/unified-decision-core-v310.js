import {enforceHighScoreCapitalDeploymentV309,HIGH_SCORE_CAPITAL_DEPLOYMENT_V309} from './high-score-capital-deployment-v309.js';
import {enforceExpectancyCoreV310,EXPECTANCY_CORE_V310} from './expectancy-core-v310.js';
import {updateOutcomeLearningMemoryV312,recordOutcomeDecisionsV312,enforceOutcomeEarlyEntryV312,OUTCOME_LEARNING_V312} from './outcome-learning-core-v312.js';
import {enforceShadowLearningV314,SHADOW_LEARNING_V314,canonicalEntryAssessmentV316} from './shadow-learning-v314.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const UNIFIED_DECISION_CORE_V310={
  version:31.7,
  patch:'31.7.1-candidate-state-recovery+orthogonal-confirmation+probation+failed-setup-exit',
  architecture:'single-outer-decision-authority',
  persistentAudit:true,
  maxAuditRows:500,
  auditStorageKey:'decision-audit-v310'
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingInput(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}
function parseJsonBetween(text,startMarker,endMarker=null){const start=String(text||'').indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?String(text).indexOf(endMarker,from):-1,raw=String(text).slice(from,end>=0?end:undefined).trim();try{const j=JSON.parse(raw);return Array.isArray(j)?j:[]}catch{return[]}}
function promptTradingState(input){
  const messages=arr(input?.messages);
  for(let i=messages.length-1;i>=0;i--){
    const text=String(messages[i]?.content||'');if(!text.includes('Kandidaten=')||!text.includes(' Gehalten='))continue;
    return{candidates:parseJsonBetween(text,'Kandidaten=',' Gehalten='),held:parseJsonBetween(text,' Gehalten=')};
  }
  return{candidates:[],held:[]};
}
function currentDecisionState(baseState={},input=null){
  const base=baseState&&typeof baseState==='object'?baseState:{},prompt=promptTradingState(input),baseCandidates=arr(base?.candidates);
  if(!prompt.candidates.length)return{...base,candidates:baseCandidates,candidateStateSource:baseCandidates.length?'STATE':'EMPTY'};
  const baseBySymbol=new Map(baseCandidates.map(c=>[key(c),c]).filter(([s])=>s));
  const candidates=prompt.candidates.map(c=>{const s=key(c),stored=baseBySymbol.get(s);return stored?{...stored,...c}:c}).filter(c=>key(c));
  return{...base,candidates,candidateStateSource:'PROMPT_CURRENT_SCAN'};
}
function canonicalScore(v){let x=num(v);if(x>0&&x<=10)x*=10;return Math.max(0,Math.min(100,x))}
function actionSnapshot(a={}){return{symbol:key(a),action:String(a?.action||'HOLD').toUpperCase(),allocationPct:num(a?.allocation_pct),entryScoreV317:a?.entryScoreV317!=null&&Number.isFinite(Number(a.entryScoreV317))?num(a.entryScoreV317):null,dataQualityV317:a?.dataQualityV317!=null&&Number.isFinite(Number(a.dataQualityV317))?num(a.dataQualityV317):null,expectedNetEdgePctV317:a?.expectedNetEdgePctV317!=null&&Number.isFinite(Number(a.expectedNetEdgePctV317))?num(a.expectedNetEdgePctV317):null,orthogonalConfirmationsV317:num(a?.orthogonalConfirmationsV317),entryScoreV316:a?.entryScoreV316!=null&&Number.isFinite(Number(a.entryScoreV316))?num(a.entryScoreV316):null,dataQualityV316:a?.dataQualityV316!=null&&Number.isFinite(Number(a.dataQualityV316))?num(a.dataQualityV316):null,expectedNetEdgePctV316:a?.expectedNetEdgePctV316!=null&&Number.isFinite(Number(a.expectedNetEdgePctV316))?num(a.expectedNetEdgePctV316):null,predictiveEntry:a?.predictiveEntryV311===true,outcomeEntry:a?.outcomeEntryV312===true,forecast20mScore:a?.forecast20mScore!=null&&Number.isFinite(Number(a.forecast20mScore))?num(a.forecast20mScore):null,reason:String(a?.reason||'').slice(0,700)}}
function diffActions(before=[],after=[]){const b=new Map(arr(before).map(a=>[key(a),actionSnapshot(a)])),a=new Map(arr(after).map(x=>[key(x),actionSnapshot(x)])),symbols=new Set([...b.keys(),...a.keys()]),rows=[];for(const s of symbols){if(!s)continue;const x=b.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''},y=a.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''};if(x.action!==y.action||Math.abs(x.allocationPct-y.allocationPct)>.01||x.reason!==y.reason)rows.push({symbol:s,before:x,after:y})}return rows}
function candidateDiagnostics(state={},shadowMem={},cost=.291){const universe=arr(state?.candidates);return universe.map(c=>{const a=canonicalEntryAssessmentV316(c,universe,arr(shadowMem?.matured),cost);return{symbol:key(c),score:a.score,dataQuality:a.dataQuality,orthogonalConfirmations:a.orthogonalConfirmations,expectedNetEdgePct:a.expectedNetEdgePct,probationSamples:a.probationSamples,probationExpectedNetEdgePct:a.probationExpectedNetEdgePct,probationBlocked:a.probationBlocked,legacyScore:canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score),m5:num(c?.momentum5Pct,c?.momentum5),m20:num(c?.momentum20Pct,c?.momentum20),brokerVerified:c?.brokerVerified===true,brokerMatchMode:c?.brokerMatchMode||null}}).filter(x=>x.symbol).sort((a,b)=>b.score-a.score).slice(0,16)}
function positionDiagnostics(state={}){return arr(state?.positions).map(p=>({symbol:key(p),score:canonicalScore(p?.decisionScore??p?.daytradeChanceScore??p?.score),rawScore:canonicalScore(p?.rawDecisionScore??p?.raw_score??p?.rawScore),entryScore:canonicalScore(p?.entryDecisionScore??p?.entry_score??p?.entryScore),entryPrice:num(p?.entry_price),lastPrice:num(p?.last_price),openedAt:p?.opened_at||null,direction:p?.chartDirectionMode??p?.direction??null})).filter(x=>x.symbol)}
function learningAudit(status={}){return{version:status?.version||31.2,mode:status?.mode||'WARMUP',matured:num(status?.matured),buySamples:num(status?.buySamples),buyHitRate:status?.buyHitRate??null,avgBuy20mReturnPct:status?.avgBuy20mReturnPct??null,avg20mReturnPct:status?.avg20mReturnPct??null,missedOpportunities:num(status?.missedOpportunities),badBuys:num(status?.badBuys),earlySells:num(status?.earlySells),correctSells:num(status?.correctSells),trackedSymbols:num(status?.trackedSymbols),currentCandidates:num(status?.currentCandidates),thresholdAdjustment:num(status?.thresholdAdjustment),allocationAdjustment:num(status?.allocationAdjustment),weights:status?.weights||null}}

export async function enforceUnifiedDecisionCoreV310(plan,state={},input=null,brokerRows=[],now=Date.now(),outcomeLearning=null,shadowStorage=null){
  const original={...plan,actions:arr(plan?.actions).map(a=>({...a}))};
  const predictivePass=enforceOutcomeEarlyEntryV312({...plan,actions:arr(plan?.actions).map(a=>({...a}))},state,outcomeLearning||{},brokerRows);
  const buyPass=enforceHighScoreCapitalDeploymentV309(predictivePass.plan,state,input,brokerRows);
  const shadowPass=await enforceShadowLearningV314(buyPass.plan,state,shadowStorage,now);
  const expectancyPass=enforceExpectancyCoreV310(shadowPass.plan,state,now);
  const finalPlan=expectancyPass.plan;
  const changes=diffActions(original.actions,finalPlan.actions);
  const learning=learningAudit(outcomeLearning?.status||{});
  const audit={
    ts:new Date(now).toISOString(),
    patch:UNIFIED_DECISION_CORE_V310.patch,
    scanCount:num(state?.config?.scan_count),
    candidateStateSource:state?.candidateStateSource||'STATE',
    currentCandidateCount:arr(state?.candidates).length,
    cash:num(state?.config?.cash,state?.cash),
    positions:positionDiagnostics(state),
    topCandidates:candidateDiagnostics(state,shadowPass.mem,shadowPass.counters?.roundTripCostPct),
    topPredictions:arr(outcomeLearning?.status?.topForecasts).slice(0,12),
    outcomeLearning:learning,
    predictiveLearning:learning,
    originalActions:original.actions.map(actionSnapshot),
    finalActions:arr(finalPlan.actions).map(actionSnapshot),
    changes,
    counters:{outcome:predictivePass.counters||{},predictive:predictivePass.counters||{},capital:buyPass.counters||{},shadow:shadowPass.counters||{},expectancy:expectancyPass.counters||{}},
    shadowLearning:{...shadowPass.counters,calibration:shadowPass.calibration?.calibration||[]},
    ruleOrder:['hard safety from legacy core','V31.2 continuous outcome learning + early-entry','legacy opportunity proposal','V31.7 canonical score + orthogonal confirmation + probation approval','V31.7 hard-stop/trailing/failed-setup/rotation/stagnation/profit-fade authority'],
    note:'V31.7.1 stellt die Kandidaten des aktuellen KI-Prompts fuer Outcome-Learning und finale Entscheidung wieder her, wenn der persistierte State sie nicht enthaelt. Dadurch werden laufende Chancen tatsaechlich ueber 5/20/60/240 Minuten gelernt. V31.7 verlangt weiterhin fuer neue Kaeufe neben Trend/relativer Staerke mindestens positives Volumen oder bestaetigte positive News und pausiert vorlaeufig verlustreiche Scorebereiche.'
  };
  finalPlan.summary=`${String(finalPlan.summary||'').slice(0,132)} · V31.7.1 Unified: ${changes.length} finale Änderung(en), ${arr(state?.candidates).length} aktuelle Lernkandidaten, Kaufsystem ${shadowPass.counters?.calibrated?'KALIBRIERT':'WARMUP'}.`;
  return{plan:finalPlan,audit,counters:{changes:changes.length,outcome:predictivePass.counters||{},predictive:predictivePass.counters||{},capital:buyPass.counters||{},shadow:shadowPass.counters||{},expectancy:expectancyPass.counters||{}}};
}

export class UnifiedDecisionCoreV310{
  constructor(inner,{getState,getBrokerRows,writeAudit,readOutcomeMemory,writeOutcomeMemory,shadowStorage}={}){this.inner=inner;this.getState=getState;this.getBrokerRows=getBrokerRows;this.writeAudit=writeAudit;this.readOutcomeMemory=readOutcomeMemory;this.writeOutcomeMemory=writeOutcomeMemory;this.shadowStorage=shadowStorage;this.latest=null;this.auditWriteErrors=0;this.predictiveWriteErrors=0;this.predictiveStatus={enabled:true,...OUTCOME_LEARNING_V312,mode:'WARMUP',matured:0,buySamples:0,buyHitRate:null,avg20mReturnPct:null,missedOpportunities:0,badBuys:0,earlySells:0,trackedSymbols:0,currentCandidates:0,weights:null,topForecasts:[]}}
  async run(model,input){
    const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);
    if(!isTradingInput(payload))return r;
    const p=parsePlan(r);if(!p)return r;
    const baseState=typeof this.getState==='function'?(this.getState()||{}):{},state=currentDecisionState(baseState,payload);let brokerRows=[];if(typeof this.getBrokerRows==='function'){try{brokerRows=await this.getBrokerRows()}catch{}}
    const now=Date.now();let outcomeLearning={memory:null,predictions:{},status:this.predictiveStatus};
    try{const previous=typeof this.readOutcomeMemory==='function'?(await this.readOutcomeMemory()||{}):{};outcomeLearning=updateOutcomeLearningMemoryV312(previous,state,now)}catch{this.predictiveWriteErrors++}
    const out=await enforceUnifiedDecisionCoreV310(p,state,payload,brokerRows,now,outcomeLearning,this.shadowStorage);this.latest=out;
    try{
      const recorded=recordOutcomeDecisionsV312(outcomeLearning.memory||{},state,out.plan,outcomeLearning.predictions||{},now);this.predictiveStatus={...outcomeLearning.status,...recorded.status};out.audit.outcomeLearning=learningAudit(this.predictiveStatus);out.audit.predictiveLearning=out.audit.outcomeLearning;
      if(typeof this.writeOutcomeMemory==='function')await this.writeOutcomeMemory(recorded.memory);
    }catch{this.predictiveWriteErrors++;this.predictiveStatus=outcomeLearning.status||this.predictiveStatus}
    if(typeof this.writeAudit==='function'){try{await this.writeAudit(out.audit)}catch{this.auditWriteErrors++}}
    return encode(r,out.plan)
  }
  status(){return{enabled:true,...UNIFIED_DECISION_CORE_V310,outcomeLearning:{...this.predictiveStatus,storageKey:OUTCOME_LEARNING_V312.storageKey,writeErrors:this.predictiveWriteErrors},predictiveLearning:{...this.predictiveStatus,storageKey:OUTCOME_LEARNING_V312.storageKey,writeErrors:this.predictiveWriteErrors},shadowLearning:{enabled:true,...SHADOW_LEARNING_V314,mode:'canonical-entry-score+orthogonal-confirmation+probation',decisionAuthority:false,filtersNewBuys:true,latest:this.latest?.counters?.shadow||null,calibration:this.latest?.audit?.shadowLearning?.calibration||null},capital:{...HIGH_SCORE_CAPITAL_DEPLOYMENT_V309,heldMasterEnrichment:true,noFixedAutoSinglePositionCap:true},expectancy:{hardStopPct:EXPECTANCY_CORE_V310.hardStopPct,trailArmPct:EXPECTANCY_CORE_V310.trailArmPct,minHoldMinutes:EXPECTANCY_CORE_V310.minHoldMinutes,reentryMinutes:EXPECTANCY_CORE_V310.reentryMinutes,reentryScoreImprovement:EXPECTANCY_CORE_V310.reentryScoreImprovement,failedSetupReviewMinutes:EXPECTANCY_CORE_V310.failedSetupReviewMinutes,failedSetupLossPct:EXPECTANCY_CORE_V310.failedSetupLossPct,failedSetupRawScoreMax:EXPECTANCY_CORE_V310.failedSetupRawScoreMax,stagnationReviewMinutes:EXPECTANCY_CORE_V310.stagnationReviewMinutes,maxStagnationMinutes:EXPECTANCY_CORE_V310.maxStagnationMinutes,stagnationBandPct:EXPECTANCY_CORE_V310.stagnationBandPct,stagnationScoreCeiling:EXPECTANCY_CORE_V310.stagnationScoreCeiling,profitFadeReviewMinutes:EXPECTANCY_CORE_V310.profitFadeReviewMinutes,profitFadeMinPct:EXPECTANCY_CORE_V310.profitFadeMinPct,minPositionEur:EXPECTANCY_CORE_V310.minPositionEur},latest:this.latest?.counters||null,auditWriteErrors:this.auditWriteErrors,rule:'Eine einzige äußere Entscheidungsautorität entscheidet final. V31.7.1 nutzt fuer jeden Trading-Aufruf die Kandidaten des aktuellen Prompts als Lernzustand, falls der persistierte State leer ist. V31.7 verlangt fuer neue Käufe neben Trend/relativer Stärke mindestens positives Volumen oder bestätigte positive News und pausiert vorläufig verlustreiche Scorebereiche. Wiederholungs-BUYs auf Bestand sind gesperrt; harte Risiko- und Fehlsetup-Exits bleiben aktiv.'}}
}