import base,{MarketPortfolio} from './index-v19.js';
import {tradeRepublicSessionState} from './gettex-session.js';
export {MarketPortfolio};

const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const DASHBOARD_FIELDS=['config','equity','pnl','pnl_pct','positions','history','snapshots','candidates','newsRadar','sourceHealth','aiLog','statistics','risk','executionModel','futureWatch','marketRegime','investmentDossiers','intelligenceUpdatedAt','intelligenceModel','analysisNotice','pcAgent','pcFirstScannerPolicy','scannerScorePipelinePolicy','gettexSession','tradeRepublicSession','brokerTarget','orderApproval','accounting','researchSignalFusionPolicy','comprehensiveOpportunityPolicy','calibratedActionScorePolicy','scannerBreadthPolicy','scoreHysteresisPolicy','entryProfitPolicy','dynamicProfitLockPolicy','profitExitPolicy','canonicalScorePolicy','finalDecisionPolicy'];

function partialPositionScore(p={}){const raw=clamp(num(p?.score),-3,3),conf=clamp(num(p?.signal_confidence,.5),0,1),entry=num(p?.entry_price),last=num(p?.last_price,entry),pnl=entry>0?(last/entry-1)*100:0;return +clamp(50+raw*5+(conf-.5)*20+clamp(pnl,-4,4)*1.2,25,70).toFixed(1)}
function addPositionScores(status={}){const source=status?.profitExitPolicy||status?.researchSignalFusionPolicy||status?.calibratedActionScorePolicy||status?.comprehensiveOpportunityPolicy||{},policy={...source,enabled:true,version:Math.max(29.7,num(source?.version,0)),scoreModel:source?.scoreModel||'V29.7 DecisionScore / adaptive profit score'},existing=new Map(arr(policy.positionScores).map(x=>[key(x),x]));policy.positionScores=arr(status?.positions).map(p=>existing.get(key(p))||{symbol:key(p),fusionScore:partialPositionScore(p),holdScore:partialPositionScore(p),sellScore:100-partialPositionScore(p),stage:'PARTIAL',source:'POSITION_PARTIAL',partial:true,parts:{},coverage:.34,at:Date.now()}).filter(x=>x.symbol);policy.positionScoreMeaning='V29.7: Neue Käufe ab DecisionScore 56 sofort, sofern kein harter Safety-/Broker-Block besteht. Gehaltene Positionen werden relativ zum Einstiegsscore und zum echten Depotchart bewertet; die normale Schwäche-Regel liegt bei -15 Scorepunkten und braucht einen negativen Chart. Gewinn-SELL gestaffelt ab +0,8 % Chartgewinn; ab +5 % wird Gewinn gesichert, außer Score und Chart steigen noch stark gemeinsam.';return policy}
function dashboardView(status={}){const out={};for(const k of DASHBOARD_FIELDS)if(status&&k in status)out[k]=status[k];const session=status?.tradeRepublicSession||status?.gettexSession;if(session){out.tradeRepublicSession={...session,broker:'Trade Republic'};out.gettexSession=out.tradeRepublicSession}out.brokerTarget={id:'TRADE_REPUBLIC',name:'Trade Republic',venue:'Bestpreis',weekdayHours:'07:30–23:00',stocksOnly:true,regularOrderFeeEur:1,exactCatalogSynced:true,...(status?.brokerTarget||{})};out.researchSignalFusionPolicy=addPositionScores(status);const raw=status?.dayReplayLearning;if(raw){const report=raw.report||raw;out.dayReplayLearning={report:{status:report?.status??null,processed:report?.processed??null,summary:report?.summary??raw?.summary??null}}};if(Array.isArray(out.history)){out.historyTotal=out.history.length;out.history=out.history.slice(0,60);out.historyWindow=60};if(Array.isArray(out.aiLog)){out.aiLogTotal=out.aiLog.length;out.aiLog=out.aiLog.slice(0,40);out.aiLogWindow=40};return out}
function jsonResponse(payload,status=200,headers={}){return Response.json(payload,{status,headers:{'cache-control':'no-store',...headers}})}

