import base,{MarketPortfolio} from './index-v19.js';
import {gettexSessionState} from './gettex-session.js';
export {MarketPortfolio};

const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const DASHBOARD_FIELDS=['config','equity','pnl','pnl_pct','positions','history','snapshots','candidates','newsRadar','sourceHealth','aiLog','statistics','risk','executionModel','futureWatch','marketRegime','investmentDossiers','intelligenceUpdatedAt','intelligenceModel','analysisNotice','pcAgent','pcFirstScannerPolicy','gettexSession','orderApproval','accounting','researchSignalFusionPolicy','comprehensiveOpportunityPolicy','calibratedActionScorePolicy','scannerBreadthPolicy','scoreHysteresisPolicy','entryProfitPolicy','dynamicProfitLockPolicy','finalDecisionPolicy'];

function partialPositionScore(p={}){const raw=clamp(num(p?.score),-3,3),conf=clamp(num(p?.signal_confidence,.5),0,1),entry=num(p?.entry_price),last=num(p?.last_price,entry),pnl=entry>0?(last/entry-1)*100:0;return +clamp(50+raw*5+(conf-.5)*20+clamp(pnl,-4,4)*1.2,25,70).toFixed(1)}
function addPositionScores(status={}){const source=status?.researchSignalFusionPolicy||status?.calibratedActionScorePolicy||status?.comprehensiveOpportunityPolicy||{},policy={...source,enabled:true,version:Math.max(28.7,num(source?.version,0)),scoreModel:source?.scoreModel||'V28.7 calibrated buy/hold/sell action score'},existing=new Map(arr(policy.positionScores).map(x=>[key(x),x]));policy.positionScores=arr(status?.positions).map(p=>existing.get(key(p))||{symbol:key(p),fusionScore:partialPositionScore(p),holdScore:partialPositionScore(p),sellScore:100-partialPositionScore(p),stage:'PARTIAL',source:'POSITION_PARTIAL',partial:true,parts:{},coverage:.34,at:Date.now()}).filter(x=>x.symbol);policy.positionScoreMeaning='V29.0: Haltescore hoch = Position attraktiv; Verkaufsscore hoch = Schwäche-/Rotationssignal. Dynamischer Gewinn-Lock kann einen Gewinner zusätzlich schon bei Haltescore 70–75 verkaufen, wenn Peak-Rücklauf und Momentum gemeinsam kippen. Teil-/Alt-Scores bleiben informativ und dürfen allein keinen automatischen SELL auslösen.';return policy}
function dashboardView(status={}){const out={};for(const k of DASHBOARD_FIELDS)if(status&&k in status)out[k]=status[k];out.researchSignalFusionPolicy=addPositionScores(status);const raw=status?.dayReplayLearning;if(raw){const report=raw.report||raw;out.dayReplayLearning={report:{status:report?.status??null,processed:report?.processed??null,summary:report?.summary??raw?.summary??null}}};if(Array.isArray(out.history)){out.historyTotal=out.history.length;out.history=out.history.slice(0,60);out.historyWindow=60};if(Array.isArray(out.aiLog)){out.aiLogTotal=out.aiLog.length;out.aiLog=out.aiLog.slice(0,40);out.aiLogWindow=40};return out}

export default{
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/api/agent/universe'&&request.method==='POST'){
   const r=await base.fetch(request,env,ctx);if(!r.ok)return r;const j=await r.json().catch(()=>null);if(!j)return r;
   j.scannerProfile={version:28.8,mode:'PC_FIRST_FULL_MASTER_STAGED',batchSize:80,shards:4,targetFullMasterCycleMinutes:4,stage2Target:400,deepTarget:120,finalistTarget:60,cloudflareValidationTarget:18,rule:'PC scannt den kompletten deduplizierten Aktien-Master. Cloudflare erhält nur verdichtete Finalisten und bleibt Sicherheits-/Paper-Ausführung plus Fallback.'};
   return Response.json(j,{headers:{'cache-control':'no-store','x-pc-scanner':'v28.8'}})
  }
  if(u.pathname==='/api/status'&&request.method==='GET'&&u.searchParams.get('view')==='dashboard'&&String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()!=='enabled'){
   try{const status=await portfolio(env).status(),payload=dashboardView(status);return Response.json(payload,{headers:{'cache-control':'private, no-cache','x-planspiel-ui':'v29.0','x-scan-cadence':'pc-minute+cloudflare-gap-fill','x-action-score':'buy-hold-sell-v29.0','x-entry-model':'scout-63+micro-65+early-68+regular-72','x-profit-model':'dynamic-peak-lock-v29.0','x-scanner-breadth':'pc-first-full-master-v288'}})}catch(e){return Response.json({error:String(e?.message||e)},{status:500,headers:{'cache-control':'no-store'}})}
  }
  return base.fetch(request,env,ctx)
 },
 async scheduled(controller,env,ctx){await base.scheduled?.(controller,env,ctx);const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when);if(!session.open)return;ctx.waitUntil((async()=>{const p=portfolio(env),s=await p.status(),last=Date.parse(String(s?.config?.last_scan||'')),age=Number.isFinite(last)?Date.now()-last:Infinity;if(age>95_000)await p.scan()})().catch(e=>console.error('V29.0 scan gap-fill failed',e)))}
};