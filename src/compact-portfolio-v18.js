import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v17.js';
import {reconcileLearningWithExecutedPositions,getLearningExecutionReconcileStatus} from './live-learning-execution-reconcile.js';
import {ResearchEntryQualityGuard} from './research-entry-quality-guard.js';
import {BalancedAdaptiveAiGuard,replayBalancePressure} from './balanced-adaptive-guard.js';
import {FreshPositionChurnAiGuard} from './fresh-position-churn-guard.js';

// V18 closes a learning-only gap: the fast layer may propose BUY before Pullback,
// venue, cost and execution guards run. Only positions that really exist afterwards
// are allowed to keep a pending entry-timing sample. Research-quality remains active,
// but the outer BALANCED-ADAPTIVE layer prevents soft thresholds from becoming too rigid:
// hard risks stay hard; very strong candidates may use a small starter position when
// only a soft threshold is narrowly missed. The final live-state guard sees the real
// paper positions (including opened_at/theme/cash) before execution and blocks churn.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    let ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__researchEntryQualityGuard){const wrapped=new ResearchEntryQualityGuard(ai);wrapped.__researchEntryQualityGuard=true;ai=wrapped;this.engine.env.AI=ai}
    if(ai?.run&&!ai.__balancedAdaptiveGuard){const wrapped=new BalancedAdaptiveAiGuard(ai,ctx?.storage);wrapped.__balancedAdaptiveGuard=true;ai=wrapped;this.engine.env.AI=ai}
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
      freshPositionChurnShield:true,
      liveStateInsteadOfPromptOnly:true,
      softSellAbsoluteGraceMinutes:15,
      marginalMomentumMinAgeMinutes:25,
      normalRotationMinAgeMinutes:30,
      exceptionalRotationMinAgeMinutes:15,
      hardExitBypassesChurnShield:true,
      zeroCashBuySuppression:true,
      stateThemeDiversification:true,
      objective:'gute Chancen nicht wegen einer einzelnen weichen Grenze verpassen, aber Kauf-Verkauf-Churn und Gebuehren vermeiden ohne harte Exit-Safety zu lockern'
    };
    s.newsSourcePolicy={
      primary:['Issuer Investor Relations','SEC/EDGAR fuer US-Filings','Deutsche Boerse/EQS fuer DE/EU-Meldungen','Federal Reserve','ECB','BLS'],
      highQualityNews:['Reuters'],
      discovery:['Google News RSS keyless','oeffentliche TradingView-Mover-Seiten'],
      priceTechnical:['PC-Agent Keyless Multi-Source','Yahoo Chart/Spark keyless fallback'],
      apiKeysRequiredForPcMarketData:false,
      rule:'Primaerquelle/Emittent fuer harte Fakten bevorzugen. Oeffentliche Webseiten/RSS dienen der Discovery. Intraday-Daten muessen frisch sein; Wide-Sweep-Daten ueber 90 Sekunden werden verworfen.'
    };
    if(s.secondChanceWatch)s.secondChanceWatch={...s.secondChanceWatch,target:12,recheckPerScan:4,mode:'Bis zu 12 starke Deep-Kandidaten bleiben im Heisspool; bis zu vier koennen pro Scan einen frischen Zweitcheck erhalten. Kein Kandidat erzwingt einen Kauf.'};
    if(s.entryTimingLearning)s.entryTimingLearning={...s.entryTimingLearning,pendingOnlyForExecutedPositions:true,pendingExecutionTtlMinutes:8,proposalContaminationFixed:true};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,learningOnlyFromExecutedEntries:true,researchBackedEntryPolicy:true,earlyBreakoutQualityGuard:true,earlyBreakoutInitialCapPct:35,balancedSoftOverride:true,balancedSoftStarterMaxPct:28,marginalExitConfirmation:true,exceptionalRotationEscape:true,freshPositionChurnShield:true,normalRotationMinAgeMinutes:30,zeroCashBuySuppression:true,secondChanceRecheckPerScan:4,pcWideSweepTarget:24,pcWideSweepMaxAgeSeconds:90,keylessMultiSource:true};
    if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,secondChanceWatch:true,secondChanceRetentionMinutes:12,secondChanceRecheckPerScan:4,pcWideSweepTarget:24,pcWideSweepMaxAgeSeconds:90,keylessMultiSource:true};
    return s;
  }
}
