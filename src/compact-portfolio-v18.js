import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v17.js';
import {reconcileLearningWithExecutedPositions,getLearningExecutionReconcileStatus} from './live-learning-execution-reconcile.js';

// V18 closes a learning-only gap: the fast layer may propose BUY before Pullback,
// venue, cost and execution guards run. Only positions that really exist afterwards
// are allowed to keep a pending entry-timing sample.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env}
  _actualPositions(){try{return this.bucketAdapter?.peekState?.()?.positions||[]}catch{return[]}}
  async scan(){
    // Clear proposals left by earlier scans before they can be mistaken for a later trade.
    const before=reconcileLearningWithExecutedPositions(this.ctx?.storage,this._actualPositions());
    const result=await super.scan();
    // This is the authoritative reconciliation point: downstream guards and paper
    // execution have already run, so only truly held symbols may remain pending.
    const after=reconcileLearningWithExecutedPositions(this.ctx?.storage,this._actualPositions());
    if(result&&typeof result==='object')result.learningExecutionReconcile={before,after};
    return result;
  }
  async status(){
    let s=await super.status();
    reconcileLearningWithExecutedPositions(this.ctx?.storage,s?.positions||this._actualPositions());
    s.learningExecutionReconcile=getLearningExecutionReconcileStatus(this.ctx?.storage);
    if(s.entryTimingLearning)s.entryTimingLearning={...s.entryTimingLearning,pendingOnlyForExecutedPositions:true,pendingExecutionTtlMinutes:8,proposalContaminationFixed:true};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,learningOnlyFromExecutedEntries:true};
    return s;
  }
}