export default{
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/api/agent/universe'&&request.method==='POST'){
   const r=await base.fetch(request,env,ctx);if(!r.ok)return r;const j=await r.json().catch(()=>null);if(!j)return r;
   if(j.exactBrokerCatalog!==true)return jsonResponse({error:'Trade-Republic-Aktienmaster ist nicht als exakter Broker-Katalog verifiziert.',brokerTarget:'Trade Republic',failClosed:true},503);
   j.brokerTarget='Trade Republic';j.assetClass='EQUITY_ONLY';j.stocksOnly=true;j.equities=arr(j.equities).map(x=>({...x,brokerVerified:true,brokerTarget:'Trade Republic',assetClass:'EQUITY'}));
   j.scannerProfile={version:29.8,mode:'PC_FIRST_FULL_MASTER_STAGED',brokerTarget:'TRADE_REPUBLIC',exactBrokerCatalog:true,batchSize:80,shards:4,targetFullMasterCycleMinutes:4,preScoreTarget:'ALL_RECEIVED_FRESH_ROWS',stage2Target:400,deepTarget:240,finalistTarget:60,cloudflareValidationTarget:18,rule:'Nur konservativ bestätigte Trade-Republic-Aktien. PC bewertet jeden empfangenen frischen Vollscan-Wert leicht mit 0–100 vor, danach Top400 → Deep240 → Final60. Cloudflare erhält verdichtete Finalisten und bleibt Research-/Safety-/Paper-Ausführung plus Fallback.'};
   return Response.json(j,{headers:{'cache-control':'no-store','x-pc-scanner':'v29.8-tr','x-pc-score-pipeline':'all-pre-score+top400+deep240+final60','x-broker-target':'trade-republic'}})
  }
  if(u.pathname==='/api/status'&&request.method==='GET'&&u.searchParams.get('view')==='dashboard'&&String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()!=='enabled'){
   try{const status=await portfolio(env).status(),payload=dashboardView(status);return Response.json(payload,{headers:{'cache-control':'private, no-cache','x-planspiel-ui':'v29.8-tr-audit','x-scan-cadence':'pc-minute+cloudflare-gap-fill','x-action-score':'decision-score-v29.7','x-entry-model':'decision-score-56-immediate-buy','x-position-model':'directional-minus15-v29.7','x-profit-model':'adaptive-profit-ladder-v29.7','x-broker-target':'trade-republic-bestpreis','x-scanner-breadth':'tr-exact+all-pc-pre-score+top400+deep240+final60+cf18'}})}catch(e){return Response.json({error:String(e?.message||e)},{status:500,headers:{'cache-control':'no-store'}})}
  }
  if(u.pathname==='/api/start'&&request.method==='POST'){
   const r=await base.fetch(request,env,ctx);if(!r.ok)return r;const j=await r.json().catch(()=>null);if(!j)return r;
   return jsonResponse({...j,assetClass:'nur Aktien',targetBroker:'Trade Republic · Bestpreis',brokerExecution:'Bestpreis · 1 € Abwicklungspauschale je Trade',brokerTradingHours:'Mo–Fr 07:30–23:00',brokerCatalog:'konservativ gegen offizielles Trade-Republic Trading Universe verifiziert'},r.status,{'x-broker-target':'trade-republic-bestpreis'});
  }
  return base.fetch(request,env,ctx)
 },
 async scheduled(controller,env,ctx){await base.scheduled?.(controller,env,ctx);const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=tradeRepublicSessionState(when);if(!session.open)return;ctx.waitUntil((async()=>{const p=portfolio(env),s=await p.status(),last=Date.parse(String(s?.config?.last_scan||'')),age=Number.isFinite(last)?Date.now()-last:Infinity;if(age>95_000)await p.scan()})().catch(e=>console.error('V29.8 Trade-Republic scan gap-fill failed',e)))}
};