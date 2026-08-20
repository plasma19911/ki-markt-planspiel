import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v288-pc-first.js';
import {ScoreHysteresisGuardV289,SCORE_BEHAVIOR_V289} from './score-hysteresis-v289.js';

// PAPER-TRADING ONLY. V28.9 adds score-direction hysteresis on top of the
// calibrated V28.7 score and the V28.8 PC-first scanner. It deliberately keeps
// the existing hard-risk, maturity, venue, quote and execution-cost guards.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__scoreHysteresisV289){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new ScoreHysteresisGuardV289(ai,{getState,storage:this.ctx?.storage});
      wrapped.__scoreHysteresisV289=true;this.scoreHysteresisV289=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.scoreHysteresisV289?.status?.()||{enabled:true,version:28.9,thresholds:SCORE_BEHAVIOR_V289,candidateBehaviors:[],positionBehaviors:[]};
    s.scoreHysteresisPolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),behaviorVersion:28.9,behaviorThresholds:SCORE_BEHAVIOR_V289,candidateBehaviors:policy.candidateBehaviors||[],positionBehaviors:policy.positionBehaviors||[],scoreLegend:[{min:84,label:'Sofort kaufbereit*'},{min:76,label:'Kaufbereit nach Bestätigung'},{min:72,label:'Früher Einstieg bei stark steigendem Score'},{min:68,label:'Bestätigen'},{min:58,label:'Beobachten'},{min:0,label:'Schwach'}],positionBehaviorLegend:[{min:60,label:'Stark halten'},{min:50,label:'Halten'},{min:48,label:'Halten / Achtung'},{min:43,label:'Verkauf beobachten'},{min:0,label:'Verkaufen bei Bestätigung'}],behaviorNote:'* Nur ohne Hard-Block/Überdehnung. Einstieg und Ausstieg haben bewusst unterschiedliche Schwellen; Score-Richtung und mehrere Scans zählen mit.'};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.9,scoreHysteresis:true,directionalScoreBehavior:true,earlyRisingStarter:true,separateEntryExitBands:true,hardRiskImmediate:true,rule:'V28.9 verhindert Flip-Flop mit getrennten Ein-/Ausstiegszonen. BUY normal ab 76 nach Bestätigung; bei sauber stark steigendem Score kleiner früher Starter ab 72, außergewöhnlich stark ab 84 direkt. Positionen werden zwischen 48–60 grundsätzlich gehalten/beobachtet; scorebasierter SELL bei starkem Trendbruch <=46, bestätigt <=42 bzw. sehr niedrig <=30. Hard-Risiko bleibt sofort.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,scoreHysteresisV289:true};
    return s
  }
}
