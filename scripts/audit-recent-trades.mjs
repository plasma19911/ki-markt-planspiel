const BASE='https://ki-markt-planspiel.orkimperium.workers.dev';
const H=[5,15,30];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const arr=v=>Array.isArray(v)?v:[];
const sym=v=>String(v||'').toUpperCase().trim();
const pct=(a,b)=>a>0&&b>0?(b/a-1)*100:null;
const benchFor=s=>/\.CO$/.test(s)?'^OMXC25':/\.HE$/.test(s)?'^OMXH25':/\.AS$/.test(s)?'^AEX':/\.NS$/.test(s)?'^NSEI':/\.JK$/.test(s)?'^JKSE':/\.IS$/.test(s)?'XU100.IS':/\.(DE|F)$/.test(s)?'^GDAXI':null;
async function json(url){const r=await fetch(url,{headers:{accept:'application/json','user-agent':'Mozilla/5.0 (KI-Markt Audit)'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
async function chart(symbol){
 const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','1m');u.searchParams.set('includePrePost','false');
 const j=await json(u),r=j?.chart?.result?.[0],ts=arr(r?.timestamp),q=r?.indicators?.quote?.[0]||{},bars=[];
 for(let i=0;i<ts.length;i++){const c=Number(q.close?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]);if(Number.isFinite(c)&&c>0)bars.push({ts:Number(ts[i])*1000,c,h:Number.isFinite(h)?h:c,l:Number.isFinite(l)?l:c})}
 if(!bars.length)throw new Error(`no bars ${symbol}`);return{symbol,bars};
}
function atOrAfter(bars,t){for(const b of bars)if(b.ts>=t)return b;return bars.at(-1)||null}
function atOrBefore(bars,t){for(let i=bars.length-1;i>=0;i--)if(bars[i].ts<=t)return bars[i];return bars[0]||null}
function window(bars,a,b){return bars.filter(x=>x.ts>=a&&x.ts<=b)}
function tradeMetrics(bars,ts,side){
 const t=Date.parse(ts),b0=atOrBefore(bars,t)||atOrAfter(bars,t);if(!b0)return null;
 const before5=atOrBefore(bars,t-5*60000),before20=atOrBefore(bars,t-20*60000),prior20=window(bars,t-20*60000,t),hi20=prior20.length?Math.max(...prior20.map(x=>x.h)):b0.h;
 const out={chartTs:new Date(b0.ts).toISOString(),price:b0.c,pre5Pct:before5?pct(before5.c,b0.c):null,pre20Pct:before20?pct(before20.c,b0.c):null,drawFrom20mHighPct:hi20?pct(hi20,b0.c):null,forward:{}};
 for(const h of H){const x=atOrAfter(bars,t+h*60000);out.forward[h]=x?pct(b0.c,x.c):null}
 const w=window(bars,t,Math.min(Date.now(),t+30*60000));if(w.length){out.mfe30Pct=pct(b0.c,Math.max(...w.map(x=>x.h)));out.mae30Pct=pct(b0.c,Math.min(...w.map(x=>x.l)))}
 if(side==='BUY')out.entryShape=(num(out.pre20Pct)>1.5&&num(out.pre5Pct)>.35&&num(out.drawFrom20mHighPct)>-.30)?'LATE_IMPULSE_NEAR_HIGH':(num(out.drawFrom20mHighPct)<=-.45&&num(out.pre5Pct)>=0?'PULLBACK_RECLAIM':'OTHER');
 return out;
}
function marketMetric(chart,ts){if(!chart)return null;const t=Date.parse(ts),b=atOrBefore(chart.bars,t);if(!b)return null;const out={symbol:chart.symbol,forward:{}};for(const h of H){const x=atOrAfter(chart.bars,t+h*60000);out.forward[h]=x?pct(b.c,x.c):null}return out}
function sameDay(ts){const d=new Date(ts),now=new Date();return d.toISOString().slice(0,10)===now.toISOString().slice(0,10)}
const status=await json(`${BASE}/api/status?audit=${Date.now()}`),history=arr(status?.history).filter(x=>sameDay(x?.ts)&&sym(x?.symbol)&&['KAUF','BUY','VERKAUF','SELL'].includes(String(x?.action||'').toUpperCase())).slice(-24);
const symbols=[...new Set(history.map(x=>sym(x.symbol)))],charts=new Map(),benches=new Map(),errors=[];
for(const s of symbols){try{charts.set(s,await chart(s))}catch(e){errors.push({symbol:s,error:String(e.message||e)})}const b=benchFor(s);if(b&&!benches.has(b)){try{benches.set(b,await chart(b))}catch(e){errors.push({symbol:b,error:String(e.message||e)})}}}
const trades=history.map((h,i)=>{const s=sym(h.symbol),act=String(h.action||'').toUpperCase(),side=['KAUF','BUY'].includes(act)?'BUY':'SELL',m=charts.get(s)?tradeMetrics(charts.get(s).bars,h.ts,side):null,bm=marketMetric(benches.get(benchFor(s)),h.ts),rel={};for(const x of H)rel[x]=m?.forward?.[x]!=null&&bm?.forward?.[x]!=null?m.forward[x]-bm.forward[x]:null;return{id:h.id,ts:h.ts,symbol:s,side,tradePnl:h.trade_pnl??null,reason:String(h.reason||''),metrics:m,benchmark:bm,relativeForward:rel}});
const issues=[];
for(let i=0;i<trades.length;i++){
 const t=trades[i],m=t.metrics;if(!m)continue;
 if(t.side==='BUY'&&m.entryShape==='LATE_IMPULSE_NEAR_HIGH')issues.push({symbol:t.symbol,ts:t.ts,type:'LATE_IMPULSE_ENTRY',evidence:{pre5:m.pre5Pct,pre20:m.pre20Pct,draw:m.drawFrom20mHighPct,f15:m.forward[15],f30:m.forward[30],relative15:t.relativeForward[15]}});
 if(t.side==='BUY'&&m.forward[15]!=null&&m.forward[15]<-.35&&num(m.mfe30Pct)<.20)issues.push({symbol:t.symbol,ts:t.ts,type:'ENTRY_FAILED_FAST',evidence:{f15:m.forward[15],mfe30:m.mfe30Pct,mae30:m.mae30Pct}});
 if(t.side==='SELL'&&m.forward[15]!=null&&m.forward[15]>.35)issues.push({symbol:t.symbol,ts:t.ts,type:'SELL_TOO_EARLY_REBOUND',evidence:{post15:m.forward[15],post30:m.forward[30],relative15:t.relativeForward[15],tradePnl:t.tradePnl}});
 if(t.side==='SELL'&&/HARD EXIT/i.test(t.reason)&&/(EXIT[- ]?HOLD|weiter beobachten|nicht stark genug)/i.test(t.reason))issues.push({symbol:t.symbol,ts:t.ts,type:'CONTRADICTORY_HARD_EXIT',evidence:{reason:t.reason.slice(0,260)}});
 const n=trades[i+1];if(t.side==='SELL'&&n?.side==='BUY'&&n.symbol===t.symbol){const mins=(Date.parse(n.ts)-Date.parse(t.ts))/60000;if(mins<=45)issues.push({symbol:t.symbol,ts:n.ts,type:'FAST_REENTRY_AFTER_SELL',evidence:{minutes:+mins.toFixed(1),sellPnl:t.tradePnl,newEntryShape:n.metrics?.entryShape,newPre20:n.metrics?.pre20Pct}})}
}
const out={checkedAt:new Date().toISOString(),statusVersion:status?.finalDecisionPolicy?.version??null,scanCount:status?.config?.scan_count??status?.scanCount??null,tradeCount:trades.length,symbols,trades,issues,errors};
console.log(JSON.stringify(out,null,2));
