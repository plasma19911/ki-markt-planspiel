import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v18.js';
import {DipPriorityV2AiGuard} from './dip-priority-v2-guard.js';
import {CandleFlowAiGuard} from './candle-flow-ai-guard.js';
import {sanitizeFxContaminatedLearning} from './learning-sanity-v2.js';

// V19: Dynamic Dip + Candle Flow. Prozentwerte sind Kontext, keine feste BUY-/SELL-
// Schwelle. Der finale Trade-Check liest nur fuer tatsaechlich geplante Orders frische
// 1m-OHLC-Kerzen und bewertet Kaeufer-/Verkaeuferdruck, Engulfing, Hochs/Tiefs und Volumen.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.env=env;
  let ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__dipPriorityV2Guard){
   if(ai.__freshPositionChurnGuard&&ai.base?.run){const inner=new DipPriorityV2AiGuard(ai.base);inner.__dipPriorityV2Guard=true;ai.base=inner;ai.__dipPriorityV2Guard=true}
   else{const wrapped=new DipPriorityV2AiGuard(ai);wrapped.__dipPriorityV2Guard=true;this.engine.env.AI=wrapped}
  }
  ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__candleFlowGuard){const wrapped=new CandleFlowAiGuard(ai);wrapped.__candleFlowGuard=true;this.engine.env.AI=wrapped}
  this.__learningSanity=sanitizeFxContaminatedLearning(ctx?.storage);
 }
 async scan(){
  const before=sanitizeFxContaminatedLearning(this.ctx?.storage),r=await super.scan(),after=sanitizeFxContaminatedLearning(this.ctx?.storage);
  if(r&&typeof r==='object')r.learningSanity={before,after};
  return r;
 }
 async status(){
  const sanity=sanitizeFxContaminatedLearning(this.ctx?.storage),s=await super.status();
  s.learningSanity=sanity;
  s.candleFlowPolicy={enabled:true,mode:'DYNAMIC_BUYER_SELLER_CANDLES',interval:'1m',maxPlannedTradeChecksPerScan:3,fixedTakeProfitPct:null,fixedStopForSoftExitPct:null,fixedDipEntryPct:null,buyRule:'Dip/relative pullback bevorzugen; BUY erst wenn rote Kerzen schwächer werden und Käuferkerzen/hoehere Tiefs/Engulfing die Uebernahme bestaetigen.',holdRule:'Gewinner weiterlaufen lassen solange Käuferstruktur intakt ist; kein fixes Take-Profit.',sellRule:'SELL bei bestätigter Verkäuferübernahme, tieferen Hochs/fallenden Schlusskursen, bearish Engulfing bzw. Reversal; harte Event-/Stop-Risiken bleiben sofort ausfuehrbar.',foreignFxBuyRequiresRealFx:true};
  s.profitFirstPolicy={enabled:false,replacedBy:'CANDLE_FLOW_DYNAMIC',fixedProfitTargets:false,fixedSoftExitProfitPct:null,fixedMinimumHoldForProfitExit:null,note:'Die zuvor kurz eingesetzten +1,0%/+1,5%-Schwellen sind entfernt. P/L-Prozent ist nur Kontext; der Ausstieg folgt der Kerzenstruktur.'};
  s.entryResearchPolicy={...(s.entryResearchPolicy||{}),dipFirstV2:true,dipSelectionMode:'RELATIVE_DYNAMIC',realDipMinDrawdown20mPct:null,realDipMaxPositiveDayPct:null,candleFlowConfirmation:true,fixedDipPercentThreshold:false,realDipBeatsHighBuy:true};
  s.balancedAdaptive={...(s.balancedAdaptive||{}),exitTimingMode:'CANDLE_FLOW_DYNAMIC',softSellAbsoluteGraceMinutes:null,normalRotationMinAgeMinutes:null,quickProfitLockMinAgeMinutes:null,quickProfitLockPct:null,minimumNormalSoftExitProfitPct:null,lossRotationAllowed:'ONLY_WHEN_SELLER_FLOW_OR_HARD_RISK',dipFirstV2:true,candleFlowConfirmation:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,profitFirst:false,fixedProfitTargets:false,minimumNormalSoftExitProfitPct:null,normalSoftExitMinAgeMinutes:null,quickProfitLockPct:null,quickProfitLockMinAgeMinutes:null,lossRotationAllowed:'CANDLE_CONFIRMED_ONLY',dipFirstV2:true,dipSelectionMode:'RELATIVE_DYNAMIC',realDipBeatsHighBuy:true,candleFlowConfirmation:true,candleInterval:'1m',foreignFxBuyRequiresRealFx:true};
  if(s.executionModel)s.executionModel={...s.executionModel,profitFirst:false,fixedProfitTargets:false,normalSoftExitMinProfitPct:null,exitTiming:'CANDLE_FLOW_DYNAMIC',candleFlowConfirmation:true,foreignFxBuyRequiresRealFx:true};
  return s;
 }
}
