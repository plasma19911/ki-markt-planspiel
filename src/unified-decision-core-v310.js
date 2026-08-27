import {enforceHighScoreCapitalDeploymentV309,HIGH_SCORE_CAPITAL_DEPLOYMENT_V309} from './high-score-capital-deployment-v309.js';
import {enforceExpectancyCoreV310,EXPECTANCY_CORE_V310} from './expectancy-core-v310.js';
import {updateOutcomeLearningMemoryV312,recordOutcomeDecisionsV312,enforceOutcomeEarlyEntryV312,OUTCOME_LEARNING_V312} from './outcome-learning-core-v312.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const UNIFIED_DECISION_CORE_V310={
  version:31.3,
  patch:'31.3-capital-velocity+31.2-outcome-learning',
  architecture:'single-outer-decision-authority',
  persistentAudit:true,
  maxAuditRows:500,
  auditStorageKey:'decision-audit-v310'
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingInput(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}
function canonicalScore(v){let x=num(v);if(x>0&&x<=10)x*=10;return Math.max(0,Math.min(100,x))}
function actionSnapshot(a={}){return{symbol:key(a),action:String(a?.action||'HOLD').toUpperCase(),allocationPct:num(a?.allocation_pct),predictiveEntry:a?.predictiveEntryV311===true,outcomeEntry:a?.outcomeEntryV312===true,forecast20mScore:Number.isFinite(Number(a?.forecast20mScore))?num(a?.forecast20mScore):null,reason:String(a?.reason||'').slice(0,700)}}
function diffActions(before=[],after=[]){const b=new Map(arr(before).map(a=>[key(a),actionSnapshot(a)])),a=new Map(arr(after).map(x=>[key(x),actionSnapshot(x)])),symbols=new Set([...b.keys(),...a.keys()]),rows=[];for(const s of symbols){if(!s)continue;const x=b.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''},y=a.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''};if(x.action!==y.action||Math.abs(x.allocationPct-y.allocationPct)>.01||x.reason!==y.reason)rows.push({symbol:s,before:x,after:y})}return rows}
function candidateDiagnostics(state={}){return arr(state?.candidates).map(c=>({symbol:key(c),score:canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score),rawScore:canonicalScore(c?.rawDecisionScore??c?.raw_score??c?.rawScore),m5:num(c?.momentum5Pct,c?.momentum5),m20:num(c?.momentum20Pct,c?.momentum20),brokerVerified:c?.brokerVerified===true,brokerMatchMode:c?.brokerMatchMode||null})).filter(x=>x.symbol).sort((a,b)=>b.score-a.score).slice(0,16)}
function positionDiagnostics(state={}){return arr(state?.positions).map(p=>({symbol:key(p),score:canonicalScore(p?.decisionScore??p?.daytradeChanceScore??p?.score),rawScore:canonicalScore(p?.rawDecisionScore??p?.raw_score??p?.rawScore),entryScore:canonicalScore(p?.entryDecisionScore??p?.entry_score??p?.entryScore),entryPrice:num(p?.entry_price),lastPrice:num(p?.last_price),openedAt:p?.opened_at||null,direction:p?.chartDirectionMode??p?.direction??null})).filter(x=>x.symbol)}
function learningAudit(status={}){return{version:status?.version||31.2,mode:status?.mode||'WARMUP',matured:num(status?.matured),buySamples:num(status?.buySamples),buyHitRate:status?.buyHitRate??null,avgBuy20mReturnPct:status?.avgBuy20mReturnPct??null,avg20mReturnPct:status?.avg20mReturnPct??null,missedOpportunities:num(status?.missedOpportunities),badBuys:num(status?.badBuys),earlySells:num(status?.earlySells),correctSells:num(status?.correctSells),trackedSymbols:num(status?.trackedSymbols),currentCandidates:num(status?.currentCandidates),thresholdAdjustment:num(status?.thresholdAdjustment),allocationAdjustment:num(status?.allocationAdjustment),weights:status?.weights||null}}

export function enforceUnifiedDecisionCoreV310(plan,state={},input=null,brokerRows=[],now=Date.now(),outcomeLearning=null){
  const original={...plan,actions:arr(plan?.actions).map(a=>({...a}))};
  const predictivePass=enforceOutcomeEarlyEntryV312({...plan,actions:arr(plan?.actions).map(a=>({...a}))},state,outcomeLearning||{},brokerRows);
  const buyPass=enforceHighScoreCapitalDeploymentV309(predictivePass.plan,state,input,brokerRows);
  const expectancyPass=enforceExpectancyCoreV310(buyPass.plan,state,now);
  const finalPlan=expectancyPass.plan;
  const changes=diffActions(original.actions,finalPlan.actions);
  const learning=learningAudit(outcomeLearning?.status||{});
  const audit={
    ts:new Date(now).toISOString(),
    patch:UNIFIED_DECISION_CORE_V310.patch,
    scanCount:num(state?.config?.scan_count),
    cash:num(state?.config?.cash,state?.cash),
    positions:positionDiagnostics(state),
    topCandidates:candidateDiagnostics(state),
    topPredictions:arr(outcomeLearning?.status?.topForecasts).slice(0,12),
    outcomeLearning:learning,
    predictiveLearning:learning,
    originalActions:original.actions.map(actionSnapshot),
    finalActions:arr(finalPlan.actions).map(actionSnapshot),
    changes,
    counters:{outcome:predictivePass.counters||{},predictive:predictivePass.counters||{},capital:buyPass.counters||{},expectancy:expectancyPass.counters||{}},
    ruleOrder:['hard safety from legacy core','V31.2 continuous outcome learning + early-entry','high-score capital deployment','V31.3 hard-stop/trailing/paired-rotation/stagnation/profit-fade/re-entry/sizing authority'],
    note:'V31.3 bleibt eine einzige äußere Entscheidungsautorität. Qualifizierte Paarrotationen aus den unteren Score-/Momentum-Regeln werden nicht mehr pauschal auf HOLD gedreht. Flache, schwache Positionen werden zeitbasiert geprüft und bei bestätigter Stagnation freigegeben; V31.2 Outcome Learning sowie harte Sicherheitsregeln bleiben bindend.'
  };
  finalPlan.summary=`${String(finalPlan.summary||'').slice(0,165)} · V31.3 Unified+Capital-Velocity+Outcome: ${changes.length} finale Änderung(en), Lernmodus ${outcomeLearning?.status?.mode||'WARMUP'}.`;
  return{plan:finalPlan,audit,counters:{changes:changes.length,outcome:predictivePass.counters||{},predictive:predictivePass.counters||{},capital:buyPass.counters||{},expectancy:expectancyPass.counters||{}}};
}

