import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v289-score-hysteresis.js';
import {EntryProfitGuardV290} from './entry-profit-guard-v290.js';
import {ENTRY_PROFIT_V290} from './entry-profit-behavior-v290-core.js';

// PAPER-TRADING ONLY. V29.1 is the final effective score controller on top of V29.0/V28.9.
// Entry: 50-52 watch, 53-55 scout, 56-57 micro, 58-61 early, 62+ regular.
// Position: 62+ strong hold, 58-61 hold, 53-57 hold/watch, 50-52 caution,
// 46-49 sell-watch, <=45 confirmed exit, <=32 urgent score exit.
// Dynamic profit locking remains separate and may realize winners at high hold scores.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__entryProfitV290){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new EntryProfitGuardV290(ai,{getState,storage:this.ctx?.storage});
      wrapped.__entryProfitV290=true;this.entryProfitV290=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.entryProfitV290?.status?.()||{enabled:true,version:29.1,canonicalScoreBands:true,legacyThresholdsSuperseded:true,thresholds:ENTRY_PROFIT_V290,candidateBehaviors:[],positionBehaviors:[],profitBehaviors:[]};
    s.entryProfitPolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),behaviorVersion:29.1,entryProfitThresholds:ENTRY_PROFIT_V290,candidateBehaviorsV290:policy.candidateBehaviors||[],positionBehaviorsV291:policy.positionBehaviors||[],profitBehaviors:policy.profitBehaviors||[],scoreLegend:[{min:76,label:'Sehr stark'},{min:68,label:'Stark bestätigt'},{min:62,label:'Regulär kaufen'},{min:58,label:'Früher Einstieg'},{min:56,label:'Mikro-Starter'},{min:53,label:'Scout'},{min:50,label:'Beobachten'},{min:0,label:'Schwach'}],positionBehaviorLegend:[{min:62,label:'Stark halten'},{min:58,label:'Halten'},{min:53,label:'Halten / beobachten'},{min:50,label:'Achtung'},{min:46,label:'Verkauf beobachten'},{min:33,label:'Verkaufen nur bestätigt'},{min:0,label:'Dringender Score-Exit nach Mindestalter'}],behaviorNote:'V29.1 synchronisiert alle wirksamen Score-Grenzen. Kauf: 50–52 beobachten, 53–55 Scout, 56–57 Mikro, 58–61 früh, 62+ regulär. Position: 62+ stark halten, 58–61 halten, 53–57 beobachten, 50–52 Achtung, 46–49 Verkauf beobachten, <=45 nur bestätigt verkaufen, <=32 dringender Score-Exit. Alte V28.x-Schwellen werden vom finalen Controller überstimmt.'};
    s.dynamicProfitLockPolicy={enabled:true,version:29.1,thresholds:ENTRY_PROFIT_V290.profit,behaviors:policy.profitBehaviors||[],rule:'Gewinnsicherung ist absichtlich separat von der normalen Positionsskala: ein Gewinner kann bei Haltescore 70–75 SELL werden, wenn Peak-Rücklauf, fallende Score-Richtung und schwaches Momentum zusammenpassen; bei erneut steigendem Trend bleibt HOLD.'};
    s.canonicalScorePolicy={enabled:true,version:29.1,authoritative:true,legacyThresholdsSuperseded:true,entry:ENTRY_PROFIT_V290.entry,position:ENTRY_PROFIT_V290.position,rotation:ENTRY_PROFIT_V290.rotation,profit:ENTRY_PROFIT_V290.profit};
    if(s?.scoreHysteresisPolicy)s.scoreHysteresisPolicy={...s.scoreHysteresisPolicy,effectiveVersion:29.1,effectiveThresholds:{candidate:ENTRY_PROFIT_V290.entry,position:ENTRY_PROFIT_V290.position},legacyThresholdsSuperseded:true};
    if(s?.calibratedActionScorePolicy)s.calibratedActionScorePolicy={...s.calibratedActionScorePolicy,effectiveVersion:29.1,effectiveBuyThreshold:62,effectiveWatchThreshold:50,effectiveRotation:ENTRY_PROFIT_V290.rotation,legacyThresholdsSuperseded:true};
    if(s?.comprehensiveOpportunityPolicy)s.comprehensiveOpportunityPolicy={...s.comprehensiveOpportunityPolicy,effectiveVersion:29.1,effectiveBuyThreshold:62,effectiveRotation:ENTRY_PROFIT_V290.rotation,legacyThresholdsSuperseded:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.1,canonicalScoreBands:true,legacyScoreThresholdsSuperseded:true,scoreHysteresis:true,directionalScoreBehavior:true,pcFirstScannerV288:true,watchFrom50:true,scoutEntryFrom53:true,microEntryFrom56:true,earlyEntryFrom58:true,regularEntryFrom62:true,strongEntryFrom68:true,exceptionalEntryFrom76:true,strongHoldFrom62:true,holdFrom58:true,positionWatchFrom53:true,positionCautionFrom50:true,sellWatchFrom46:true,confirmedScoreExitAt45:true,urgentScoreExitAt32:true,rotationCandidateFrom62:true,dynamicProfitLockV290:true,highScoreProfitExit:true,profitPeakGivebackAware:true,hardRiskImmediate:true,rule:'V29.1: eine Skala für alle weichen Score-Entscheidungen. Kauf 50/53/56/58/62, Position 62/58/53/50/46/45/32. Alte weiche V28.x-Schwellen werden abschließend korrigiert. Hard-Risiken bleiben sofort; Gewinn-Lock kann Gewinner bei 70–75 sichern.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,entryProfitV290:true,canonicalScoreBandsV291:true,dynamicProfitLockV290:true};
    return s
  }
}
