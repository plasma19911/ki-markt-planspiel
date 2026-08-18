import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v17.js';
import {reconcileLearningWithExecutedPositions,getLearningExecutionReconcileStatus} from './live-learning-execution-reconcile.js';
import {ResearchEntryQualityGuard} from './research-entry-quality-guard.js';
import {BalancedAdaptiveAiGuard,replayBalancePressure} from './balanced-adaptive-guard.js';

// V18 closes a learning-only gap: the fast layer may propose BUY before Pullback,
// venue, cost and execution guards run. Only positions that really exist afterwards
// are allowed to keep a pending entry-timing sample. Research-quality remains active,
// but the outer BALANCED-ADAPTIVE layer prevents soft thresholds from becoming too rigid:
// hard risks stay hard; very strong candidates may use a small starter position when
// only a soft threshold is narrowly missed. Marginal exits need one confirmation.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    let ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__researchEntryQualityGuard){const wrapped=new ResearchEntryQualityGuard(ai);wrapped.__researchEntryQualityGuard=true;ai=wrapped;this.engine.env.AI=ai}
    if(ai?.run&&!ai.__balancedAdaptiveGuard){const wrapped=new BalancedAdaptiveAiGuard(ai,ctx?.storage);wrapped.__balancedAdaptiveGuard=true;ai=wrapped;this.engine.env.AI=ai}
  }
  _actualPositions(){try{return this.bucketAdapter?.peekState?.()?.positions||[]}catch{return[]}}
  async scan(){
    // Clear proposals left by earlier scans before they can be mistaken for a later trade.
    const before=reconcileLearningWithExecutedPositions(this.ctx?.storage,this._actualPositions());
    const result=await super.scan();
    // This is the authoritative reconciliation point: downstream guards and paper
    // execution have already run, so only truly held symbols may remain pending.
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
      priority:['PULLBACK_RETEST','EARLY_BREAKOUT','NORMAL_ENTRY'],
      avoid:['PEAK_CHASE','OVEREXTENDED_MOMENTUM','FALLING_KNIFE'],
      requireBounceAfterPullback:true,
      earlyBreakoutMin5mPct:.10,
      earlyBreakoutMin20mPct:.12,
      earlyBreakoutMinAccelerationPct:.02,
      earlyBreakoutMinVolumeRatioWhenKnown:1.05,
      earlyBreakoutInitialCapPct:35,
      newsVolumeConfirmationPreferred:true,
      openingPriceDiscoveryNeedsExtraConfirmation:true,
      orderPriceDiscipline:true,
      replayAdaptive:true,
      balancedSoftOverride:true,
      balancedSoftStarterMaxPct:28,
      hardRisksNeverOverridden:true,
      note:'Pullback und sauber bestaetigte fruehe Breakouts bleiben bevorzugt. Harte Risiken wie Event HIGH, Reversal, starke Sell-Signale oder falscher Zielmarkt bleiben gesperrt. Eine einzelne weiche Mindestgrenze darf bei sehr starker Gesamtqualitaet knapp verfehlt werden; dann nur kleine Starterposition statt kompletter Ablehnung.'
    };
    s.balancedAdaptive={
      enabled:true,
      mode:'SOFT_RULES_HARD_SAFETY',
      replayPressure:balance,
      marginalExitNeedsConfirmation:true,
      hardReversalImmediate:true,
      exceptionalRotationMayBypassAge:true,
      softThemeDiversification:true,
      diversificationHardBlock:false,
      objective:'gute Chancen nicht wegen einer einzelnen weichen Grenze verpassen, ohne harte Risiken zu lockern'
    };
    s.newsSourcePolicy={
      primary:['Issuer Investor Relations','SEC/EDGAR fuer US-Filings','Deutsche Boerse/EQS fuer DE/EU-Meldungen','Federal Reserve','ECB','BLS'],
      highQualityNews:['Reuters'],
      discovery:['GDELT'],
      priceTechnical:['PC-Agent Wide Sweep','Yahoo Chart/Spark'],
      rule:'Primaerquelle/Emittent fuer harte Unternehmens- und Makrofakten bevorzugen; Aggregatoren nur zur Entdeckung, danach bestaetigen.'
    };
    if(s.entryTimingLearning)s.entryTimingLearning={...s.entryTimingLearning,pendingOnlyForExecutedPositions:true,pendingExecutionTtlMinutes:8,proposalContaminationFixed:true};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,learningOnlyFromExecutedEntries:true,researchBackedEntryPolicy:true,earlyBreakoutQualityGuard:true,earlyBreakoutInitialCapPct:35,balancedSoftOverride:true,balancedSoftStarterMaxPct:28,marginalExitConfirmation:true,exceptionalRotationEscape:true};
    return s;
  }
}
