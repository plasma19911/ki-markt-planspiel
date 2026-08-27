import {enforceHighScoreCapitalDeploymentV309,HIGH_SCORE_CAPITAL_DEPLOYMENT_V309} from './high-score-capital-deployment-v309.js';
import {enforceExpectancyCoreV310,EXPECTANCY_CORE_V310} from './expectancy-core-v310.js';
import {updatePredictiveLearningMemory,enforcePredictiveEarlyEntryV311,PREDICTIVE_LEARNING_V311} from './predictive-learning-core-v311.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const UNIFIED_DECISION_CORE_V310={
  version:31.0,
  patch:'31.0-unified-decision-authority+31.1-predictor',
  architecture:'single-outer-decision-authority',
  persistentAudit:true,
  maxAuditRows:500,
  auditStorageKey:'decision-audit-v310'
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingInput(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}
function canonicalScore(v){let x=num(v);if(x>0&&x<=10)x*=10;return Math.max(0,Math.min(100,x))}
function actionSnapshot(a={}){return{symbol:key(a),action:String(a?.action||'HOLD').toUpperCase(),allocationPct:num(a?.allocation_pct),predictiveEntry:a?.predictiveEntryV311===true,forecast20mScore:Number.isFinite(Number(a?.forecast20mScore))?num(a?.forecast20mScore):null,reason:String(a?.reason||'').slice(0,700)}}
function diffActions(before=[],after=[]){const b=new Map(arr(before).map(a=>[key(a),actionSnapshot(a)])),a=new Map(arr(after).map(x=>[key(x),actionSnapshot(x)])),symbols=new Set([...b.keys(),...a.keys()]),rows=[];for(const s of symbols){if(!s)continue;const x=b.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''},y=a.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''};if(x.action!==y.action||Math.abs(x.allocationPct-y.allocationPct)>.01||x.reason!==y.reason)rows.push({symbol:s,before:x,after:y})}return rows}
function candidateDiagnostics(state={}){return arr(state?.candidates).map(c=>({symbol:key(c),score:canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score),rawScore:canonicalScore(c?.rawDecisionScore??c?.raw_score??c?.rawScore),m5:num(c?.momentum5Pct,c?.momentum5),m20:num(c?.momentum20Pct,c?.momentum20),brokerVerified:c?.brokerVerified===true,brokerMatchMode:c?.brokerMatchMode||null})).filter(x=>x.symbol).sort((a,b)=>b.score-a.score).slice(0,12)}
function positionDiagnostics(state={}){return arr(state?.positions).map(p=>({symbol:key(p),score:canonicalScore(p?.decisionScore??p?.daytradeChanceScore??p?.score),rawScore:canonicalScore(p?.rawDecisionScore??p?.raw_score??p?.rawScore),entryScore:canonicalScore(p?.entryDecisionScore??p?.entry_score??p?.entryScore),entryPrice:num(p?.entry_price),lastPrice:num(p?.last_price),openedAt:p?.opened_at||null,direction:p?.chartDirectionMode??p?.direction??null})).filter(x=>x.symbol)}

export function enforceUnifiedDecisionCoreV310(plan,state={},input=null,brokerRows=[],now=Date.now(),predictiveLearning=null){
  const original={...plan,actions:arr(plan?.actions).map(a=>({...a}))};
  const predictivePass=enforcePredictiveEarlyEntryV311({...plan,actions:arr(plan?.actions).map(a=>({...a}))},state,predictiveLearning||{},brokerRows);
  const buyPass=enforceHighScoreCapitalDeploymentV309(predictivePass.plan,state,input,brokerRows);
  const expectancyPass=enforceExpectancyCoreV310(buyPass.plan,state,now);
  const finalPlan=expectancyPass.plan;
  const changes=diffActions(original.actions,finalPlan.actions);
  const audit={
    ts:new Date(now).toISOString(),
    patch:UNIFIED_DECISION_CORE_V310.patch,
    scanCount:num(state?.config?.scan_count),
    cash:num(state?.config?.cash,state?.cash),
    positions:positionDiagnostics(state),
    topCandidates:candidateDiagnostics(state),
    topPredictions:arr(predictiveLearning?.status?.topForecasts).slice(0,10),
    predictiveLearning:{mode:predictiveLearning?.status?.mode||'WARMUP',matured:num(predictiveLearning?.status?.matured),hitRate:predictiveLearning?.status?.hitRate??null,avg20mReturnPct:predictiveLearning?.status?.avg20mReturnPct??null,thresholdAdjustment:num(predictiveLearning?.status?.thresholdAdjustment)},
    originalActions:original.actions.map(actionSnapshot),
    finalActions:arr(finalPlan.actions).map(actionSnapshot),
    changes,
    counters:{predictive:predictivePass.counters||{},capital:buyPass.counters||{},expectancy:expectancyPass.counters||{}},
    ruleOrder:['hard safety from legacy core','V31.1 predictive early-entry learning','high-score capital deployment','price hard-stop/min-hold/trailing/re-entry/sizing expectancy authority'],
    note:'V31 remains one unified outer authority. V31.1 prediction is an internal pass: it learns from later 20m outcomes and may start one position before the static 68 score threshold when score velocity, momentum, acceleration and news agree. Hard safety remains binding.'
  };
  finalPlan.summary=`${String(finalPlan.summary||'').slice(0,175)} · V31 Unified+Predictor: ${changes.length} finale Änderung(en), Lernmodus ${predictiveLearning?.status?.mode||'WARMUP'}.`;
  return{plan:finalPlan,audit,counters:{changes:changes.length,predictive:predictivePass.counters||{},capital:buyPass.counters||{},expectancy:expectancyPass.counters||{}}};
}

