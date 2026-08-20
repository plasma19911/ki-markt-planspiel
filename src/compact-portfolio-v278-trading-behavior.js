import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v276-daily-agm.js';
import {TradingBehaviorGuardV278} from './trading-behavior-v278.js';
import {AI_PLAN_JSON_REPAIR_POLICY} from './ai-plan-json-repair.js';

// PAPER-TRADING ONLY. V27.8 keeps the audited V27.6/V27.7 safety stack and
// improves behavior without creating aggressive extra trades.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__tradingBehaviorV278){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new TradingBehaviorGuardV278(ai,{getState,storage:this.ctx?.storage});
   wrapped.__tradingBehaviorV278=true;
   this.tradingBehavior=wrapped;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status(),behavior=this.tradingBehavior?.status?.()||{enabled:true,version:27.8};
  if(s?.finalDecisionPolicy){
   s.finalDecisionPolicy={...s.finalDecisionPolicy,version:27.8,
    mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER_PLUS_DETERMINISTIC_TRADE_INVARIANTS_PLUS_AGM_PREVIEW_PLUS_ADAPTIVE_TRADING_BEHAVIOR',
    entryConfirmationHysteresis:true,normalEntryNeedsTwoScans:true,adaptiveEntryConfirmation:true,adaptiveEntryMinutes:[2,3,4],exceptionalSetupMayEnterImmediately:true,minuteScanConfirmationSafe:true,
    heldBuyPromptSuppression:true,heldPromptPlanOnly:true,pullbackReclaimAware:true,summaryMetricClarity:true,
    softSellNeedsRepeatScan:true,timeAloneCannotCreateSell:true,hardRiskImmediate:true,severeStructureBreakImmediate:true,
    lateImpulseRecheck:true,fomoImpulseBuyBlocked:true,portfolioSaturationSelectivity:true,meaningfulProfitExit:true,tinyProfitChurnBlocked:true,heldFxFallbackSafe:true,
    aiPlanJsonRepair:true,aiPlanCompactOutput:true,aiPlanJsonRepairVersion:27.7,cloudflareAiWrapperSignatureSafe:true,
    convictionSizing:true,behaviorVersion:27.8,
    regressionTests:`${String(s.finalDecisionPolicy.regressionTests||'').replace(/\s*$/,'')} + V27.8 adaptive-entry / held-BUY plan-only suppression / pullback-reclaim / repeated-soft-SELL / metric-clarity invariants`,
    rule:'V27.8 reduziert unnötige KI-Aktionen und Whipsaw: Gehaltene Titel sind nur im echten Handelsplan schon im KI-Prompt BUY-gesperrt; News- und andere KI-Aufrufe bleiben unverändert. Pullback/Reclaim darf einen noch moderat negativen 20-Minuten-Trend besitzen, wenn 5-Minuten-Reaktion und Beschleunigung die Erholung bestätigen. Normale Einstiege müssen je nach Intraday-Volatilität 2, 3 oder 4 Minuten stabil bleiben; außergewöhnlich starke, nicht überhitzte Setups dürfen weiterhin sofort handeln. Ein normaler Soft-SELL wird nur ausgeführt, wenn er in einem getrennten Folgescan erneut entsteht. Zeit allein erzeugt keinen SELL. Harte Risiken und schwere Strukturbrüche bleiben sofort ausführbar. Alle FX-, Kosten-, Verlust-SELL-, Marktregime-, Depotrisiko-, AGM- und No-Scale-up-Regeln bleiben aktiv.'};
  }
  s.tradingBehaviorPolicy={...behavior,enabled:true,version:27.8,paperTradingOnly:true,
   heldBuyPromptSuppression:true,heldPromptPlanOnly:true,pullbackReclaimAware:true,summaryMetricClarity:true,
   normalEntryConfirmationScans:2,adaptiveEntryConfirmation:true,adaptiveEntryMinutes:[2,3,4],confirmationMaxChasePct:.8,minuteScanConfirmationSafe:true,
   softSellNeedsRepeatScan:true,timeAloneCannotCreateSell:true,hardRiskImmediate:true,severeStructureBreakImmediate:true,
   lateImpulse5mPct:1.0,lateImpulseAcceleration:.8,
   saturationThresholdPct:85,meaningfulProfitFloorEuro:2.5,meaningfulProfitFloorPctOfInvested:.35,heldFxFallbackSafe:true,
   aiPlanJsonRepair:AI_PLAN_JSON_REPAIR_POLICY,aiPlanCompactOutput:true,cloudflareAiWrapperSignatureSafe:true,
   automaticScaleUp:false,doesNotCreateNewSellSignals:true,
   note:'V27.8 blockiert Bestands-BUYs nur im Handelsplan vor der KI-Ausgabe, lässt News-Prompts unangetastet, behandelt Pullback/Reclaim getrennt von Breakouts, passt die Entry-Reife an die Volatilität an und verlangt für normale Soft-SELLs eine echte Folgescan-Bestätigung. Zeit allein ist niemals ein Exit-Grund.'};
  if(s?.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV278:true,tradingBehaviorV278:true,heldBuyPromptSuppression:true,heldPromptPlanOnly:true,pullbackReclaimAware:true,summaryMetricClarity:true,adaptiveEntryConfirmation:true,softSellNeedsRepeatScan:true,timeAloneCannotCreateSell:true,minuteScanConfirmationSafe:true,lateImpulseRecheck:true,tinyProfitChurnBlocked:true,heldFxFallbackSafe:true,aiPlanJsonRepair:true,automaticScaleUp:false};
  if(s?.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV278:true,tradingBehaviorV278:true,heldBuyPromptSuppression:true,heldPromptPlanOnly:true,pullbackReclaimAware:true,summaryMetricClarity:true,adaptiveEntryConfirmation:true,softSellNeedsRepeatScan:true,timeAloneCannotCreateSell:true,minuteScanConfirmationSafe:true,lateImpulseRecheck:true,tinyProfitChurnBlocked:true,heldFxFallbackSafe:true,aiPlanJsonRepair:true,automaticScaleUp:false};
  return s;
 }
}
