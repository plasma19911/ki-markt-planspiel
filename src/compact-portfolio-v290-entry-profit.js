import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v289-score-hysteresis.js';
import {EntryProfitGuardV290} from './entry-profit-guard-v290.js';
import {ENTRY_PROFIT_V290} from './entry-profit-behavior-v290-core.js';

// PAPER-TRADING ONLY. V29.0 sits on top of V28.9/V28.8.
// It moves the earliest qualified entry to score 60 with tiny scout sizing and adds
// dynamic profit locking so winners can be realized while the hold score is still high.
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
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),behaviorVersion:29.0,entryProfitThresholds:ENTRY_PROFIT_V290,candidateBehaviorsV290:policy.candidateBehaviors||[],profitBehaviors:policy.profitBehaviors||[],scoreLegend:[{min:82,label:'Sehr stark'},{min:76,label:'Stark bestätigt'},{min:72,label:'Kaufen'},{min:68,label:'Früher Einstieg'},{min:65,label:'Mikro-Starter'},{min:60,label:'Scout bei starker Beschleunigung'},{min:58,label:'Beobachten'},{min:0,label:'Schwach'}],behaviorNote:'V29.0: Einstieg bewusst früh gestaffelt. 60–64 nur Scout mit hoher Datenabdeckung und sehr starker Score-Beschleunigung; 65–67 Mikro, 68–71 früh, 72+ regulär. Überdehnung/FOMO/Hard-Blocks bleiben gesperrt. Gewinne können bei nachlassendem Trend auch bei Haltescore 70–75 gesichert werden.'};
    s.dynamicProfitLockPolicy={enabled:true,version:29.0,thresholds:ENTRY_PROFIT_V290.profit,behaviors:policy.profitBehaviors||[],rule:'Kein starres Gewinnziel. Peak seit Einstieg, Rücklauf vom Peak, Haltescore-Richtung und Momentum werden gemeinsam bewertet. Ein Score 70–75 kann SELL sein, wenn ein zuvor stärkerer Gewinner sichtbar ausläuft; derselbe Score bleibt HOLD, wenn Trend/Momentum wieder anziehen.'};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.0,scoreHysteresis:true,directionalScoreBehavior:true,pcFirstScannerV288:true,earlyScoutEntryV290:true,scoutEntryFrom60:true,microEntryFrom65:true,earlyEntryFrom68:true,regularEntryFrom72:true,dynamicProfitLockV290:true,highScoreProfitExit:true,profitPeakGivebackAware:true,hardRiskImmediate:true,rule:'V29.0: früher staffelweise in saubere Starter einsteigen, statt bis 76+ zu warten. Scout 60–64 nur bei außergewöhnlich schneller Verbesserung und hoher Datenabdeckung; 65–67 Mikro, 68–71 früh, 72+ regulär. Gewinner laufen weiter, solange Trend intakt ist; bei Peak-Rücklauf plus fallendem Score/Momentum wird Gewinn auch bei Haltescore 70–75 gesichert.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,entryProfitV290:true,dynamicProfitLockV290:true};
    return s
  }
}
