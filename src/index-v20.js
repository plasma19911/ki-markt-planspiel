import base,{MarketPortfolio} from './index-v19.js';
import {gettexSessionState} from './gettex-session.js';
export {MarketPortfolio};

const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
// Keep the dashboard response light, but never strip the currently authoritative
// runtime/decision policies. Deploy verification and the UI must see the same
// V30.x policy state that the full /api/status endpoint exposes.
const DASHBOARD_FIELDS=['runtimeVersion','liveDecisionVersion','config','equity','pnl','pnl_pct','positions','history','snapshots','candidates','newsRadar','sourceHealth','aiLog','statistics','risk','executionModel','futureWatch','marketRegime','investmentDossiers','intelligenceUpdatedAt','intelligenceModel','analysisNotice','pcAgent','pcFirstScannerPolicy','scannerScorePipelinePolicy','gettexSession','orderApproval','accounting','researchSignalFusionPolicy','comprehensiveOpportunityPolicy','calibratedActionScorePolicy','scannerBreadthPolicy','scoreHysteresisPolicy','entryProfitPolicy','dynamicProfitLockPolicy','profitExitPolicy','canonicalScorePolicy','finalDecisionPolicy','daytradeLargeCapPolicy','daytradeDipPolicy','daytradeEntryPolicy','daytradeLiveFeedbackPolicy','systemValidationPolicy'];

function partialPositionScore(p={}){const raw=clamp(num(p?.score),-3,3),conf=clamp(num(p?.signal_confidence,.5),0,1),entry=num(p?.entry_price),last=num(p?.last_price,entry),pnl=entry>0?(last/entry-1)*100:0;return +clamp(50+raw*5+(conf-.5)*20+clamp(pnl,-4,4)*1.2,25,70).toFixed(1)}
function addPositionScores(status={}){const source=status?.researchSignalFusionPolicy||status?.calibratedActionScorePolicy||status?.comprehensiveOpportunityPolicy||{},policy={...source,enabled:true,version:Math.max(28.7,num(source?.version,0)),scoreModel:source?.scoreModel||'V28.7 calibrated buy/hold/sell action score'},existing=new Map(arr(policy.positionScores).map(x=>[key(x),x]));policy.positionScores=arr(status?.positions).map(p=>existing.get(key(p))||{symbol:key(p),fusionScore:partialPositionScore(p),holdScore:partialPositionScore(p),sellScore:100-partialPositionScore(p),stage:'PARTIAL',source:'POSITION_PARTIAL',partial:true,parts:{},coverage:.34,at:Date.now()}).filter(x=>x.symbol);policy.positionScoreMeaning='V29.1: Haltescore 62+ stark halten, 58–61 halten, 53–57 halten/beobachten, 50–52 Achtung, 46–49 Verkauf beobachten, <=45 nur bestätigt verkaufen, <=32 dringender Score-Exit nach Mindestalter. Dynamischer Gewinn-Lock ist separat und kann Gewinner bei Haltescore 70–75 sichern, wenn Peak-Rücklauf und Momentum gemeinsam kippen. Teil-/Alt-Scores dürfen allein keinen automatischen SELL auslösen.';return policy}
function dashboardView(status={}){const out={};for(const k of DASHBOARD_FIELDS)if(status&&k in status)out[k]=status[k];out.researchSignalFusionPolicy=addPositionScores(status);const raw=status?.dayReplayLearning;if(raw){const report=raw.report||raw;out.dayReplayLearning={report:{status:report?.status??null,processed:report?.processed??null,summary:report?.summary??raw?.summary??null}}};if(Array.isArray(out.history)){out.historyTotal=out.history.length;out.history=out.history.slice(0,60);out.historyWindow=60};if(Array.isArray(out.aiLog)){out.aiLogTotal=out.aiLog.length;out.aiLog=out.aiLog.slice(0,40);out.aiLogWindow=40};return out}

export default{
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/api/agent/universe'&&request.method==='POST'){
   const r=await base.fetch(request,env,ctx);if(!r.ok)return r;const j=await r.json().catch(()=>null);if(!j)return r;
   j.scannerProfile={version:29.2,mode:'PC_FIRST_FULL_MASTER_STAGED',batchSize:80,shards:4,targetFullMasterCycleMinutes:4,preScoreTarget:'ALL_RECEIVED_FRESH_ROWS',stage2Target:400,deepTarget:240,finalistTarget:60,cloudflareValidationTarget:18,rule:'PC bewertet jeden empfangenen frischen Vollscan-Wert leicht mit 0–100 vor, danach Top400 → Deep240 → Final60. Cloudflare erhält nur verdichtete Finalisten und bleibt Research-/Safety-/Paper-Ausführung plus Fallback.'};
   return Response.json(j,{headers:{'cache-control':'no-store','x-pc-scanner':'v29.2','x-pc-score-pipeline':'all-pre-score+top400+deep240+final60'}})
  }
  if(u.pathname==='/api/status'&&request.method==='GET'&&u.searchParams.get('view')==='dashboard'&&String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()!=='enabled'){
   try{const status=await portfolio(env).status(),payload=dashboardView(status);return Response.json(payload,{headers:{'cache-control':'private, no-cache','x-planspiel-ui':'v30.3','x-scan-cadence':'pc-minute+cloudflare-gap-fill','x-action-score':'decision-score-56-v30.3-system','x-entry-model':'v30.2-live-feedback+v30.1-fresh-tape+v30.0-dips','x-position-model':'v29.7-profit+v29.6-directional-held-score','x-profit-model':'adaptive-profit-v29.7','x-scanner-breadth':'all-pc-pre-score+top400+deep240+final60+cf18'}})}catch(e){return Response.json({error:String(e?.message||e)},{status:500,headers:{'cache-control':'no-store'}})}
  }
  return base.fetch(request,env,ctx)
 },
 async scheduled(controller,env,ctx){await base.scheduled?.(controller,env,ctx);const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when);if(!session.open)return;ctx.waitUntil((async()=>{const p=portfolio(env),s=await p.status(),last=Date.parse(String(s?.config?.last_scan||'')),age=Number.isFinite(last)?Date.now()-last:Infinity;if(age>95_000)await p.scan()})().catch(e=>console.error('V30.3 scan gap-fill failed',e)))}
};