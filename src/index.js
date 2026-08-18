// Production entry: stocks-only paper trading plus prepared human approval workflow.
// Real broker dispatch remains disabled until an official connector is explicitly added.
import './yahoo-spark-repair.js';
import {MarketPortfolio} from './compact-portfolio-v11.js';
import {gettexSessionState} from './gettex-session.js';
import {verifyCloudflareAccess} from './access-auth.js';
export {MarketPortfolio};

const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'cache-control':'no-store'}});
const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');
const approvalMode=env=>String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()==='enabled';
const enc=new TextEncoder();
async function tokenEqual(a,b){
 const [da,db]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(String(a||''))),crypto.subtle.digest('SHA-256',enc.encode(String(b||'')))]),aa=new Uint8Array(da),bb=new Uint8Array(db);let diff=aa.length^bb.length;for(let i=0;i<Math.min(aa.length,bb.length);i++)diff|=aa[i]^bb[i];return diff===0;
}
async function verifyPcAgent(request,env){
 const expected=String(env?.PC_AGENT_TOKEN||'');if(!expected)return{ok:false,status:503,error:'PC_AGENT_TOKEN ist in Cloudflare noch nicht eingerichtet.'};
 const auth=String(request.headers.get('authorization')||''),token=auth.replace(/^Bearer\s+/i,'').trim();if(!token||!(await tokenEqual(token,expected)))return{ok:false,status:401,error:'Windows-PC-Agent nicht autorisiert.'};
 return{ok:true};
}

async function agentUniverseData(env,requestUrl){
 const assetUrl=new URL('/universe.json',requestUrl),r=await env.ASSETS.fetch(new Request(assetUrl.toString()));
 if(!r.ok)return{error:`Aktien-Master nicht verfügbar (HTTP ${r.status}).`,status:502};
 const j=await r.json().catch(()=>null);if(!j||!Array.isArray(j.equities))return{error:'Aktien-Master enthält keine Equity-Liste.',status:502};
 const blocked=s=>/\.(?:V|NE|PK|OB)$/i.test(String(s||'').toUpperCase());
 const equities=[];
 for(const x of j.equities){
  const symbol=String(x?.symbol||'').trim().toUpperCase();if(!symbol||symbol.length>32||blocked(symbol))continue;
  const cap=Number(x?.marketCapUSD??x?.marketCap??0);if(Number.isFinite(cap)&&cap>0&&cap<150_000_000)continue;
  equities.push({symbol,name:String(x?.name||symbol).slice(0,120),currency:x?.currency||null,marketCapUSD:Number.isFinite(cap)&&cap>0?cap:null});
 }
 return{ok:true,updatedAt:new Date().toISOString(),generatedAt:j.generated_at||null,exactBrokerCatalog:Boolean(j.exact_broker_catalog),count:equities.length,equities};
}

async function freeTierAppJs(request,env){
 const r=await env.ASSETS.fetch(request);if(!r.ok)return r;
 let text=await r.text();
 text=text
  .replace(/LÄUFT · 60 SEKUNDEN/g,'LÄUFT · 1-MIN-SCAN')
  .replace(/Aktien und normale ETFs/g,'nur Aktien')
  .replace(/Aktien \+ normale ETFs/g,'nur Aktien')
  .replace(/includeEtfs:true/g,'includeEtfs:false')
  .replace(/setInterval\(load,5000\)/g,'setInterval(load,60000)');
 const h=new Headers(r.headers);h.set('content-type','text/javascript; charset=utf-8');h.set('cache-control','public, max-age=300');
 return new Response(text,{status:r.status,headers:h});
}

