import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v18.js';
import {DipPriorityV2AiGuard} from './dip-priority-v2-guard.js';
import {CandleFlowAiGuard} from './candle-flow-ai-guard.js';
import {sanitizeFxContaminatedLearning} from './learning-sanity-v2.js';

// V19: Dynamic Dip + Candle Flow V2. Prozentwerte und Haltedauer sind Kontext,
// aber keine festen BUY-/SELL-Schwellen. Der finale Trade-Check liest nur fuer
// tatsaechlich relevante Orders/Risikopositionen frische 1m-OHLC-Kerzen.
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
  s.candleFlowPolicy={enabled:true,version:2,mode:'DYNAMIC_BUYER_SELLER_CANDLES',interval:'1m',maxRelevantCandleChecksPerScan:5,maxProactiveHeldRiskChecks:2,fixedTakeProfitPct:null,fixedStopForSoftExitPct:null,fixedDipEntryPct:null,sellAgeRule:false,holdMinutesRule:false,buyRule:'Relative Dips/Bodenbildung bevorzugen: rote Kerzen verlieren Koerper/Volumen, untere Dochte absorbieren Verkaeufer, Tiefs steigen, gruene Kerzen/Volumen uebernehmen und Engulfing kann bestaetigen.',holdRule:'Gewinner laufen lassen solange Käuferstruktur intakt ist. Haltedauer und feste Gewinnprozente entscheiden nicht ueber SELL.',sellRule:'SELL nur bei echter Verkäuferübernahme/Topbildung/tieferen Hochs/fallenden Schlusskursen/rotem Volumen bzw. hartem Reversal. Bis zu zwei schwache gehaltene Positionen werden pro Scan proaktiv geprueft, auch wenn ein innerer Optimizer keinen SELL vorgeschlagen hat.',foreignFxBuyRequiresRealFx:true};
  s.profitFirstPolicy={enabled:false,replacedBy:'CANDLE_FLOW_DYNAMIC_V2',fixedProfitTargets:false,fixedSoftExitProfitPct:null,fixedMinimumHoldForProfitExit:null,sellAgeRule:false,note:'Keine Minutenregel mehr fuer normale SELLs. Haltedauer ist nur Anzeige/Context; Ausstieg folgt aktueller Kerzen- und Verkäuferstruktur.'};
  s.entryResearchPolicy={...(s.entryResearchPolicy||{}),dipFirstV2:true,dipSelectionMode:'RELATIVE_DYNAMIC_FLOOR_FORMATION',realDipMinDrawdown20mPct:null,realDipMaxPositiveDayPct:null,candleFlowConfirmation:true,candleFloorDetection:true,fixedDipPercentThreshold:false,realDipBeatsHighBuy:true};
  s.rotationCostGuard={...(s.rotationCostGuard||{}),ageRule:false,minAgeMinutes:null,earlyAgeMinutes:null,finalSellByCandleFlow:true,mode:'Rotation nur nach Kosten-/Qualitaetsvorteil; keine Minutenfreigabe. Finale SELL-Entscheidung folgt Candle-Flow.'};
  s.balancedAdaptive={...(s.balancedAdaptive||{}),exitTimingMode:'CANDLE_FLOW_DYNAMIC_V2',softSellAbsoluteGraceMinutes:null,normalRotationMinAgeMinutes:null,quickProfitLockMinAgeMinutes:null,quickProfitLockPct:null,minimumNormalSoftExitProfitPct:null,lossRotationAllowed:'ONLY_WHEN_SELLER_FLOW_OR_HARD_RISK',sellAgeRule:false,dipFirstV2:true,candleFlowConfirmation:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,profitFirst:false,fixedProfitTargets:false,minimumNormalSoftExitProfitPct:null,normalSoftExitMinAgeMinutes:null,quickProfitLockPct:null,quickProfitLockMinAgeMinutes:null,lossRotationAllowed:'CANDLE_CONFIRMED_ONLY',sellAgeRule:false,dipFirstV2:true,dipSelectionMode:'RELATIVE_DYNAMIC_FLOOR_FORMATION',realDipBeatsHighBuy:true,candleFlowConfirmation:true,candleInterval:'1m',candleFlowVersion:2,foreignFxBuyRequiresRealFx:true};
  if(s.executionModel)s.executionModel={...s.executionModel,profitFirst:false,fixedProfitTargets:false,normalSoftExitMinProfitPct:null,exitTiming:'CANDLE_FLOW_DYNAMIC_V2',sellAgeRule:false,candleFlowConfirmation:true,foreignFxBuyRequiresRealFx:true};
  return s;
 }
}
