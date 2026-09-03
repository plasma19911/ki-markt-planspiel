import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v310-agent-recovery.js';
import {refreshNewsCatalystsV31710,applyNewsCatalystSnapshotV31710,NewsCatalystGuardV31710,NEWS_CATALYST_V31710} from './news-catalyst-v31710.js';
import {PAPER_START_PERSISTENCE_V31711,hasExistingPaperRunV31711,durationMinutesV31711,existingRunSnapshotV31711} from './paper-start-persistence-v31711.js';

const arr=v=>Array.isArray(v)?v:[];

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    this.__newsCatalystV31710={enabled:true,...NEWS_CATALYST_V31710,updatedAt:null,targets:0,lookups:0,symbols:[],refreshError:null};
    this.__startPersistenceV31711={...PAPER_START_PERSISTENCE_V31711,lastAction:null};
    const unified=this.unifiedDecisionCoreV310;
    if(unified?.inner&&!unified.inner.__newsCatalystV31710){
      const getState=()=>{try{return this._actualState?.()||this.bucketAdapter?.peekState?.()||{}}catch{return{}}};
      const guard=new NewsCatalystGuardV31710(unified.inner,{getState});guard.__newsCatalystV31710=true;unified.inner=guard;this.newsCatalystGuardV31710=guard;
    }
  }

  async start(options={}){
    // /api/start is also used as an "ensure running" call by clients. The legacy
    // R2Portfolio.start() creates a brand-new default state every time, which means
    // a reconnect after a Worker deploy could erase positions/history/P&L. Once a
    // real paper run exists we therefore RESUME it. A deliberate new game still
    // uses the explicit /api/reset endpoint first.
    let loaded=null;try{loaded=await this.engine?.store?.load?.(true)}catch{}
    const existing=loaded?.state||null;
    if(existing&&hasExistingPaperRunV31711(existing)&&options?.forceNewRun!==true){
      const snap=existingRunSnapshotV31711(existing),now=Date.now(),oldEnd=Date.parse(String(existing?.config?.ends_at||'')),expired=Number.isFinite(oldEnd)&&oldEnd<=now;
      if((!snap.running||expired)&&this.engine?.store?.update){
        await this.engine.store.update(s=>{s.config.running=1;s.config.scan_lock_until=0;if(expired)s.config.ends_at=new Date(now+durationMinutesV31711(options)*60000).toISOString();return true});
      }
      this.__startPersistenceV31711={...PAPER_START_PERSISTENCE_V31711,lastAction:'RESUME_EXISTING',at:new Date().toISOString(),wasRunning:snap.running,scanCount:snap.scanCount,positionCount:snap.positions,historyCount:snap.history};
      return{ok:true,alreadyStarted:true,resumed:!snap.running||expired,preservedPaperState:true,scanCount:snap.scanCount,positions:snap.positions,startCapital:snap.startCapital,cash:snap.cash};
    }
    const result=await super.start(options);this.__startPersistenceV31711={...PAPER_START_PERSISTENCE_V31711,lastAction:'NEW_RUN',at:new Date().toISOString()};return{...result,preservedPaperState:false};
  }

  async _refreshNewsCatalystBeforeScan(){
    try{
      const state=this._actualState?.()||this.bucketAdapter?.peekState?.()||{},snapshot=await refreshNewsCatalystsV31710(state,Date.now());this.__newsCatalystV31710={...snapshot,refreshError:null};
      if(this.engine?.store?.update&&arr(snapshot?.symbols).some(x=>x?.headline)){
        await this.engine.store.update(s=>{applyNewsCatalystSnapshotV31710(s,snapshot);return{applied:arr(snapshot?.symbols).filter(x=>x?.headline).length}});
      }
      return snapshot;
    }catch(e){this.__newsCatalystV31710={...this.__newsCatalystV31710,updatedAt:new Date().toISOString(),refreshError:String(e?.message||e).slice(0,300)};return this.__newsCatalystV31710}
  }

  async scan(){await this._refreshNewsCatalystBeforeScan();return await super.scan()}

  _withNewsCatalystStatus(s={}){
    const guard=this.newsCatalystGuardV31710?.status?.()||{enabled:true,...NEWS_CATALYST_V31710,insideUnifiedAuthority:true,decisionAuthority:false};
    s.newsCatalystPolicy={...guard,updatedAt:this.__newsCatalystV31710?.updatedAt||null,targets:this.__newsCatalystV31710?.targets||0,lookups:this.__newsCatalystV31710?.lookups||0,refreshError:this.__newsCatalystV31710?.refreshError||null,symbols:arr(this.__newsCatalystV31710?.symbols).map(x=>({symbol:x.symbol,headline:x.headline,eventType:x.eventType,direction:x.direction,impact:x.impact,publishedAt:x.publishedAt,ageMinutes:x.ageMinutes,newsScore:x.newsScore,confidence:x.confidence,sources:x.sources,positiveConfirmed:x.positiveConfirmed,negativeConfirmed:x.negativeConfirmed,chaseRisk:x.chaseRisk,error:x.error||null})).slice(0,10)};
    s.paperStartPersistence={...this.__startPersistenceV31711,idempotentStart:true,explicitResetRequiredForNewRun:true};
    s.executionModel={...(s.executionModel||{}),freshNewsCatalystV31710:true,newsRequiresMarketReaction:true,newsAloneCannotBuy:true,negativeCatalystExitConfirmation:true,idempotentPaperStartV31711:true};
    if(s.architecture)s.architecture={...s.architecture,internalDecisionPasses:[...arr(s.architecture.internalDecisionPasses).filter(x=>!String(x).includes('V31.7.10')),'V31.7.10 fresh-news catalyst proposal inside unified authority'],paperStateSurvivesRepeatedStart:true};
    return s;
  }
  async dashboardStatus(){return this._withNewsCatalystStatus(await super.dashboardStatus())}
  async status(){return this._withNewsCatalystStatus(await super.status())}
}
