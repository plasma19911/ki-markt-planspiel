import {enforceHighScoreCapitalDeploymentV309,HIGH_SCORE_CAPITAL_DEPLOYMENT_V309} from './high-score-capital-deployment-v309.js';
import {enforceExpectancyCoreV310,EXPECTANCY_CORE_V310} from './expectancy-core-v310.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const UNIFIED_DECISION_CORE_V310={
  version:31.0,
  patch:'31.0-unified-decision-authority',
  architecture:'single-outer-decision-authority',
  persistentAudit:true,
  maxAuditRows:500,
  auditStorageKey:'decision-audit-v310'
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingInput(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}
function canonicalScore(v){let x=num(v);if(x>0&&x<=10)x*=10;return Math.max(0,Math.min(100,x))}
function actionSnapshot(a={}){return{symbol:key(a),action:String(a?.action||'HOLD').toUpperCase(),allocationPct:num(a?.allocation_pct),reason:String(a?.reason||'').slice(0,700)}}
function diffActions(before=[],after=[]){const b=new Map(arr(before).map(a=>[key(a),actionSnapshot(a)])),a=new Map(arr(after).map(x=>[key(x),actionSnapshot(x)])),symbols=new Set([...b.keys(),...a.keys()]),rows=[];for(const s of symbols){if(!s)continue;const x=b.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''},y=a.get(s)||{symbol:s,action:'NONE',allocationPct:0,reason:''};if(x.action!==y.action||Math.abs(x.allocationPct-y.allocationPct)>.01||x.reason!==y.reason)rows.push({symbol:s,before:x,after:y})}return rows}
function candidateDiagnostics(state={}){return arr(state?.candidates).map(c=>({symbol:key(c),score:canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score),rawScore:canonicalScore(c?.rawDecisionScore??c?.rawScore),m5:num(c?.momentum5Pct,c?.momentum5),m20:num(c?.momentum20Pct,c?.momentum20),brokerVerified:c?.brokerVerified===true,brokerMatchMode:c?.brokerMatchMode||null})).filter(x=>x.symbol).sort((a,b)=>b.score-a.score).slice(0,12)}
function positionDiagnostics(state={}){return arr(state?.positions).map(p=>({symbol:key(p),score:canonicalScore(p?.decisionScore??p?.score),rawScore:canonicalScore(p?.rawDecisionScore),entryScore:canonicalScore(p?.entryDecisionScore),entryPrice:num(p?.entry_price),lastPrice:num(p?.last_price),openedAt:p?.opened_at||null,direction:p?.chartDirectionMode||null})).filter(x=>x.symbol)}

export function enforceUnifiedDecisionCoreV310(plan,state={},input=null,brokerRows=[],now=Date.now()){
  const original={...plan,actions:arr(plan?.actions).map(a=>({...a}))};
  const buyPass=enforceHighScoreCapitalDeploymentV309({...plan,actions:arr(plan?.actions).map(a=>({...a}))},state,input,brokerRows);
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
    originalActions:original.actions.map(actionSnapshot),
    finalActions:arr(finalPlan.actions).map(actionSnapshot),
    changes,
    counters:{capital:buyPass.counters||{},expectancy:expectancyPass.counters||{}},
    ruleOrder:['hard safety from legacy core','high-score capital deployment','price hard-stop/min-hold/trailing/re-entry/sizing expectancy authority'],
    note:'V31.0 unified outer authority: no V30.8/V30.9/V31.0 wrapper stacking. One final transformation plus one audit record.'
  };
  finalPlan.summary=`${String(finalPlan.summary||'').slice(0,190)} · V31 Unified: ${changes.length} finale Entscheidungsänderung(en) geloggt.`;
  return{plan:finalPlan,audit,counters:{changes:changes.length,capital:buyPass.counters||{},expectancy:expectancyPass.counters||{}}};
}

export class UnifiedDecisionCoreV310{
  constructor(inner,{getState,getBrokerRows,writeAudit}={}){this.inner=inner;this.getState=getState;this.getBrokerRows=getBrokerRows;this.writeAudit=writeAudit;this.latest=null;this.auditWriteErrors=0}
  async run(model,input){
    const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);
    if(!isTradingInput(payload))return r;
    const p=parsePlan(r);if(!p)return r;
    const state=typeof this.getState==='function'?(this.getState()||{}):{};let brokerRows=[];if(typeof this.getBrokerRows==='function'){try{brokerRows=await this.getBrokerRows()}catch{}}
    const out=enforceUnifiedDecisionCoreV310(p,state,payload,brokerRows);this.latest=out;
    if(typeof this.writeAudit==='function'){try{await this.writeAudit(out.audit)}catch{this.auditWriteErrors++}}
    return encode(r,out.plan)
  }
  status(){return{enabled:true,...UNIFIED_DECISION_CORE_V310,capital:{...HIGH_SCORE_CAPITAL_DEPLOYMENT_V309,heldMasterEnrichment:true,noFixedAutoSinglePositionCap:true},expectancy:{hardStopPct:EXPECTANCY_CORE_V310.hardStopPct,trailArmPct:EXPECTANCY_CORE_V310.trailArmPct,minHoldMinutes:EXPECTANCY_CORE_V310.minHoldMinutes,reentryMinutes:EXPECTANCY_CORE_V310.reentryMinutes,minPositionEur:EXPECTANCY_CORE_V310.minPositionEur},latest:this.latest?.counters||null,auditWriteErrors:this.auditWriteErrors,rule:'Eine einzige äußere Entscheidungsautorität entscheidet nach dem Legacy-Kern final über High-Score-Käufe, wirtschaftliche Positionsgröße, Gewinner-Aufstockung aus dem Trade-Republic-Master, Preis-Stop, Mindesthaltezeit, Trailing und Re-Entry. Jede Änderung wird persistent auditiert.'}}
}