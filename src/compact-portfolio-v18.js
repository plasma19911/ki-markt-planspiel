import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v17.js';
import {reconcileLearningWithExecutedPositions,getLearningExecutionReconcileStatus} from './live-learning-execution-reconcile.js';
import {ResearchEntryQualityGuard} from './research-entry-quality-guard.js';
import {BalancedAdaptiveAiGuard,replayBalancePressure} from './balanced-adaptive-guard.js';
import {DipValueEntryAiGuard} from './dip-value-entry-guard.js';
import {FreshPositionChurnAiGuard} from './fresh-position-churn-guard.js';

// V18 closes a learning-only gap: the fast layer may propose BUY before Pullback,
// venue, cost and execution guards run. Only positions that really exist afterwards
// are allowed to keep a pending entry-timing sample. Research-quality remains active,
// but the outer BALANCED-ADAPTIVE layer prevents soft thresholds from becoming too rigid:
// hard risks stay hard; very strong candidates may use a small starter position when
// only a soft threshold is narrowly missed. DIP-FIRST is the final entry-price policy:
// falling but decelerating quality stocks may get a small starter, rebound gets more,
// expensive near-high entries are blocked and cash may wait for a better price.
// The final live-state guard still sees the real paper positions before execution.
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
  async status(){
    let s=await super.status();
    reconcileLearningWithExecutedPositions(this.ctx?.storage,s?.positions||this._actualPositions());
    const balance=replayBalancePressure(this.ctx?.storage);
    s.learningExecutionReconcile=getLearningExecutionReconcileStatus(this.ctx?.storage);
    s.entryResearchPolicy={
      enabled:true,
      noUniversalBestClockTime:true,
      priority:['DIP_STARTER','DIP_REBOUND','PULLBACK_RETEST','VALUE_STARTER','EXCEPTIONAL_BREAKOUT'],
      avoid:['PEAK_CHASE','OVEREXTENDED_MOMENTUM','UNBRAKED_FALLING_KNIFE'],
      fallingDipStarterAllowed:true,
      fallingDipRequiresDeceleration:true,
      dipStarterMaxPct:18,
      deepDipStarterMaxPct:14,
      dipReboundMaxPct:30,
      exceptionalBreakoutMaxPct:5,
      cashMayWaitForValue:true,
      requireBounceAfterPullback:false,
      earlyBreakoutMin5mPct:.10,
      earlyBreakoutMin20mPct:.12,
      earlyBreakoutMinAccelerationPct:.02,
      earlyBreakoutMinVolumeRatioWhenKnown:1.05,
      earlyBreakoutInitialCapPct:8,
      finalHighEntryCapPct:5,
      newsVolumeConfirmationPreferred:true,
      openingPriceDiscoveryNeedsExtraConfirmation:true,
      orderPriceDiscipline:true,
      replayAdaptive:true,
      balancedSoftOverride:true,
      balancedSoftStarterMaxPct:16,
      hardRisksNeverOverridden:true,
      note:'Dip-First: Gute Aktien duerfen schon waehrend eines kontrollierten Ruecksetzers klein gekauft werden, wenn der Abwaertsdruck nachlaesst. Beim bestaetigten Rebound darf die Position groesser werden. Near-High/Breakout-Kaeufe sind selten und klein. Fehlt ein guter Preis, bleibt Cash frei.'
    };
    s.balancedAdaptive={
      enabled:true,
      mode:'DIP_FIRST_SOFT_RULES_HARD_SAFETY',
      replayPressure:balance,
      marginalExitNeedsConfirmation:true,
      hardReversalImmediate:true,
      exceptionalRotationMayBypassAge:true,
      softThemeDiversification:true,
      diversificationHardBlock:false,
      freshPositionChurnShield:true,
      liveStateInsteadOfPromptOnly:true,
      softSellAbsoluteGraceMinutes:15,
      marginalMomentumMinAgeMinutes:25,
      normalRotationMinAgeMinutes:30,
      exceptionalRotationMinAgeMinutes:15,
      hardExitBypassesChurnShield:true,
      zeroCashBuySuppression:true,
      stateThemeDiversification:true,
      dipFirst:true,
      cashMayWaitForBetterEntry:true,
      objective:'guenstigere Einstiege in kontrollierte Ruecksetzer, weniger Peak-Chase und weniger Kauf-Verkauf-Churn; harte Exit-Safety bleibt bestehen'
    };
    s.newsSourcePolicy={
      primary:['Issuer Investor Relations','SEC/EDGAR fuer US-Filings','Deutsche Boerse/EQS fuer DE/EU-Meldungen','Federal Reserve','ECB','BLS'],
      highQualityNews:['Reuters'],
      discovery:['Google News RSS keyless','oeffentliche TradingView-Mover-Seiten'],
      priceTechnical:['PC-Agent Keyless Multi-Source','Yahoo Chart/Spark keyless fallback'],
      apiKeysRequiredForPcMarketData:false,
      rule:'Primaerquelle/Emittent fuer harte Fakten bevorzugen. Oeffentliche Webseiten/RSS dienen der Discovery. Intraday-Daten muessen frisch sein; Wide-Sweep-Daten ueber 90 Sekunden werden verworfen.'
    };
    s.fastInfoProfile={
      enabled:true,
      mode:'PARALLEL_EVIDENCE_FIRST',
      deepFinalists:6,
      deepChecksParallel:6,
      newsFinalists:4,
      newsRadarPerScan:2,
      newsRequestsFitSingleParallelWave:true,
      secondChancePoolTarget:16,
      secondChanceRecheckPerScan:4,
      pcWideSweepTarget:32,
      pcWideDipReserve:20,
      reboundRadarTarget:16,
      objective:'mehr frische Kurs-, Volumen-, Dip- und News-Evidenz je Scan bei moeglichst wenigen zusaetzlichen seriellen Wartezeiten'
    };
    if(s.secondChanceWatch)s.secondChanceWatch={...s.secondChanceWatch,target:16,recheckPerScan:4,mode:'Bis zu 16 starke Deep-Kandidaten bleiben im Heisspool; bis zu vier koennen pro Scan parallel einen frischen 1m-Zweitcheck erhalten. Kein Kandidat erzwingt einen Kauf.'};
    if(s.entryTimingLearning)s.entryTimingLearning={...s.entryTimingLearning,pendingOnlyForExecutedPositions:true,pendingExecutionTtlMinutes:8,proposalContaminationFixed:true};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,learningOnlyFromExecutedEntries:true,researchBackedEntryPolicy:true,earlyBreakoutQualityGuard:true,earlyBreakoutInitialCapPct:8,finalHighEntryCapPct:5,balancedSoftOverride:true,balancedSoftStarterMaxPct:16,marginalExitConfirmation:true,exceptionalRotationEscape:true,freshPositionChurnShield:true,normalRotationMinAgeMinutes:30,zeroCashBuySuppression:true,deepFinalists:6,deepNewsFinalists:4,secondChancePoolTarget:16,secondChanceRecheckPerScan:4,pcWideSweepTarget:32,pcWideDipReserve:20,pcWideSweepMaxAgeSeconds:90,reboundRadarTarget:16,keylessMultiSource:true,fastInfoProfile:true,dipFirst:true,fallingDipStarterAllowed:true,dipStarterMaxPct:18,deepDipStarterMaxPct:14,dipReboundMaxPct:30,cashMayRemainForBetterEntry:true,alwaysInvested:false,capitalMotionTargetCashDeploymentPct:null};
    if(s.executionModel)s.executionModel={...s.executionModel,alwaysInvested:false,capitalInMotion:false,cashMayRemain:true,strategicCashReservePct:null,dipFirst:true,fallingDipStarterAllowed:true,nearHighBuyCapPct:5,fastInfoProfile:true};
    if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,secondChanceWatch:true,secondChanceRetentionMinutes:12,secondChancePoolTarget:16,secondChanceRecheckPerScan:4,pcWideSweepTarget:32,pcWideDipReserve:20,pcWideSweepMaxAgeSeconds:90,reboundRadarTarget:16,deepFinalists:6,deepNewsFinalists:4,keylessMultiSource:true,fastInfoProfile:true,dipFirst:true,cashMayRemainForBetterEntry:true};
    return s;
  }
}