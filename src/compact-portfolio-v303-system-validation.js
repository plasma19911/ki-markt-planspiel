import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v302-live-feedback.js';

// PAPER-TRADING ONLY. V30.3 does not change the V30.2 trading thresholds.
// It hardens the production system around them: Trade-Republic session holidays,
// stocks-only accounting validation and target-venue/free-tier smoke checks are
// now part of the normal merge gate.
export class MarketPortfolio extends BasePortfolio{
  async status(){
    const s=await super.status();
    s.runtimeVersion='V30.3';
    s.liveDecisionVersion='V30.3';
    s.systemValidationPolicy={
      enabled:true,
      version:30.3,
      strategyBaseVersion:30.2,
      tradeRepublicHolidayCalendar:true,
      stocksOnlyAccountingSmoke:true,
      targetVenueSmoke:true,
      freeTierSmoke:true,
      mergeBlockingCriticalSmokes:true,
      paperTradingOnly:true,
      rule:'V30.3 haertet Kalender und Produktionsvalidierung. Die V30.2-Daytrading-Regeln bleiben unveraendert darunter aktiv.'
    };
    if(s?.executionModel)s.executionModel={...s.executionModel,systemValidationVersion:30.3,tradeRepublicHolidayCalendar:true,mergeBlockingCriticalSmokes:true};
    return s;
  }
}
