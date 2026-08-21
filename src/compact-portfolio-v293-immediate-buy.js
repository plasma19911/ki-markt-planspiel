import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v290-entry-profit.js';
import {DecisionScoreGuardV293,DECISION_SCORE_V293} from './decision-score-v293.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V29.3 is the final score authority.
// New positions: DecisionScore >=56 => immediate BUY, with no additional soft blockers.
// The visible score is the same stabilized score that controls trading.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__decisionScoreV293){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DecisionScoreGuardV293(ai,{getState,storage:this.ctx?.storage});
      wrapped.__decisionScoreV293=true;this.decisionScoreV293=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.decisionScoreV293?.status?.()||{enabled:true,version:29.3,authoritative:true,immediateBuyMin:56,noSoftBuyBlocks:true,stability:DECISION_SCORE_V293,ranking:[],positionScores:[]};
    const by=new Map(arr(policy.ranking).map(r=>[key(r),r]));
    // Important: the dashboard used candidate.score directly. Replace that legacy/raw
    // field with the exact stabilized DecisionScore used for BUY so UI and trading agree.
    s.candidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,legacy_raw_score:c?.score,score:r.decisionScore,decisionScore:r.decisionScore,rawDecisionScore:r.rawDecisionScore,scoreDeltaRaw:r.scoreDeltaRaw,scoreDeltaStable:r.scoreDeltaStable,scoreSmoothed:r.scoreSmoothed,scoreSource:'V29.3_STABLE_DECISION'}});
    s.decisionScorePolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),version:29.3,behaviorVersion:29.3,authoritativeScore:'decisionScore',ranking:policy.ranking||[],positionScores:policy.positionScores||[],scoreLegend:[{min:56,label:'SOFORT KAUFEN'},{min:50,label:'Beobachten'},{min:0,label:'Kein Kauf'}],behaviorNote:'V29.3: derselbe stabilisierte 0-100-DecisionScore wird angezeigt und gehandelt. Ab 56 sofort BUY; keine weiche Zusatzsperre. Rohscore-Spruenge werden geglaettet.'};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),enabled:true,version:29.3,authoritative:true,immediateBuyMin:56,noSoftBuyBlocks:true,scoreStability:DECISION_SCORE_V293,legacyThresholdsSuperseded:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.3,authoritativeDecisionScore:true,immediateBuyFrom56:true,noSoftBuyBlocks:true,stableDecisionScore:true,legacyScoreThresholdsSuperseded:true,rule:'V29.3: DecisionScore <56 = kein neuer BUY; DecisionScore >=56 = sofort BUY. Keine Momentum-/News-/FOMO-/Coverage-/Trend-/Mehrfachscan-Bremse nach der Scoreberechnung. Anzeige und Handel nutzen denselben geglaetteten Score.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,decisionScoreV293:true,immediateBuyFrom56:true,stableDecisionScore:true};
    return s
  }
}