async function positionChartData(p,u){
 const symbol=String(u.searchParams.get('symbol')||'').trim().toUpperCase();
 if(!symbol||symbol.length>32)return{error:'Ungültiges Aktiensymbol.',status:400};
 const rangeRaw=String(u.searchParams.get('range')||'1d'),range=['1d','5d','1mo'].includes(rangeRaw)?rangeRaw:'1d',interval=range==='1d'?'5m':range==='5d'?'15m':'60m';
 const s=await p.status(),positions=s?.positions||[],history=s?.history||[],pos=positions.find(x=>String(x?.symbol||'').toUpperCase()===symbol)||null,events=history.filter(x=>String(x?.symbol||'').toUpperCase()===symbol&&['KAUF','VERKAUF','BUY','SELL'].includes(String(x?.action||'').toUpperCase()));
 if(!pos&&!events.length)return{error:'Dieses Symbol wurde im Planspiel noch nicht gehandelt.',status:404};
 const q=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);q.searchParams.set('range',range);q.searchParams.set('interval',interval);q.searchParams.set('includePrePost','false');q.searchParams.set('events','div,splits');
 const r=await fetch(q,{headers:{'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/TradeChart)'}});if(!r.ok)return{error:`Kurschart derzeit nicht verfügbar (HTTP ${r.status}).`,status:502};
 const j=await r.json(),res=j?.chart?.result?.[0];if(!res)return{error:'Kurschart enthält keine Daten.',status:502};
 const ts=res.timestamp||[],close=res?.indicators?.quote?.[0]?.close||[],bars=[];for(let i=0;i<ts.length;i++){const c=Number(close[i]);if(Number.isFinite(c)&&c>0)bars.push({ts:Number(ts[i])*1000,close:c})}
 if(!bars.length)return{error:'Für den gewählten Zeitraum liegen keine Kursbalken vor.',status:502};
 const name=pos?.name||events.find(x=>x?.name)?.name||res?.meta?.longName||res?.meta?.shortName||symbol,entryPrice=Number(pos?.entry_price||0),openedAt=pos?.opened_at||events.find(x=>['KAUF','BUY'].includes(String(x?.action||'').toUpperCase()))?.ts||null;
 const normalizedEvents=events.map(x=>{const action=['KAUF','BUY'].includes(String(x?.action||'').toUpperCase())?'KAUF':'VERKAUF';let price=Number(x?.price||x?.execution_price||0)||null;if(action==='KAUF'&&entryPrice>0&&openedAt&&Math.abs(Date.parse(x.ts)-Date.parse(openedAt))<10*60*1000)price=entryPrice;return{ts:x.ts,action,price,amount:Number(x?.amount||0),reason:String(x?.reason||'').slice(0,240)}}).filter(x=>x.ts);
 if(pos&&openedAt&&entryPrice>0&&!normalizedEvents.some(x=>x.action==='KAUF'&&Math.abs(Date.parse(x.ts)-Date.parse(openedAt))<10*60*1000))normalizedEvents.push({ts:openedAt,action:'KAUF',price:entryPrice,amount:Number(pos?.invested||0),reason:'Aktueller Einstieg'});
 normalizedEvents.sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
 return{ok:true,symbol,name,range,interval,bars,events:normalizedEvents,position:pos?{open:true,entryPrice,openedAt,invested:Number(pos?.invested||0),lastPrice:Number(pos?.last_price||res?.meta?.regularMarketPrice||bars.at(-1)?.close||0)}:{open:false,entryPrice:0,openedAt:null,invested:0},currency:res?.meta?.currency||pos?.currency||null,exchange:res?.meta?.exchangeName||null};
}

