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
    s.candidates=(Array.isArray(s.candidates)?s.candidates:[]).map(c=>{const fresh=c?.quoteStale===true?false:Boolean(c?.fresh)&&c?.stale!==true;return{...c,fresh,stale:!fresh,quoteStale:!fresh}});
    const positions=Array.isArray(s.positions)?s.positions:[],stalePositions=positions.filter(p=>p?.price_stale===true||p?.quote_fresh===false||p?.quote_age_minutes==null);
    s.portfolioValuation={partiallyStale:stalePositions.length>0,stalePositionCount:stalePositions.length,totalPositionCount:positions.length,staleSymbols:stalePositions.map(p=>p.symbol),rule:'Depotwert enthält bei fehlenden Live-Kursen den letzten bekannten Kurs und ist dann ausdrücklich als teilweise veraltet markiert.'};
    s.scannerRuntime={mode:'CLOUDFLARE_WORKER_PRIMARY',targetIntervalMinutes:1,pcAgentRequired:false,pcAgentOptional:true,pcAgentOnline:Boolean(s?.pcAgent?.online),rule:'Der Cloudflare Worker scannt selbstständig. Ein ausgeschalteter PC-Agent ist kein Fehler und drosselt den Worker nicht.'};
    if(Array.isArray(s.history))s.history=s.history.slice(0,160);
    if(Array.isArray(s.snapshots))s.snapshots=s.snapshots.slice(-180);
    if(Array.isArray(s.newsRadar))s.newsRadar=s.newsRadar.slice(0,30);
    if(Array.isArray(s?.newsLearning?.events))s.newsLearning={...s.newsLearning,events:s.newsLearning.events.slice(-40)};
    s.payloadProfile={version:'31.7.35',historyLimit:160,snapshotLimit:180,newsRadarLimit:30,newsLearningEventLimit:40};
    return s;
  }
  async dashboardStatus(){return this._withPersistedLearningStatus(await super.dashboardStatus())}
  async status(){return this._withPersistedLearningStatus(await super.status())}
}
