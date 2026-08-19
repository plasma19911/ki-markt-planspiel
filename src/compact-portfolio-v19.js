import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v18.js';
import {DipPriorityV2AiGuard} from './dip-priority-v2-guard.js';
import {CandleFlowAiGuard} from './candle-flow-ai-guard.js';
import {MultiTimeframeTradeAiGuard} from './multi-timeframe-trade-guard.js';
import {sanitizeFxContaminatedLearning} from './learning-sanity-v2.js';

// V19: Dynamic Dip + Candle Flow + Multi-Timeframe + Selective Capital.
// Prozentwerte sind Kontext; BUY/SELL wird nicht an feste P/L- oder Zeitgrenzen gekoppelt.
// Risikokappen begrenzen nur Positionsgroessen und sind keine Handelssignale.
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
  ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__multiTimeframeTradeGuard){const wrapped=new MultiTimeframeTradeAiGuard(ai);wrapped.__multiTimeframeTradeGuard=true;this.engine.env.AI=wrapped}
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
  s.candleFlowPolicy={enabled:true,version:2.1,mode:'DYNAMIC_BUYER_SELLER_CANDLES',interval:'1m',maxCandleChecksPerScan:5,fixedTakeProfitPct:null,fixedStopForSoftExitPct:null,fixedDipEntryPct:null,sellAgeRule:false,ordinarySellerDominanceRequired:true,mixedBaseTopSellBlocked:true,buyerMajoritySoftSellBlocked:true,buyRule:'Relative Dips bevorzugen; BUY erst bei Bodenbildung, nachlassendem Verkaufsdruck, Absorption/höheren Tiefs und Käuferübernahme.',holdRule:'Gewinner laufen lassen solange Käuferstruktur intakt bleibt; gemischte Boden-/Topbilder werden gehalten statt vorschnell verkauft.',sellRule:'Normaler SELL erst bei eindeutiger Verkäuferdominanz, bestätigtem bärischem Reversal oder klarer Top-/Red-Volume-Struktur; harte Event-/Stop-/starke Reversal-Risiken bleiben sofort möglich.',foreignFxBuyRequiresRealFx:true};
  s.multiTimeframeTradePolicy={enabled:true,version:1,finalContextOrder:['1m Käufer-/Verkäuferkerzen','6 Monate Tageschart','2 Jahre Wochenchart','aktuelle Unternehmens-/Event-News'],plannedSymbolsCheckedPerDecision:3,dailyRange:'6mo',dailyInterval:'1d',weeklyRange:'2y',weeklyInterval:'1wk',buyRule:'Minutenboden allein reicht nicht. Tages-/Wochenstruktur darf keinen ungebremsten gemeinsamen Abwärtstrend zeigen; Käufe an mehrfachen Widerständen werden vermieden. Unterstützungszonen und intakte Wochenstruktur verbessern die Qualität.',sellRule:'Nicht tief in einer intakten Wochen-Aufwärts-/Unterstützungsstruktur verkaufen. Bestätigte Verkäuferübernahme nahe Tages-/Wochenwiderstand bzw. Top-Struktur ist dagegen ein stärkerer Exit.',newsRule:'Aktuelle Unternehmens-/Event-News werden vor tatsächlichen BUY/SELL-Plänen mitbewertet; harte negative Meldungen können einen optisch günstigen Dip blockieren.',fixedProfitTarget:false,fixedHoldMinutes:false};
  s.selectiveCapitalPolicy={enabled:true,alwaysInvested:false,cashAllowed:true,legacyFullCashBuysBlocked:true,timeBasedSellProposalsBlocked:true,volatilityAdjustedSizing:true,marketCapAdjustedSizing:true,currencyConcentrationAdjusted:true,regionalConcentrationAdjusted:true,themeConcentrationAdjusted:true,maxDipNewAllocationPct:28,maxNormalNewAllocationPct:18,maxNonDipNewAllocationPct:8,maxNewAllocationPerScanPct:55,forcedMinimumBuyPct:null,finalBuyByCandleFlow:true,finalSellByCandleFlow:true,note:'28/18/8/55 sind nur Risikokappen fuer Positionsgroessen, keine festen BUY-/SELL-Signalschwellen. Wenn kein gutes Setup da ist, darf Cash bewusst liegen bleiben.'};
  s.profitFirstPolicy={enabled:false,replacedBy:'CANDLE_FLOW_DYNAMIC',fixedProfitTargets:false,fixedSoftExitProfitPct:null,fixedMinimumHoldForProfitExit:null,note:'P/L-Prozent und Haltedauer sind nur Kontext/Telemetrie; der Ausstieg folgt der Kerzen-, Mehr-Zeitebenen- und Risikostruktur.'};
  s.entryResearchPolicy={...(s.entryResearchPolicy||{}),dipFirstV2:true,dipSelectionMode:'RELATIVE_DYNAMIC',realDipMinDrawdown20mPct:null,realDipMaxPositiveDayPct:null,candleFlowConfirmation:true,multiTimeframeConfirmation:true,fixedDipPercentThreshold:false,realDipBeatsHighBuy:true};
  s.balancedAdaptive={...(s.balancedAdaptive||{}),exitTimingMode:'CANDLE_FLOW_DYNAMIC',softSellAbsoluteGraceMinutes:null,normalRotationMinAgeMinutes:null,quickProfitLockMinAgeMinutes:null,quickProfitLockPct:null,minimumNormalSoftExitProfitPct:null,lossRotationAllowed:'ONLY_WHEN_SELLER_FLOW_OR_HARD_RISK',dipFirstV2:true,candleFlowConfirmation:true,multiTimeframeConfirmation:true,alwaysInvested:false,cashAllowed:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,profitFirst:false,fixedProfitTargets:false,minimumNormalSoftExitProfitPct:null,normalSoftExitMinAgeMinutes:null,quickProfitLockPct:null,quickProfitLockMinAgeMinutes:null,lossRotationAllowed:'CANDLE_CONFIRMED_ONLY',dipFirstV2:true,dipSelectionMode:'RELATIVE_DYNAMIC',realDipBeatsHighBuy:true,candleFlowConfirmation:true,multiTimeframeConfirmation:true,candleInterval:'1m',dailyContext:'6mo/1d',weeklyContext:'2y/1wk',foreignFxBuyRequiresRealFx:true,alwaysInvested:false,capitalInMotion:false,legacyFullCashFailsafe:'BLOCKED_BY_SELECTIVE_CAPITAL',timeBasedExit:false,maxSingleNewPositionRiskCapPct:28};
  if(s.executionModel)s.executionModel={...s.executionModel,profitFirst:false,fixedProfitTargets:false,normalSoftExitMinProfitPct:null,exitTiming:'CANDLE_FLOW_DYNAMIC',candleFlowConfirmation:true,multiTimeframeConfirmation:true,foreignFxBuyRequiresRealFx:true,cashMayRemain:true,fullCashPolicy:false,capitalInMotion:false,forcedMinimumBuyPct:null,timeBasedSell:false};
  return s;
 }
}