export default{
 async fetch(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/app.js'&&request.method==='GET')return freeTierAppJs(request,env);
  if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const p=portfolio(env);let sessionAuth=null;const agentPath=u.pathname.startsWith('/api/agent/');
   if(approvalMode(env)&&u.pathname!=='/api/order-approval-status'&&!agentPath){
    sessionAuth=await verifyCloudflareAccess(request,env);if(!sessionAuth.ok)return reply({error:sessionAuth.error,approvalAuth:false},sessionAuth.status||403);
   }
   if(u.pathname==='/api/status'&&request.method==='GET')return reply(await p.status());
   if(u.pathname==='/api/day-replay-report'&&request.method==='GET'){const s=await p.status();return reply({ok:true,dayReplayLearning:s?.dayReplayLearning||null,pcDayReplayImport:s?.pcDayReplayImport||null,entryPriceTiming:s?.entryPriceTiming||null,profitOptimizer:s?.profitOptimizer||null})}
   if(u.pathname==='/api/position-chart'&&request.method==='GET'){const data=await positionChartData(p,u);return reply(data,data.status||200)}
   if(u.pathname==='/api/agent/status'&&request.method==='GET')return reply(await p.agentStatus());
   if(agentPath&&request.method==='POST'){
    const auth=await verifyPcAgent(request,env);if(!auth.ok)return reply({error:auth.error,pcAgentAuth:false},auth.status);
    if(u.pathname==='/api/agent/universe'){const data=await agentUniverseData(env,request.url);return reply(data,data.status||200)}
    const b=await request.json().catch(()=>({}));
    if(u.pathname==='/api/agent/heartbeat')return reply(await p.agentHeartbeat(b));
    if(u.pathname==='/api/agent/prefetch')return reply(await p.agentPrefetch(b));
    if(u.pathname==='/api/agent/scan')return reply(await p.scanFromAgent(b));
    if(u.pathname==='/api/agent/day-replay')return reply(await p.dailyReplay(Math.max(1,Math.min(10,Number(b?.batchSize)||8))));
    if(u.pathname==='/api/agent/replay-learning')return reply(await p.importPcReplay(b));
   }
   if(u.pathname==='/api/order-approval-status'&&request.method==='GET')return reply(await p.orderApprovalStatus());
   if(u.pathname==='/api/order-approvals'&&request.method==='GET'){
    const auth=sessionAuth||await verifyCloudflareAccess(request,env);if(!auth.ok)return reply({error:auth.error,approvalAuth:false},auth.status||403);
    return reply(await p.orderApprovals());
   }
   const orderAction=u.pathname.match(/^\/api\/order-approvals\/([^/]+)\/(approve|reject)$/);
   if(orderAction&&request.method==='POST'){
    const auth=sessionAuth||await verifyCloudflareAccess(request,env);if(!auth.ok)return reply({error:auth.error,approvalAuth:false},auth.status||403);
    const id=decodeURIComponent(orderAction[1]),result=orderAction[2]==='approve'?await p.approveOrder(id,auth.user?.email):await p.rejectOrder(id,auth.user?.email);
    return reply(result,result?.ok?200:(result?.status||400));
   }
   if(u.pathname==='/api/start'&&request.method==='POST'){
    const b=await request.json().catch(()=>({}));
    const started=await p.start({...b,includeEtfs:false,includeLeverage:false});
    const firstScan=await p.scan();
    return reply({...started,firstScan,storage:'Durable Object Free · kompakter Hauptzustand',assetClass:'nur Aktien',targetBroker:'finanzen.net ZERO · gettex',freeTier:'Windows-PC-Agent bevorzugt · 07:25 Vorbereitung · 07:30-23:00 Minutenbetrieb · Cloudflare 5-Minuten-Fallback'});
   }
   if(u.pathname==='/api/stop'&&request.method==='POST')return reply(await p.stop());
   if(u.pathname==='/api/reset'&&request.method==='POST')return reply(await p.reset());
   if(u.pathname==='/api/scan'&&request.method==='POST')return reply(await p.scan());
   if(u.pathname==='/api/migrate-from-old-sql'&&request.method==='POST')return reply(await p.migrateLegacySql());
   if(u.pathname==='/api/last-week'&&request.method==='POST')return reply({error:'Der alte Replay-Endpunkt ist entfernt. Nutze den 2026-Tab.'},410);
   return reply({error:'Not found'},404)
  }catch(e){return reply({error:String(e?.message||e)},500)}
 },
 async scheduled(controller,env,ctx){
  const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when);
  // PC online: PC berechnet den Tages-Replay lokal. Cloudflare macht keinen parallelen
  // Replay und zaehlt damit keine Lern-Samples doppelt. Ist der PC schon aus, uebernimmt
  // Cloudflare ab 21:55 in kleinen Batches als Fallback.
  if(session.open){ctx.waitUntil((async()=>{const p=portfolio(env),agent=await p.agentStatus();if(!agent?.online&&session.localMinute>=21*60+55)await p.dailyReplay(8);if(!agent?.online)await p.scan()})().catch(e=>console.error('Compact DO scan/replay failed',e)));return}
  if(session.prepareNow){ctx.waitUntil(portfolio(env).preOpenPrepare().catch(e=>console.error('gettex preopen prepare failed',e)))}
 }
};