export class UnifiedDecisionCoreV310{
  constructor(inner,{getState,getBrokerRows,writeAudit,readPredictiveMemory,writePredictiveMemory}={}){this.inner=inner;this.getState=getState;this.getBrokerRows=getBrokerRows;this.writeAudit=writeAudit;this.readPredictiveMemory=readPredictiveMemory;this.writePredictiveMemory=writePredictiveMemory;this.latest=null;this.auditWriteErrors=0;this.predictiveWriteErrors=0;this.predictiveStatus={enabled:true,...PREDICTIVE_LEARNING_V311,mode:'WARMUP',matured:0,hitRate:null,avg20mReturnPct:null,trackedSymbols:0,topForecasts:[]}}
  async run(model,input){
    const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);
    if(!isTradingInput(payload))return r;
    const p=parsePlan(r);if(!p)return r;
    const state=typeof this.getState==='function'?(this.getState()||{}):{};let brokerRows=[];if(typeof this.getBrokerRows==='function'){try{brokerRows=await this.getBrokerRows()}catch{}}
    const now=Date.now();let predictiveLearning={memory:null,predictions:{},status:this.predictiveStatus};
    try{
      const previous=typeof this.readPredictiveMemory==='function'?(await this.readPredictiveMemory()||{}):{};
      predictiveLearning=updatePredictiveLearningMemory(previous,state?.candidates||[],now);this.predictiveStatus=predictiveLearning.status;
      if(typeof this.writePredictiveMemory==='function')await this.writePredictiveMemory(predictiveLearning.memory);
    }catch{this.predictiveWriteErrors++}
    const out=enforceUnifiedDecisionCoreV310(p,state,payload,brokerRows,now,predictiveLearning);this.latest=out;
    if(typeof this.writeAudit==='function'){try{await this.writeAudit(out.audit)}catch{this.auditWriteErrors++}}
    return encode(r,out.plan)
  }
  status(){return{enabled:true,...UNIFIED_DECISION_CORE_V310,predictiveLearning:{...this.predictiveStatus,storageKey:PREDICTIVE_LEARNING_V311.storageKey,writeErrors:this.predictiveWriteErrors},capital:{...HIGH_SCORE_CAPITAL_DEPLOYMENT_V309,heldMasterEnrichment:true,noFixedAutoSinglePositionCap:true},expectancy:{hardStopPct:EXPECTANCY_CORE_V310.hardStopPct,trailArmPct:EXPECTANCY_CORE_V310.trailArmPct,minHoldMinutes:EXPECTANCY_CORE_V310.minHoldMinutes,reentryMinutes:EXPECTANCY_CORE_V310.reentryMinutes,minPositionEur:EXPECTANCY_CORE_V310.minPositionEur},latest:this.latest?.counters||null,auditWriteErrors:this.auditWriteErrors,rule:'Eine einzige äußere Entscheidungsautorität entscheidet final. V31.1 lernt innerhalb dieses Kerns aus Kandidatenverläufen und späteren ~20-Minuten-Kursen, erstellt Frühprognosen und darf bei bestätigter Beschleunigung vor der statischen 68er Schwelle einen begrenzten Starter setzen. High-Score-Käufe, wirtschaftliche Positionsgröße, Preis-Stop, Mindesthaltezeit, Trailing und Re-Entry bleiben anschließend bindend.'}}
}
