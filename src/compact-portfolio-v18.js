import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v17.js';
import {reconcileLearningWithExecutedPositions,getLearningExecutionReconcileStatus} from './live-learning-execution-reconcile.js';

// V18 closes a learning-only gap: the fast layer may propose BUY before Pullback,
// venue, cost and execution guards run. Only positions that really exist afterwards
// are allowed to keep a pending entry-timing sample.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env}
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
    s.learningExecutionReconcile=getLearningExecutionReconcileStatus(this.ctx?.storage);
    s.entryResearchPolicy={
      enabled:true,
      noUniversalBestClockTime:true,
      priority:['PULLBACK_RETEST','EARLY_BREAKOUT','NORMAL_ENTRY'],
      avoid:['PEAK_CHASE','OVEREXTENDED_MOMENTUM','FALLING_KNIFE'],
      requireBounceAfterPullback:true,
      newsVolumeConfirmationPreferred:true,
      openingPriceDiscoveryNeedsExtraConfirmation:true,
      orderPriceDiscipline:true,
      replayAdaptive:true,
      note:'Kein Versuch, das exakte Tief zu erraten: bevorzugt wird ein Ruecksetzer mit Stabilisierung und erneut positivem Tape. Fruehe, volumenbestaetigte Breakouts bleiben erlaubt; spaete Uebertreibung wird blockiert. Tages-Replay kalibriert diese Regeln aus den eigenen Paper-Daten.'
    };
    s.newsSourcePolicy={
      primary:['Issuer Investor Relations','SEC/EDGAR fuer US-Filings','Deutsche Boerse/EQS fuer DE/EU-Meldungen','Federal Reserve','ECB','BLS'],
      highQualityNews:['Reuters'],
      discovery:['GDELT'],
      priceTechnical:['Yahoo Chart/Spark'],
      rule:'Primaerquelle/Emittent fuer harte Unternehmens- und Makrofakten bevorzugen; Aggregatoren nur zur Entdeckung, danach bestaetigen.'
    };
    if(s.entryTimingLearning)s.entryTimingLearning={...s.entryTimingLearning,pendingOnlyForExecutedPositions:true,pendingExecutionTtlMinutes:8,proposalContaminationFixed:true};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,learningOnlyFromExecutedEntries:true,researchBackedEntryPolicy:true};
    return s;
  }
}
