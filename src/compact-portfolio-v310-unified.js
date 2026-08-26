import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v307-manual-control.js';
import {UnifiedDecisionCoreV310,UNIFIED_DECISION_CORE_V310} from './unified-decision-core-v310.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||this.bucketAdapter?.peekState?.()||{}}catch{return{}}};
    const getBrokerRows=async()=>{try{return await this.__getBrokerRows?.()||[]}catch{return[]}};
    const writeAudit=async row=>{if(!this.ctx?.storage?.get||!this.ctx?.storage?.put)return;const k=UNIFIED_DECISION_CORE_V310.auditStorageKey;let rows=[];try{rows=await this.ctx.storage.get(k);if(!Array.isArray(rows))rows=[]}catch{rows=[]}rows.push(row);if(rows.length>UNIFIED_DECISION_CORE_V310.maxAuditRows)rows=rows.slice(-UNIFIED_DECISION_CORE_V310.maxAuditRows);await this.ctx.storage.put(k,rows)};
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__unifiedDecisionCoreV310){const wrapped=new UnifiedDecisionCoreV310(ai,{getState,getBrokerRows,writeAudit});wrapped.__unifiedDecisionCoreV310=true;this.unifiedDecisionCoreV310=wrapped;this.engine.env.AI=wrapped}
  }
  async decisionAudit(limit=30){const n=Math.max(1,Math.min(100,Number(limit)||30));try{const rows=await this.ctx?.storage?.get?.(UNIFIED_DECISION_CORE_V310.auditStorageKey);return Array.isArray(rows)?rows.slice(-n).reverse():[]}catch{return[]}}
  async status(){
    const s=await super.status(),policy=this.unifiedDecisionCoreV310?.status?.()||{enabled:true,...UNIFIED_DECISION_CORE_V310};
    s.runtimeVersion='V31.0';s.liveDecisionVersion='V31.0';s.unifiedDecisionCorePolicy={...policy,brokerMaster:{...(this.__brokerRowsMeta||{})}};s.expectancyCorePolicy={enabled:true,version:31.0,mode:'inside-unified-decision-authority',...policy.expectancy};
    s.architecture={version:'31.0.2-unified-broker-master',outerDecisionLayers:1,outerAuthority:'UnifiedDecisionCoreV310',removedOuterWrapperStack:['FinalSellAuthorityV308','HighScoreCapitalDeploymentV309','ExpectancyCoreV310-as-separate-wrapper'],legacyExecutionBase:'V30.7 manual controls/anti-churn and lower execution core',persistentDecisionAudit:true,auditStorageKey:UNIFIED_DECISION_CORE_V310.auditStorageKey,brokerMasterSource:this.__brokerRowsMeta?.source||'none'};
    s.decisionAuditRecent=await this.decisionAudit(20);
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:31.0,canonicalScale:'0-100',normalizeLegacyTenPointScores:true,scoreScaleLogged:true};
    s.executionModel={...(s.executionModel||{}),unifiedDecisionCoreV310:true,expectancyCoreV310:true,tradeRepublicAssetsMaster:true,hardPriceStopPct:-1.2,trailArmPct:2.4,runnerTrailArmPct:4.5,minHoldMinutes:12,reentryMinutes:90,minPositionEur:2200,outerDecisionLayers:1};
    return s;
  }
}