export class UnifiedDecisionCoreV310{
  constructor(inner,{getState,getBrokerRows,writeAudit,readOutcomeMemory,writeOutcomeMemory}={}){this.inner=inner;this.getState=getState;this.getBrokerRows=getBrokerRows;this.writeAudit=writeAudit;this.readOutcomeMemory=readOutcomeMemory;this.writeOutcomeMemory=writeOutcomeMemory;this.latest=null;this.auditWriteErrors=0;this.predictiveWriteErrors=0;this.predictiveStatus={enabled:true,...OUTCOME_LEARNING_V312,mode:'WARMUP',matured:0,buySamples:0,buyHitRate:null,avg20mReturnPct:null,missedOpportunities:0,badBuys:0,earlySells:0,trackedSymbols:0,currentCandidates:0,weights:null,topForecasts:[]}}
  async run(model,input){
    const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);
    if(!isTradingInput(payload))return r;
    const p=parsePlan(r);if(!p)return r;
    const state=typeof this.getState==='function'?(this.getState()||{}):{};let brokerRows=[];if(typeof this.getBrokerRows==='function'){try{brokerRows=await this.getBrokerRows()}catch{}}
    const now=Date.now();let outcomeLearning={memory:null,predictions:{},status:this.predictiveStatus};
    try{const previous=typeof this.readOutcomeMemory==='function'?(await this.readOutcomeMemory()||{}):{};outcomeLearning=updateOutcomeLearningMemoryV312(previous,state,now)}catch{this.predictiveWriteErrors++}
    const out=enforceUnifiedDecisionCoreV310(p,state,payload,brokerRows,now,outcomeLearning);this.latest=out;
    try{
      const recorded=recordOutcomeDecisionsV312(outcomeLearning.memory||{},state,out.plan,outcomeLearning.predictions||{},now);this.predictiveStatus={...outcomeLearning.status,...recorded.status};out.audit.outcomeLearning=learningAudit(this.predictiveStatus);out.audit.predictiveLearning=out.audit.outcomeLearning;
      if(typeof this.writeOutcomeMemory==='function')await this.writeOutcomeMemory(recorded.memory);
    }catch{this.predictiveWriteErrors++;this.predictiveStatus=outcomeLearning.status||this.predictiveStatus}
    if(typeof this.writeAudit==='function'){try{await this.writeAudit(out.audit)}catch{this.auditWriteErrors++}}
    return encode(r,out.plan)
  }
  status(){return{enabled:true,...UNIFIED_DECISION_CORE_V310,outcomeLearning:{...this.predictiveStatus,storageKey:OUTCOME_LEARNING_V312.storageKey,writeErrors:this.predictiveWriteErrors},predictiveLearning:{...this.predictiveStatus,storageKey:OUTCOME_LEARNING_V312.storageKey,writeErrors:this.predictiveWriteErrors},capital:{...HIGH_SCORE_CAPITAL_DEPLOYMENT_V309,heldMasterEnrichment:true,noFixedAutoSinglePositionCap:true},expectancy:{hardStopPct:EXPECTANCY_CORE_V310.hardStopPct,trailArmPct:EXPECTANCY_CORE_V310.trailArmPct,minHoldMinutes:EXPECTANCY_CORE_V310.minHoldMinutes,reentryMinutes:EXPECTANCY_CORE_V310.reentryMinutes,reentryScoreImprovement:EXPECTANCY_CORE_V310.reentryScoreImprovement,stagnationReviewMinutes:EXPECTANCY_CORE_V310.stagnationReviewMinutes,maxStagnationMinutes:EXPECTANCY_CORE_V310.maxStagnationMinutes,stagnationBandPct:EXPECTANCY_CORE_V310.stagnationBandPct,stagnationScoreCeiling:EXPECTANCY_CORE_V310.stagnationScoreCeiling,profitFadeReviewMinutes:EXPECTANCY_CORE_V310.profitFadeReviewMinutes,profitFadeMinPct:EXPECTANCY_CORE_V310.profitFadeMinPct,minPositionEur:EXPECTANCY_CORE_V310.minPositionEur},latest:this.latest?.counters||null,auditWriteErrors:this.auditWriteErrors,rule:'Eine einzige äußere Entscheidungsautorität entscheidet final. V31.3 lässt qualifizierte Paarrotationen passieren, prüft flache schwache Positionen ab 75 Minuten, löst bestätigte Stagnation nach 180 Minuten auf und erlaubt einen begründeten Profit-Fade-Exit ab +0.8% nach 90 Minuten. V31.2 lernt weiter aus BUY/HOLD/SELL und verpassten Chancen; Preis-Stop, Trailing, Broker-Prüfung, wirtschaftliche Positionsgröße und Anti-Churn bleiben bindend.'}}
}
