import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v297-profit-exit.js';
import {GlobalFreeNewsGuardV298,GLOBAL_FREE_NEWS_V298} from './global-free-news-v298.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V29.8 enriches the existing DecisionScore with free,
// multilingual, deduplicated and freshness-weighted news. News changes the score;
// it is NOT a second soft BUY gate after DecisionScore >=56.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.env=env;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__globalFreeNewsV298){
   const getState=()=>{try{return this._actualState?.()||this.bucketAdapter?.peekState?.()||{}}catch{return{}}};
   const wrapped=new GlobalFreeNewsGuardV298(ai,{getState,storage:this.ctx?.storage});
   wrapped.__globalFreeNewsV298=true;this.globalFreeNewsV298=wrapped;this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status(),news=this.globalFreeNewsV298?.status?.()||{enabled:true,version:29.8,freeOnly:true,updatedAt:null,sourceHealth:[],symbols:[]},by=new Map(arr(news.symbols).map(x=>[key(x),x]));
  s.candidates=arr(s.candidates).map(c=>{const n=by.get(key(c));return n?{...c,news_score:n.news_score,newsScore:n.news_score,news_confidence:n.news_confidence,newsConfidence:n.news_confidence,latestNewsHeadline:n.headline,newsSources:n.sources,globalFreeNewsV298:true}:c});
  const freshRows=arr(news.symbols).filter(x=>x.headline).map(x=>({symbol:x.symbol,name:x.name,headline:x.headline,news_score:x.news_score,score:x.news_score,confidence:x.news_confidence,sources:x.sources,publishedAt:x.rows?.[0]?.publishedAt||news.updatedAt,language:x.rows?.[0]?.language||'',primary:Boolean(x.rows?.[0]?.primary),impactType:x.rows?.[0]?.impact?.type||'',impact:x.rows?.[0]?.impact?.impact||0,direction:x.rows?.[0]?.impact?.direction||0,freeNewsV298:true}));
  const old=new Map(arr(s.newsRadar).map(x=>[key(x),x]));for(const x of freshRows)old.set(key(x),{...(old.get(key(x))||{}),...x});s.newsRadar=[...old.values()];
  s.globalFreeNewsPolicy={...news,config:GLOBAL_FREE_NEWS_V298,authoritativeEffect:'NEWS_COMPONENT_OF_DECISION_SCORE',buyGate:'DecisionScore >=56 remains final',paidSources:false,multilingual:true,deduplicated:true,freshnessWeighted:true,primarySourcesFirst:true};
  const healthBy=new Map(arr(s.sourceHealth).map(x=>[String(x?.source||''),x]));for(const h of arr(news.sourceHealth)){const row={source:h.source,status:h.status,latency_ms:h.latencyMs,fail_count:h.status==='OK'?0:1,last_error:h.error||'',tier:h.tier,free:true};healthBy.set(row.source,row)}s.sourceHealth=[...healthBy.values()];
  s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),version:29.8,globalFreeNews:true,newsRule:'V29.8: kostenlose Primärquellen und GDELT werden mehrsprachig normalisiert, nach Alter/Quellenqualität gewichtet und dedupliziert. Das Ergebnis fließt als news_score in den DecisionScore ein. Keine zusätzliche BUY-Sperre oberhalb 56.'};
  s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:29.8,globalFreeNewsInScore:true,newsFreeOnly:true,newsFreshnessWeighted:true,newsDeduplicated:true,newsMultilingual:true,immediateBuyMin:56};
  if(s.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.8,globalFreeNewsInScore:true,freeNewsOnly:true,rule:`V29.8: ${GLOBAL_FREE_NEWS_V298.rule} Die V29.7 Gewinnleiter und die V29.6 Schwächelogik bleiben aktiv.`};
  if(s.executionModel)s.executionModel={...s.executionModel,globalFreeNewsV298:true,paidNewsSources:false,newsRefreshSeconds:GLOBAL_FREE_NEWS_V298.cacheSeconds};
  return s;
 }
}
