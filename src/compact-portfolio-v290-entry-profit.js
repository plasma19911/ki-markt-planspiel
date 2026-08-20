import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v289-score-hysteresis.js';
import {EntryProfitGuardV290} from './entry-profit-guard-v290.js';
import {ENTRY_PROFIT_V290} from './entry-profit-behavior-v290-core.js';

// PAPER-TRADING ONLY. V29.0 sits on top of V28.9/V28.8.
// Entry bands: 50-52 watch, 53-55 scout, 56-57 micro, 58-61 early, 62+ regular.
// Lower-score entries require progressively stronger coverage + market confirmation.
// Dynamic profit locking can realize winners while hold score is still high.
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
    const s=await super.status(),policy=this.entryProfitV290?.status?.()||{enabled:true,version:29.0,thresholds:ENTRY_PROFIT_V290,candidateBehaviors:[],profitBehaviors:[]};
    s.entryProfitPolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),behaviorVersion:29.0,entryProfitThresholds:ENTRY_PROFIT_V290,candidateBehaviorsV290:policy.candidateBehaviors||[],profitBehaviors:policy.profitBehaviors||[],scoreLegend:[{min:76,label:'Sehr stark'},{min:68,label:'Stark bestätigt'},{min:62,label:'Kaufen'},{min:58,label:'Früher Einstieg'},{min:56,label:'Mikro-Starter'},{min:53,label:'Scout'},{min:50,label:'Beobachten'},{min:0,label:'Schwach'}],behaviorNote:'V29.0: 50–52 beobachten, 53–55 Scout, 56–57 Mikro, 58–61 früh, 62+ regulär. Je niedriger der Einstiegsscore, desto höher die Anforderungen an Datenabdeckung, Score-Beschleunigung und echte Momentum/Katalysator-Bestätigung. Überdehnung/FOMO/Hard-Blocks bleiben gesperrt. Gewinne können bei nachlassendem Trend auch bei Haltescore 70–75 gesichert werden.'};
    s.dynamicProfitLockPolicy={enabled:true,version:29.0,thresholds:ENTRY_PROFIT_V290.profit,behaviors:policy.profitBehaviors||[],rule:'Kein starres Gewinnziel. Peak seit Einstieg, Rücklauf vom Peak, Haltescore-Richtung und Momentum werden gemeinsam bewertet. Ein Score 70–75 kann SELL sein, wenn ein zuvor stärkerer Gewinner sichtbar ausläuft; derselbe Score bleibt HOLD, wenn Trend/Momentum wieder anziehen.'};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.0,scoreHysteresis:true,directionalScoreBehavior:true,pcFirstScannerV288:true,earlyScoutEntryV290:true,watchFrom50:true,scoutEntryFrom53:true,microEntryFrom56:true,earlyEntryFrom58:true,regularEntryFrom62:true,dynamicProfitLockV290:true,highScoreProfitExit:true,profitPeakGivebackAware:true,hardRiskImmediate:true,rule:'V29.0: 50–52 beobachten; 53–55 nur kleiner Scout mit sehr starker Bestätigung; 56–57 Mikro; 58–61 früher Einstieg; 62+ regulär. Gewinner laufen weiter, solange Trend intakt ist; bei Peak-Rücklauf plus fallendem Score/Momentum wird Gewinn auch bei Haltescore 70–75 gesichert.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,entryProfitV290:true,dynamicProfitLockV290:true};
    return s
  }
}
