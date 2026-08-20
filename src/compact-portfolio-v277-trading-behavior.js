import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v276-daily-agm.js';
import {TradingBehaviorGuardV277} from './trading-behavior-v277.js';

// PAPER-TRADING ONLY. V27.7 adds an outer deterministic behavior layer.
// It may only HOLD/reduce an already planned action; it does not bypass the
// existing FX, fee, loss-sell, portfolio-risk, market-regime or AGM guards.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__tradingBehaviorV277){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new TradingBehaviorGuardV277(ai,{getState,storage:this.ctx?.storage});
   wrapped.__tradingBehaviorV277=true;
   this.tradingBehavior=wrapped;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status(),behavior=this.tradingBehavior?.status?.()||{enabled:true,version:27.7};
  if(s?.finalDecisionPolicy){
   s.finalDecisionPolicy={...s.finalDecisionPolicy,version:27.7,
    mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER_PLUS_DETERMINISTIC_TRADE_INVARIANTS_PLUS_AGM_PREVIEW_PLUS_TRADING_BEHAVIOR',
    entryConfirmationHysteresis:true,normalEntryNeedsTwoScans:true,exceptionalSetupMayEnterImmediately:true,
    lateImpulseRecheck:true,fomoImpulseBuyBlocked:true,portfolioSaturationSelectivity:true,meaningfulProfitExit:true,tinyProfitChurnBlocked:true,
    convictionSizing:true,behaviorVersion:27.7,
    regressionTests:`${String(s.finalDecisionPolicy.regressionTests||'').replace(/\s*$/,'')} + V27.7 behavior invariants`,
    rule:'V27.7 verbessert das Handelsverhalten oberhalb aller bestehenden Sicherheitsstufen: normale Einstiege brauchen zwei zeitlich getrennte Bestätigungen, extreme 5m-Impulse werden nicht gejagt, bei hoher Depotauslastung bleibt Restcash für starke Setups reserviert und reine PROFIT-EXITs werden nicht für Cent-Nettoerträge gedreht. Harte Risiken und echte Strukturbrüche bleiben handlungsfähig.'};
  }
  s.tradingBehaviorPolicy={...behavior,enabled:true,version:27.7,paperTradingOnly:true,
   normalEntryConfirmationScans:2,confirmationWindowMinutes:[2,20],confirmationMaxChasePct:.8,
   lateImpulse5mPct:1.0,lateImpulseAcceleration:.8,
   saturationThresholdPct:85,meaningfulProfitFloorEuro:2.5,meaningfulProfitFloorPctOfInvested:.35,
   automaticScaleUp:false,doesNotCreateNewSellSignals:true,
   note:'Die V27.7-Schicht blockiert oder verkleinert schlechte Aktionen. Sie erzeugt keine aggressiven Zusatz-SELLs und umgeht keine bestehenden Safety-Gates.'};
  if(s?.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV277:true,tradingBehaviorV277:true,entryConfirmationHysteresis:true,lateImpulseRecheck:true,tinyProfitChurnBlocked:true,automaticScaleUp:false};
  if(s?.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV277:true,tradingBehaviorV277:true,entryConfirmationHysteresis:true,lateImpulseRecheck:true,tinyProfitChurnBlocked:true,automaticScaleUp:false};
  return s;
 }
}
