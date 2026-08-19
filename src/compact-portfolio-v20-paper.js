import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v19.js';
import {ContinuationOpportunityAiGuard} from './continuation-opportunity-guard.js';
import {LossChurnFinalAiGuard} from './loss-churn-final-guard.js';

// PAPER-TRADING ONLY. Diese Schicht fuehrt keine echten Broker-Orders aus.
// Sie erweitert V19 um Opportunity/Continuation und einen letzten Anti-Churn-Schutz.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    let ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__continuationOpportunityGuard){
      const wrapped=new ContinuationOpportunityAiGuard(ai);
      wrapped.__continuationOpportunityGuard=true;
      ai=wrapped;this.engine.env.AI=ai;
    }
    ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__lossChurnFinalGuard){
      const wrapped=new LossChurnFinalAiGuard(ai);
      wrapped.__lossChurnFinalGuard=true;
      this.engine.env.AI=wrapped;
    }
  }
  upsertHealth(h){
    // Health ist eine Momentaufnahme. Entfernte/ersetzte Quellen duerfen nicht als
    // alte rote Karten fuer immer in SQLite stehen bleiben.
    const current={...(h||{})};
    if(current['finanzen.net News (Fallback)']){
      current['tagesschau Wirtschaft (Fallback)']=current['finanzen.net News (Fallback)'];
      delete current['finanzen.net News (Fallback)'];
    }
    try{this.ctx?.storage?.sql?.exec('DELETE FROM source_health')}catch{}
    return super.upsertHealth(current);
  }
  async status(){
    const s=await super.status();
    s.paperOpportunityPolicy={
      enabled:true,
      version:20.3,
      paperTradingOnly:true,
      mode:'RANK_STAGE_CONFIRM_ANTI_CHURN_CURRENT_HEALTH_RESILIENT_SOURCES',
      dipDoesNotVetoAllOtherBuys:true,
      continuationBreakoutStarter:true,
      newsGlobalVeto:false,
      missingLongChartIsSoftWhen1mBuyerFlowConfirmed:true,
      lossOpportunityRotationBlocked:true,
      mixedOneMinuteLossSellBlocked:true,
      hardRiskCanExitImmediately:true,
      fixedMinimumHoldMinutes:null,
      sourceHealthCurrentScanOnly:true,
      resilientSourceFallbacks:true,
      slowIntelligenceCached:true,
      rule:'Gute Dips und bestaetigte Continuation-Chancen duerfen gestaffelt gekauft werden. Eine Position im Minus wird nicht mehr nur wegen einer attraktiveren anderen Aktie rotiert. Widerspruechliche 1m-SELL-Strukturen werden im Minus gehalten; echte Hard-Risk/Reversal/STRONG-SELL-Signale duerfen weiterhin sofort aussteigen. Langsamere News/Event/MTF-Daten werden gecacht, Health zeigt nur aktuelle Quellen. Keine Minutenregel.'
    };
    return s;
  }
}
