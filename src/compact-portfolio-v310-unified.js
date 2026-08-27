import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v307-manual-control.js';
import {UnifiedDecisionCoreV310,UNIFIED_DECISION_CORE_V310} from './unified-decision-core-v310.js';
import {OUTCOME_LEARNING_V312} from './outcome-learning-core-v312.js';
import {PREDICTIVE_LEARNING_V311} from './predictive-learning-core-v311.js';

const arr=v=>Array.isArray(v)?v:[];
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{const raw=this.bucketAdapter?.peekState?.()||{},actual=this._actualState?.()||{};return{...actual,...raw,config:{...(actual?.config||{}),...(raw?.config||{})},candidates:arr(raw?.candidates).length?raw.candidates:arr(actual?.candidates),positions:arr(raw?.positions).length?raw.positions:arr(actual?.positions),history:arr(raw?.history).length?raw.history:arr(actual?.history)}}catch{return{}}};
    const getBrokerRows=async()=>{try{return await this.__getBrokerRows?.()||[]}catch{return[]}};
    const writeAudit=async row=>{if(!this.ctx?.storage?.get||!this.ctx?.storage?.put)return;const k=UNIFIED_DECISION_CORE_V310.auditStorageKey;let rows=[];try{rows=await this.ctx.storage.get(k);if(!Array.isArray(rows))rows=[]}catch{rows=[]}rows.push(row);if(rows.length>UNIFIED_DECISION_CORE_V310.maxAuditRows)rows=rows.slice(-UNIFIED_DECISION_CORE_V310.maxAuditRows);await this.ctx.storage.put(k,rows)};
    const readOutcomeMemory=async()=>{if(!this.ctx?.storage?.get)return{};try{const current=await this.ctx.storage.get(OUTCOME_LEARNING_V312.storageKey);if(current&&typeof current==='object')return current;const old=await this.ctx.storage.get(PREDICTIVE_LEARNING_V311.storageKey);if(!old||typeof old!=='object')return{};return{version:31.2,symbols:old.symbols||{},recent20:[],weights:null,groupStats:{regime:{},theme:{},source:{}},stats:{evaluated20:Number(old?.stats?.matured)||0,weightUpdates:0,missedOpportunities:0,badBuys:0,earlySells:0,correctSells:0},migratedFrom:'predictive-learning-v311'}}catch{return{}}};
    const writeOutcomeMemory=async memory=>{if(this.ctx?.storage?.put)await this.ctx.storage.put(OUTCOME_LEARNING_V312.storageKey,memory)};
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__unifiedDecisionCoreV310){const wrapped=new UnifiedDecisionCoreV310(ai,{getState,getBrokerRows,writeAudit,readOutcomeMemory,writeOutcomeMemory});wrapped.__unifiedDecisionCoreV310=true;this.unifiedDecisionCoreV310=wrapped;this.engine.env.AI=wrapped}
  }
  async decisionAudit(limit=30){const n=Math.max(1,Math.min(100,Number(limit)||30));try{const rows=await this.ctx?.storage?.get?.(UNIFIED_DECISION_CORE_V310.auditStorageKey);return Array.isArray(rows)?rows.slice(-n).reverse():[]}catch{return[]}}
  async status(){
    const s=await super.status(),policy=this.unifiedDecisionCoreV310?.status?.()||{enabled:true,...UNIFIED_DECISION_CORE_V310},learning=policy.outcomeLearning||policy.predictiveLearning||{enabled:true,...OUTCOME_LEARNING_V312};
    s.runtimeVersion='V31.2';s.liveDecisionVersion='V31.2';s.predictiveLearningVersion='V31.2';s.outcomeLearningVersion='V31.2';s.unifiedDecisionCorePolicy={...policy,brokerMaster:{...(this.__brokerRowsMeta||{})}};s.predictiveLearningPolicy={enabled:true,...learning,insideUnifiedAuthority:true};s.outcomeLearningPolicy={enabled:true,...learning,insideUnifiedAuthority:true};s.expectancyCorePolicy={enabled:true,version:31.0,mode:'inside-unified-decision-authority',...policy.expectancy};
    s.architecture={version:'31.2-unified-continuous-outcome-learning',outerDecisionLayers:1,outerAuthority:'UnifiedDecisionCoreV310',internalDecisionPasses:['V31.2 continuous outcome learning/early entry','V30.9 high-score capital deployment','V31.0 expectancy exits/sizing'],removedOuterWrapperStack:['FinalSellAuthorityV308','HighScoreCapitalDeploymentV309','ExpectancyCoreV310-as-separate-wrapper'],legacyExecutionBase:'V30.7 manual controls/anti-churn and lower execution core',persistentDecisionAudit:true,auditStorageKey:UNIFIED_DECISION_CORE_V310.auditStorageKey,persistentPredictiveLearning:true,persistentOutcomeLearning:true,predictiveLearningStorageKey:OUTCOME_LEARNING_V312.storageKey,outcomeLearningStorageKey:OUTCOME_LEARNING_V312.storageKey,stateMergeUsesRawCandidates:true,brokerMasterSource:this.__brokerRowsMeta?.source||'none'};
    s.decisionAuditRecent=await this.decisionAudit(20);
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:31.2,canonicalScale:'0-100',normalizeLegacyTenPointScores:true,scoreScaleLogged:true,predictiveForecastScale:'0-100',continuousOutcomeFeedback:true};
    s.executionModel={...(s.executionModel||{}),unifiedDecisionCoreV310:true,predictiveLearningV311:true,outcomeLearningV312:true,predictiveHorizonMinutes:20,outcomeHorizonsMinutes:[5,20,60,240],predictiveEarlyEntry:true,predictiveSelfCalibration:true,continuousCandidateTracking:true,learnsMissedOpportunities:true,learnsBadBuys:true,learnsEarlySells:true,learnsSignalWeights:true,recentOutcomesWeightedHigher:true,expectancyCoreV310:true,tradeRepublicAssetsMaster:true,hardPriceStopPct:-1.2,trailArmPct:2.4,runnerTrailArmPct:4.5,minHoldMinutes:12,reentryMinutes:90,minPositionEur:2200,outerDecisionLayers:1};
    return s;
  }
}
