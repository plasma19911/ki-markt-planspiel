import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v18.js';
import {DipPriorityV2AiGuard} from './dip-priority-v2-guard.js';
import {sanitizeFxContaminatedLearning} from './learning-sanity-v2.js';

// V19: Profit-First lives in the v2 fresh-position guard. This layer injects
// stricter dip-priority inside that final safety guard and removes old FX-corrupted
// learning samples before they can bias future entry decisions.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.env=env;
  let ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__dipPriorityV2Guard){
   // Keep FreshPositionChurnAiGuard as the final outer safety layer so every BUY
   // generated/changed by DipPriorityV2 still passes FX and profit/churn safety.
   if(ai.__freshPositionChurnGuard&&ai.base?.run){const inner=new DipPriorityV2AiGuard(ai.base);inner.__dipPriorityV2Guard=true;ai.base=inner;ai.__dipPriorityV2Guard=true}
   else{const wrapped=new DipPriorityV2AiGuard(ai);wrapped.__dipPriorityV2Guard=true;this.engine.env.AI=wrapped}
  }
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
  s.profitFirstPolicy={enabled:true,normalSoftExitMinProfitPct:1.0,normalSoftExitMinHoldMinutes:30,quickProfitLockPct:1.5,quickProfitLockMinHoldMinutes:10,lossExitOnlyForHardRiskOrConfirmedFailure:true,confirmedFailureMinAgeMinutes:25,confirmedFailureConfirmations:2,confirmedFailureSpanMinutes:3,foreignFxBuyRequiresRealFx:true,note:'Normale Rotation/Momentum-Verkaeufe realisieren keine kleinen Verluste mehr. Harte Event-/Reversal-/Stop-Risiken bleiben sofortige Sicherheitsausnahmen.'};
  s.entryResearchPolicy={...(s.entryResearchPolicy||{}),dipFirstV2:true,realDipMinDrawdown20mPct:.35,realDipMaxPositiveDayPct:.45,highBuyMaxPct:3,realDipBeatsHighBuy:true};
  s.balancedAdaptive={...(s.balancedAdaptive||{}),softSellAbsoluteGraceMinutes:30,normalRotationMinAgeMinutes:30,quickProfitLockMinAgeMinutes:10,quickProfitLockPct:1.5,minimumNormalSoftExitProfitPct:1.0,lossRotationAllowed:false,dipFirstV2:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,profitFirst:true,minimumNormalSoftExitProfitPct:1.0,normalSoftExitMinAgeMinutes:30,quickProfitLockPct:1.5,quickProfitLockMinAgeMinutes:10,lossRotationAllowed:false,dipFirstV2:true,realDipBeatsHighBuy:true,foreignFxBuyRequiresRealFx:true};
  if(s.executionModel)s.executionModel={...s.executionModel,profitFirst:true,normalSoftExitMinProfitPct:1.0,lossRotationAllowed:false,foreignFxBuyRequiresRealFx:true};
  return s;
 }
}
