import {strongestNewsImpact} from './news-impact-intelligence.js';

const KEY='state/trade-decision-learning-v1';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const sym=v=>String(v||'').toUpperCase().trim();
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};
const dateKey=ts=>{const d=new Date(ts);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):''};

function defaults(){return{version:1,seen:{},samples:[],summary:{evaluatedTrades:0,buyTooEarly:0,sellTooEarly:0,goodExits:0,missedNewsShock:0,entryPatienceMultiplier:1,exitPatienceMultiplier:1,newsShockRetestMultiplier:1},updatedAt:null}}
async function chart(symbol){
 try{
  const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('includePrePost','false');
  const r=await fetch(u,{headers:{accept:'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/DecisionLearning)'}});if(!r.ok)return null;
  const j=await r.json(),res=j?.chart?.result?.[0],ts=arr(res?.timestamp),q=res?.indicators?.quote?.[0]||{},bars=[];
  for(let i=0;i<ts.length;i++){const c=Number(q.close?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]);if(Number.isFinite(c)&&c>0)bars.push({ts:Number(ts[i])*1000,c,h:Number.isFinite(h)&&h>0?h:c,l:Number.isFinite(l)&&l>0?l:c})}
  if(bars.length<10)return null;return{bars,previousClose:num(res?.meta?.previousClose,bars[0].c)};
 }catch{return null}
}
function nearest(bars,ts){const t=Date.parse(String(ts||''));if(!Number.isFinite(t))return-1;let bi=-1,bd=Infinity;for(let i=0;i<bars.length;i++){const d=Math.abs(bars[i].ts-t);if(d<bd){bd=d;bi=i}}return bi}
function noisePct(bars){const xs=[];for(let i=1;i<bars.length;i++)xs.push(Math.abs((bars[i].c/bars[i-1].c-1)*100));xs.sort((a,b)=>a-b);return xs.length?xs[Math.floor(xs.length*.5)]:.2}
function pairTrades(history,date){const rows=arr(history).filter(h=>dateKey(h?.ts)===date&&sym(h?.symbol)).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts)),open=new Map(),pairs=[];for(const h of rows){const s=sym(h.symbol),a=String(h.action||'').toUpperCase();if(['KAUF','BUY'].includes(a))open.set(s,h);else if(['VERKAUF','SELL'].includes(a)&&open.has(s)){pairs.push({symbol:s,buy:open.get(s),sell:h});open.delete(s)}}for(const [s,b] of open)pairs.push({symbol:s,buy:b,sell:null});return pairs}
function windowStats(bars,start,end=bars.length-1){const s=Math.max(0,start),e=Math.min(bars.length-1,end);if(e<=s)return null;const entry=bars[s].c,w=bars.slice(s+1,e+1);if(!w.length)return null;return{lowPct:(Math.min(...w.map(x=>x.l))/entry-1)*100,highPct:(Math.max(...w.map(x=>x.h))/entry-1)*100,endPct:(bars[e].c/entry-1)*100}}
function newsRowsFor(symbol,state,candidate=null){const b=sym(symbol).split('.')[0],rows=[];for(const n of arr(state?.newsRadar))if(sym(n?.symbol).split('.')[0]===b)rows.push(n);for(const e of arr(state?.newsLearning?.events))if(sym(e?.symbol).split('.')[0]===b)rows.push({headline:e.headline});for(const h of arr(candidate?.headlines))rows.push(typeof h==='string'?{headline:h}:h);return rows}
function median(xs=[]){const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function recompute(l){
 const samples=arr(l.samples),buyEarly=samples.filter(x=>x.buyTooEarly).length,sellEarly=samples.filter(x=>x.sellTooEarly).length,goodExits=samples.filter(x=>x.goodExit).length,missed=samples.filter(x=>x.missedNewsShock).length,tradeN=samples.filter(x=>x.kind==='TRADE').length;
 // Kleine, konservative Anpassungen erst mit mehreren Beobachtungen. Kein einzelner Tag darf das Modell umwerfen.
 const entryPressure=tradeN>=6?(buyEarly-Math.min(2,missed)) / Math.max(6,tradeN):0;
 const exitPressure=tradeN>=6?(sellEarly-goodExits*.35)/Math.max(6,tradeN):0;
 const newsPressure=(missed>=2?-.08*Math.min(3,missed):0)+(buyEarly>=4?.05:0);
 l.summary={evaluatedTrades:tradeN,buyTooEarly:buyEarly,sellTooEarly:sellEarly,goodExits,missedNewsShock:missed,entryPatienceMultiplier:+clamp(1+entryPressure*.45,.82,1.28).toFixed(3),exitPatienceMultiplier:+clamp(1+exitPressure*.45,.82,1.30).toFixed(3),newsShockRetestMultiplier:+clamp(1+newsPressure,.78,1.22).toFixed(3),note:'Adaptive Faktoren entstehen aus realem Nachlauf nach Kauf/Verkauf. Verpasste News-Schocks werden relativ zur Bewegung des jeweiligen Handelstags erkannt, nicht über eine starre Tages-Prozentgrenze.'};
 l.updatedAt=new Date().toISOString();
}

export async function updateTradeDecisionLearning(storage,state={},limit=6){
 const l={...defaults(),...read(storage,KEY,defaults())};l.seen=l.seen||{};l.samples=arr(l.samples);
 const date=(state?.config?.last_scan||new Date().toISOString()).slice(0,10),pairs=pairTrades(state?.history,date),todo=pairs.filter(p=>!l.seen[`${date}:${p.symbol}:${p.buy?.ts}:${p.sell?.ts||'OPEN'}`]).slice(0,limit);
 for(const p of todo){const data=await chart(p.symbol);if(!data)continue;const bi=nearest(data.bars,p.buy?.ts),si=p.sell?nearest(data.bars,p.sell.ts):-1;if(bi<0)continue;const noise=Math.max(.08,noisePct(data.bars)),buyEnd=si>bi?si:data.bars.length-1,buyWin=windowStats(data.bars,bi,buyEnd),sellWin=si>=0?windowStats(data.bars,si,data.bars.length-1):null;
  const buyTooEarly=Boolean(buyWin&&Math.abs(Math.min(0,buyWin.lowPct))>Math.max(.45,noise*3)&&buyWin.highPct>noise*2);
  const sellTooEarly=Boolean(sellWin&&sellWin.highPct>Math.max(.55,noise*3.5));
  const goodExit=Boolean(sellWin&&sellWin.endPct<Math.min(-.25,-noise*1.8));
  const id=`${date}:${p.symbol}:${p.buy?.ts}:${p.sell?.ts||'OPEN'}`;l.seen[id]=1;l.samples.push({id,kind:'TRADE',date,symbol:p.symbol,buyAt:p.buy?.ts||null,sellAt:p.sell?.ts||null,noisePct:+noise.toFixed(3),postBuyLowPct:buyWin?+buyWin.lowPct.toFixed(3):null,postBuyHighPct:buyWin?+buyWin.highPct.toFixed(3):null,postSellHighPct:sellWin?+sellWin.highPct.toFixed(3):null,postSellEndPct:sellWin?+sellWin.endPct.toFixed(3):null,buyTooEarly,sellTooEarly,goodExit});
 }
 // Verpasste strukturell positive Katalysatoren relativ zum heutigen Kandidatenfeld lernen.
 // Dadurch kann auch ein +4%-Mover an einem ruhigen Tag wichtiger sein als ein pauschales +8%-Limit.
 const candidateRows=arr(state?.candidates).slice(0,25),typicalDay=Math.max(.25,median(candidateRows.map(c=>Math.abs(num(c?.day,c?.day_change??c?.dayChange))))),bought=new Set(pairs.map(x=>x.symbol));
 for(const c of candidateRows){const s=sym(c?.symbol);if(!s||bought.has(s))continue;const impact=strongestNewsImpact(newsRowsFor(s,state,c)),day=num(c?.day,c?.day_change??c?.dayChange),relativeMove=Math.abs(day)/typicalDay;if(!(impact.direction>0&&impact.impact>=4&&relativeMove>=2.2))continue;const id=`${date}:${s}:MISSED_NEWS_SHOCK`;if(l.seen[id])continue;l.seen[id]=1;l.samples.push({id,kind:'MISSED',date,symbol:s,missedNewsShock:true,eventType:impact.type,dayMovePct:+day.toFixed(2),relativeDayMove:+relativeMove.toFixed(2),headline:String(impact.headline||'').slice(0,180)});}
 if(l.samples.length>240)l.samples=l.samples.slice(-200);if(Object.keys(l.seen).length>400){const keep=Object.keys(l.seen).slice(-300);l.seen=Object.fromEntries(keep.map(k=>[k,1]))}recompute(l);write(storage,KEY,l);return l;
}
export function getTradeDecisionLearning(storage){const l={...defaults(),...read(storage,KEY,defaults())};recompute(l);return l}
