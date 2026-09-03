import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v31710-news-catalyst.js';
import {persistedOutcomeStatusV31712,PERSISTED_LEARNING_STATUS_V31712} from './persisted-learning-status-v31712.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env}

  async _withPersistedLearningStatus(s={}){
    let memory={};try{memory=await this.ctx?.storage?.get?.(PERSISTED_LEARNING_STATUS_V31712.storageKey)||{}}catch{}
    const candidates=Array.isArray(s?.candidates)?s.candidates:[];
    const current=s?.outcomeLearningPolicy||s?.predictiveLearningPolicy||s?.unifiedDecisionCorePolicy?.outcomeLearning||{};
    const restored=persistedOutcomeStatusV31712(memory,candidates,current,Date.now());
    s.outcomeLearningPolicy={...(s.outcomeLearningPolicy||{}),...restored,insideUnifiedAuthority:true};
    s.predictiveLearningPolicy={...(s.predictiveLearningPolicy||{}),...restored,insideUnifiedAuthority:true};
    if(s.unifiedDecisionCorePolicy){
      s.unifiedDecisionCorePolicy={...s.unifiedDecisionCorePolicy,outcomeLearning:{...(s.unifiedDecisionCorePolicy.outcomeLearning||{}),...restored},predictiveLearning:{...(s.unifiedDecisionCorePolicy.predictiveLearning||{}),...restored}};
    }
    s.learningStateRecovery={enabled:true,...PERSISTED_LEARNING_STATUS_V31712,persistedMemoryRecovered:restored.persistedMemoryRecovered,trackedSymbols:restored.trackedSymbols,currentCandidates:restored.currentCandidates,matured:restored.matured,rule:'Nach Worker-Neustarts zeigt der Status sofort den persistenten Outcome-Speicher plus die aktuell gespeicherten Kandidaten statt eines leeren In-Memory-Defaults. Die eigentliche Unified-Handelsentscheidung liest denselben persistenten Speicher.'};
    s.executionModel={...(s.executionModel||{}),persistedOutcomeStatusRecoveryV31712:true};
    return s;
  }
  async dashboardStatus(){return this._withPersistedLearningStatus(await super.dashboardStatus())}
  async status(){return this._withPersistedLearningStatus(await super.status())}
}
