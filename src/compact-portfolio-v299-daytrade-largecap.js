import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v297-profit-exit.js';
import {DaytradeLargeCapGuardV299,DAYTRADE_LARGECAP_V299,marketCapBiasV299,marketCapUsdV299} from './daytrade-largecap-v299.js';

const BROAD_KEY='cache/v287-broad-leaders';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

function chanceLabel(score){return score>=70?'SEHR STARK':score>=62?'STARK':score>=56?'GUT':score>=50?'MITTEL':'SCHWACH'}
function rerankBroadPool(pool=[]){
  return arr(pool).map((x,i)=>{const size=marketCapBiasV299(x),base=num(x?.pcDeepScore,num(x?.broadLeaderScore)*10),rankScore=base+size.points;return{...x,preLargeCapBroadRank:i+1,daytradeMarketCapUSD:size.marketCapUSD,daytradeMarketCapPoints:size.points,daytradeSizeTier:size.tier,daytradeBroadScore:+rankScore.toFixed(2)}})
    .sort((a,b)=>b.daytradeBroadScore-a.daytradeBroadScore||num(a.preLargeCapBroadRank)-num(b.preLargeCapBroadRank))
    .map((x,i)=>({...x,broadLeaderRank:i+1,broadLeaderScore:+(x.daytradeBroadScore/10).toFixed(3)}));
}

// PAPER-TRADING ONLY. V29.9 makes the candidate stream more suitable for daytrading:
// the BUY threshold remains 56, but company size is now part of the authoritative
// candidate score and the PC-first leader pool is re-ranked toward larger companies.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__daytradeLargeCapV299){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DaytradeLargeCapGuardV299(ai,{getState,storage:this.ctx?.storage});
      wrapped.__daytradeLargeCapV299=true;this.daytradeLargeCapV299=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async _storePcFirst(pc){
    const out=await super._storePcFirst(pc);if(!out?.broad?.pool?.length)return out;
    const pool=rerankBroadPool(out.broad.pool),broad={...out.broad,version:29.9,pool,resolved:pool.length,mode:'PC_FIRST_DAYTRADE_LARGECAP_TOP60',largeCapPreference:true};
    try{this.ctx?.storage?.kv?.put(BROAD_KEY,broad)}catch{}
    return{...out,broad};
  }
  async status(){
    const s=await super.status(),policy=this.daytradeLargeCapV299?.status?.()||{enabled:true,version:29.9,ranking:[],config:DAYTRADE_LARGECAP_V299};
    const by=new Map(arr(policy.ranking).map(r=>[key(r),r]));
    const rankedCandidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,preDaytradeDecisionScore:r.preDaytradeDecisionScore,score:r.daytradeDecisionScore,decisionScore:r.daytradeDecisionScore,daytradeDecisionScore:r.daytradeDecisionScore,daytradeMarketCapPoints:r.daytradeMarketCapPoints,daytradeSizeTier:r.daytradeSizeTier,daytradeSizeLabel:r.daytradeSizeLabel,marketCapUSD:r.marketCapUSD,scoreSource:'V29.9_DAYTRADE_LARGECAP_DECISION'}}).sort((a,b)=>num(b.daytradeDecisionScore,b.score)-num(a.daytradeDecisionScore,a.score));
    const preferred=rankedCandidates.filter(c=>{const cap=marketCapUsdV299(c),score=num(c.daytradeDecisionScore,c.score);return !(cap>0)||cap>=DAYTRADE_LARGECAP_V299.preferredVisibleMinMarketCapUSD||score>=DAYTRADE_LARGECAP_V299.exceptionalSmallCapScore});
    s.candidates=(preferred.length>=4?preferred:rankedCandidates).slice(0,DAYTRADE_LARGECAP_V299.visibleCandidateTarget);
    s.positions=arr(s.positions).map(p=>{const score=clamp(num(p?.decisionScore,p?.score),0,100);return{...p,daytradeChanceScore:+score.toFixed(1),daytradeChanceLabel:chanceLabel(score)}}).sort((a,b)=>num(b.daytradeChanceScore)-num(a.daytradeChanceScore)||num(b.chartMoveLastScanPct)-num(a.chartMoveLastScanPct)).map((p,i)=>({...p,daytradeChanceRank:i+1}));
    s.daytradeLargeCapPolicy={...policy,visibleCandidateTarget:DAYTRADE_LARGECAP_V299.visibleCandidateTarget,preferredVisibleMinMarketCapUSD:DAYTRADE_LARGECAP_V299.preferredVisibleMinMarketCapUSD,pcFirstBroadPoolReRanked:true,portfolioSortedBestChanceFirst:true};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:29.9,authoritative:true,immediateBuyMin:56,marketCapScoreInput:true,largeCapDaytradePreference:true,smallCapsNeedStrongerSignals:true,portfolioChanceSort:true};
    if(s?.scannerBreadthPolicy)s.scannerBreadthPolicy={...s.scannerBreadthPolicy,version:29.9,largeCapPreference:true,mode:`${s.scannerBreadthPolicy.mode||'PC-FIRST'} · V29.9 re-rankt Finalisten nach Intraday-Score plus Unternehmensgröße; große Werte werden bevorzugt, kleine nicht vollständig verboten.`};
    if(s?.pcFirstScannerPolicy)s.pcFirstScannerPolicy={...s.pcFirstScannerPolicy,version:29.9,largeCapPreference:true,largeCapBroadPoolReRank:true,visibleCandidateTarget:DAYTRADE_LARGECAP_V299.visibleCandidateTarget};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.9,daytradeLargeCapPreference:true,portfolioSortedByChance:true,rule:'V29.9: BUY-Schwelle bleibt 56. Unternehmensgröße fließt direkt in den DecisionScore ein: Large-/Mega-Caps werden für Daytrading bevorzugt, Small-/Micro-Caps brauchen stärkere Intraday-Signale. Im Depot stehen die aktuell stärksten Chancen zuerst.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,daytradeLargeCapV299:true,marketCapScoreInput:true,largeCapPreference:true,portfolioChanceSort:true};
    return s;
  }
}
