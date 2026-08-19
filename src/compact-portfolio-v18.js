import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v17.js';
import {reconcileLearningWithExecutedPositions,getLearningExecutionReconcileStatus} from './live-learning-execution-reconcile.js';
import {ResearchEntryQualityGuard} from './research-entry-quality-guard.js';
import {BalancedAdaptiveAiGuard,replayBalancePressure} from './balanced-adaptive-guard.js';
import {DipValueEntryAiGuard} from './dip-value-entry-guard.js';
import {FreshPositionChurnAiGuard} from './fresh-position-churn-guard.js';
import {augmentDayReplayStatus,prepareFinalDayReplay} from './day-replay-runtime.js';
import {RECOVERY_20260819} from './recovery-20260819.js';

// V18: EARLY-DIP-FIRST. Der breite PC-/Rebound-Radar darf kontrollierte Ruecksetzer
// frueh in einen separaten 1m-Foresight-Check heben. Harte Safety bleibt unveraendert.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    let ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__researchEntryQualityGuard){const wrapped=new ResearchEntryQualityGuard(ai);wrapped.__researchEntryQualityGuard=true;ai=wrapped;this.engine.env.AI=ai}
    if(ai?.run&&!ai.__balancedAdaptiveGuard){const wrapped=new BalancedAdaptiveAiGuard(ai,ctx?.storage);wrapped.__balancedAdaptiveGuard=true;ai=wrapped;this.engine.env.AI=ai}
    if(ai?.run&&!ai.__dipValueEntryGuard){const wrapped=new DipValueEntryAiGuard(ai);wrapped.__dipValueEntryGuard=true;ai=wrapped;this.engine.env.AI=ai}
    if(ai?.run&&!ai.__freshPositionChurnGuard){const wrapped=new FreshPositionChurnAiGuard(ai,{getState:()=>this._actualState(),storage:ctx?.storage});wrapped.__freshPositionChurnGuard=true;ai=wrapped;this.engine.env.AI=ai}
  }
  _actualState(){try{return this.bucketAdapter?.peekState?.()||{}}catch{return{}}}
  _actualPositions(){return this._actualState()?.positions||[]}
  async scan(){
    const before=reconcileLearningWithExecutedPositions(this.ctx?.storage,this._actualPositions());
    const result=await super.scan();
    const after=reconcileLearningWithExecutedPositions(this.ctx?.storage,this._actualPositions());
    if(result&&typeof result==='object')result.learningExecutionReconcile={before,after};
    return result;
  }
  async finalDayReplay(batchSize=8){
    const prepared=prepareFinalDayReplay(this.ctx?.storage);
    const result=await super.dailyReplay(batchSize);
    return{...result,finalReplay:true,finalPreparation:prepared};
  }
  async recover20260819(){
    const before=await super.status(),c=before?.config||{},h=before?.history||[],positions=before?.positions||[];
    const accidental=positions.length===0&&Math.abs(Number(c.cash||0)-10000)<0.02&&Number(c.scan_count||0)<=20&&h.some(x=>String(x?.action||'').toUpperCase()==='START'&&String(x?.ts||'').startsWith('2026-08-19T20:32:53'));
    if(!accidental)return{ok:false,skipped:true,reason:'Aktueller Zustand entspricht nicht dem versehentlichen Neustart.',before:{cash:c.cash,equity:before?.equity,positions:positions.length,scanCount:c.scan_count}};
    if(!this.bucketAdapter?.put||!this.engine?.store?.load)throw new Error('Autoritativer Compact-State-Recovery-Pfad fehlt.');
    const saved=await this.bucketAdapter.put('compact/current-v1',JSON.stringify(RECOVERY_20260819),{});
    if(!saved)throw new Error('Recovery-State konnte nicht in den Compact-State geschrieben werden.');
    await this.engine.store.load(true);
    const after=await this.engine.status();
    return{ok:true,result:{storage:'Durable Object compact/current-v1',etag:saved.etag},before:{cash:c.cash,equity:before?.equity,positions:positions.length,scanCount:c.scan_count},after:{cash:after?.config?.cash,equity:after?.equity,positions:after?.positions?.length,scanCount:after?.config?.scan_count}};
  }
  async status(){
    let s=await super.status();
    s.dayReplayLearning=augmentDayReplayStatus(this.ctx?.storage,s?.dayReplayLearning||{});
    reconcileLearningWithExecutedPositions(this.ctx?.storage,s?.positions||this._actualPositions());
    const balance=replayBalancePressure(this.ctx?.storage);
    s.learningExecutionReconcile=getLearningExecutionReconcileStatus(this.ctx?.storage);
    s.entryResearchPolicy={enabled:true,noUniversalBestClockTime:true,priority:['EARLY_DIP','DIP_STARTER','DIP_REBOUND','PULLBACK_RETEST','VALUE_STARTER','EXCEPTIONAL_BREAKOUT'],avoid:['PEAK_CHASE','OVEREXTENDED_MOMENTUM','UNBRAKED_FALLING_KNIFE'],earlyDipForesight:true,earlyDipRechecksPerScan:8,fallingDipStarterAllowed:true,fallingDipRequiresDeceleration:true,dipStarterMaxPct:20,deepDipStarterMaxPct:16,dipReboundMaxPct:30,foresightStarterMaxPct:12,foresightReboundMaxPct:18,exceptionalBreakoutMaxPct:5,cashMayWaitForValue:true,requireBounceAfterPullback:false,earlyBreakoutMin5mPct:.10,earlyBreakoutMin20mPct:.12,earlyBreakoutMinAccelerationPct:.02,earlyBreakoutMinVolumeRatioWhenKnown:1.05,earlyBreakoutInitialCapPct:8,finalHighEntryCapPct:5,newsVolumeConfirmationPreferred:true,openingPriceDiscoveryNeedsExtraConfirmation:true,orderPriceDiscipline:true,replayAdaptive:true,balancedSoftOverride:true,balancedSoftStarterMaxPct:16,hardRisksNeverOverridden:true,note:'Early-Dip-First: Breitscan- und Rebound-Werte bekommen schon vor dem offensichtlichen Rebound einen eigenen frischen 1m-Check. Bremst der Abverkauf sauber, darf klein gestartet werden. Erst nach voller Bestaetigung wird groesser; Peak-Chase bleibt klein/selten.'};
    s.balancedAdaptive={enabled:true,mode:'EARLY_DIP_FIRST_SOFT_RULES_HARD_SAFETY',replayPressure:balance,marginalExitNeedsConfirmation:true,hardReversalImmediate:true,exceptionalRotationMayBypassAge:true,softThemeDiversification:true,diversificationHardBlock:false,freshPositionChurnShield:true,liveStateInsteadOfPromptOnly:true,softSellAbsoluteGraceMinutes:15,marginalMomentumMinAgeMinutes:25,normalRotationMinAgeMinutes:30,exceptionalRotationMinAgeMinutes:15,hardExitBypassesChurnShield:true,zeroCashBuySuppression:true,stateThemeDiversification:true,dipFirst:true,earlyDipForesight:true,cashMayWaitForBetterEntry:true,objective:'mehr gute Ruecksetzer vor der offensichtlichen Umkehr sehen, dabei harte Safety und Anti-Chase beibehalten'};
    s.newsSourcePolicy={primary:['Issuer Investor Relations','SEC/EDGAR fuer US-Filings','Deutsche Boerse/EQS fuer DE/EU-Meldungen','Federal Reserve','ECB','BLS'],highQualityNews:['Reuters'],discovery:['Google News RSS keyless','oeffentliche TradingView-Mover-Seiten'],priceTechnical:['PC-Agent Keyless Multi-Source','Yahoo Chart/Spark keyless fallback'],apiKeysRequiredForPcMarketData:false,rule:'Primaerquelle/Emittent fuer harte Fakten bevorzugen. Intraday-Daten muessen frisch sein; Early-Dip/Foresight startet kleiner, solange News/Event noch nicht komplett im regulaeren Deep-Pass bestaetigt sind.'};
    s.fastInfoProfile={enabled:true,mode:'EARLY_DIP_PARALLEL_EVIDENCE',deepFinalists:8,deepChecksParallel:6,newsFinalists:5,newsRadarPerScan:3,newsRequestsFitSingleParallelWave:false,foresightDipRechecksPerScan:8,secondChancePoolTarget:24,secondChanceRecheckPerScan:6,pcWideSweepTarget:64,pcWideDipReserve:44,pcWideDiscoveryMaxAgeSeconds:1080,reboundRadarTarget:24,objective:'breitere Discovery plus eigener 1m-Early-Dip-Pfad: Chancen sollen vor dem offensichtlichen Rebound sichtbar werden, nicht erst nachdem sie hochgelaufen sind'};
    if(s.secondChanceWatch)s.secondChanceWatch={...s.secondChanceWatch,target:24,retentionMinutes:15,recheckPerScan:6,mode:'Bis zu 24 fast passende Kandidaten bleiben 15 Minuten im Heisspool; bis zu sechs erhalten pro Scan parallel einen frischen 1m-Zweitcheck.'};
    if(s.entryTimingLearning)s.entryTimingLearning={...s.entryTimingLearning,pendingOnlyForExecutedPositions:true,pendingExecutionTtlMinutes:8,proposalContaminationFixed:true};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,learningOnlyFromExecutedEntries:true,researchBackedEntryPolicy:true,earlyBreakoutQualityGuard:true,earlyBreakoutInitialCapPct:8,finalHighEntryCapPct:5,balancedSoftOverride:true,balancedSoftStarterMaxPct:16,marginalExitConfirmation:true,exceptionalRotationEscape:true,freshPositionChurnShield:true,normalRotationMinAgeMinutes:30,zeroCashBuySuppression:true,deepFinalists:8,deepNewsFinalists:5,foresightDipRechecksPerScan:8,strongCandidateRetentionMinutes:15,secondChancePoolTarget:24,secondChanceRecheckPerScan:6,pcWideSweepTarget:64,pcWideDipReserve:44,pcWideSweepMaxAgeSeconds:1080,reboundRadarTarget:24,keylessMultiSource:true,fastInfoProfile:true,dipFirst:true,earlyDipForesight:true,fallingDipStarterAllowed:true,dipStarterMaxPct:20,deepDipStarterMaxPct:16,dipReboundMaxPct:30,foresightStarterMaxPct:12,foresightReboundMaxPct:18,cashMayRemainForBetterEntry:true,alwaysInvested:false,capitalMotionTargetCashDeploymentPct:null};
    if(s.executionModel)s.executionModel={...s.executionModel,alwaysInvested:false,capitalInMotion:false,cashMayRemain:true,strategicCashReservePct:null,dipFirst:true,earlyDipForesight:true,fallingDipStarterAllowed:true,nearHighBuyCapPct:5,fastInfoProfile:true};
    if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,secondChanceWatch:true,secondChanceRetentionMinutes:15,secondChancePoolTarget:24,secondChanceRecheckPerScan:6,pcWideSweepTarget:64,pcWideDipReserve:44,pcWideSweepMaxAgeSeconds:1080,reboundRadarTarget:24,deepFinalists:8,deepNewsFinalists:5,foresightDipRechecksPerScan:8,keylessMultiSource:true,fastInfoProfile:true,dipFirst:true,earlyDipForesight:true,cashMayRemainForBetterEntry:true,dayReplayPreliminaryFromBerlin:'22:05',dayReplayFinalFromBerlin:'23:05',dayReplayCloudflareFallbackAlways:true};
    return s;
  }
}
