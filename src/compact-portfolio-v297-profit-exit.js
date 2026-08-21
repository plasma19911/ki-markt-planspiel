import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v296-directional-position.js';
import {ProfitExitGuardV297,PROFIT_EXIT_V297} from './profit-exit-v297.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V29.7 keeps the V29.6 directional held-score repair and
// replaces the rigid positive +10 exit with a chart-profit/score ladder.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__profitExitV297){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new ProfitExitGuardV297(ai,{getState,storage:this.ctx?.storage});
      wrapped.__profitExitV297=true;this.profitExitV297=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.profitExitV297?.status?.()||{enabled:true,version:29.7,thresholds:PROFIT_EXIT_V297,positionScores:[],audit:{}};
    const by=new Map(arr(policy.positionScores).map(r=>[key(r),r]));
    s.positions=arr(s.positions).map(p=>{const r=by.get(key(p));if(!r)return p;return{...p,preProfitScore:p?.score,score:r.decisionScore,decisionScore:r.decisionScore,entryDecisionScore:r.entryDecisionScore,scoreDeltaFromEntry:r.scoreDeltaFromEntry,rawDecisionScore:r.rawDecisionScore,profitScoreCeiling:r.profitScoreCeiling,profitScoreDeltaThisScan:r.profitScoreDeltaThisScan,chartMoveFromEntryPct:r.chartMoveFromEntryPct,chartMoveLastScanPct:r.chartMoveLastScanPct,scoreSource:'V29.7_ADAPTIVE_PROFIT_SCORE'}});
    s.profitExitPolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),positionScores:policy.positionScores||[],profitExitAudit:policy.audit||{},positionScoreSource:'V29.7_ADAPTIVE_PROFIT_SCORE',positionBehaviorNote:'V29.7 verbindet echten Depotgewinn mit dem stabilen Positionsscore. Kleine Gewinne brauchen mehr Scoreverbesserung; größere Gewinne werden mit weniger Zusatzscore gesichert.'};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:29.7,authoritative:true,immediateBuyMin:56,adaptiveProfitExit:true,minProfitPct:PROFIT_EXIT_V297.minProfitPct,profitLadder:[{profitPct:.8,scoreDelta:10},{profitPct:2,scoreDelta:7},{profitPct:3.5,scoreDelta:4},{profitPct:5,scoreDelta:'Gewinn sichern, außer stark weiter steigend'}],highScoreTarget:PROFIT_EXIT_V297.highScoreTarget,negativeScoreExitDelta:-15};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.7,adaptiveProfitExit:true,rule:'V29.7: BUY weiterhin ab DecisionScore 56. Gewinnseite: unter +0,8% HOLD; ab +0,8% +10 Score, ab +2% +7, ab +3,5% +4. Bei hohen Einstiegsscores wird die nötige Verbesserung auf das erreichbare Ziel bis Score 99 reduziert. Ab +5% wird Gewinn gesichert, außer Score und Chart steigen gerade noch stark gemeinsam. Die richtungsabhängige -15-Schwächeregel aus V29.6 bleibt unverändert.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,profitExitV297:true,adaptiveProfitExit:true,minProfitPct:.8,profitLockPct:5,highScoreTarget:99};
    return s
  }
}
