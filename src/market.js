import {CORE_ETFS,LEVERAGED_ETFS,SPARK_BATCH,DEEP_LIMIT,NEWS_LIMIT,POS_WORDS,NEG_WORDS,clamp,num,chunks} from './constants.js';

const headers={'accept':'application/json','user-agent':'Mozilla/5.0'};
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;for(const v of a.slice(p))e=v*k+e*(1-k);return e}
function rsi(a,p=14){if(a.length<p+1)return null;let g=0,l=0,s=a.slice(-(p+1));for(let i=1;i<s.length;i++){let d=s[i]-s[i-1];d>0?g+=d:l-=d}if(!l)return 100;let rs=(g/p)/(l/p);return 100-100/(1+rs)}
function sentiment(headlines){let s=0;for(const h of headlines){for(const w of String(h).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/)){if(POS_WORDS.includes(w))s+=.35;if(NEG_WORDS.includes(w))s-=.35}}return clamp(s,-2,2)}
function titles(xml){return [...String(xml).matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi)].slice(1,8).map(m=>m[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim()).filter(Boolean)}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let i=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const x=i++;if(x>=items.length)return;try{out[x]=await fn(items[x])}catch{out[x]=null}}}));return out}

export async function loadUniverse(env,cfg){
 let data={equities:[],generated_at:null};
 try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(r.ok)data=await r.json()}catch{}
 const all=(data.equities||[]).filter(x=>x?.symbol).map(x=>({symbol:String(x.symbol).toUpperCase(),name:x.name||x.symbol,type:'EQUITY',leverage:1,marketCap:num(x.marketCap)}));
 if(cfg.include_etfs)all.push(...CORE_ETFS);if(cfg.include_leverage)all.push(...LEVERAGED_ETFS);
 const seen=new Set(),out=[];for(const x of all){if(!seen.has(x.symbol)){seen.add(x.symbol);out.push(x)}}
 return{items:out,generatedAt:data.generated_at};
}

async function sparkBatch(symbols,lookup){
 const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',symbols.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
 const r=await fetch(u,{headers});if(!r.ok)throw new Error(`Yahoo Spark ${r.status}`);const j=await r.json(),out=[];
 for(const item of j?.spark?.result||[]){const res=item?.response?.[0];if(!res)continue;const m=res.meta||{},sym=String(item.symbol||m.symbol||'').toUpperCase(),info=lookup.get(sym);if(!info)continue;const c=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);if(c.length<3)continue;const price=num(m.regularMarketPrice,c.at(-1)),prev=num(m.previousClose,c[0]),day=prev?(price/prev-1)*100:0,back=c[Math.max(0,c.length-4)],mom=back?(price/back-1)*100:0,age=m.regularMarketTime?Date.now()/1000-num(m.regularMarketTime):999999;out.push({...info,price,dayChange:day,preScore:day*.65+mom*1.35,fresh:age<35*60})}
 return out;
}

async function deepChart(info){
 const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(info.symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','1m');u.searchParams.set('includePrePost','false');
 const r=await fetch(u,{headers});if(!r.ok)return null;const j=await r.json(),res=j?.chart?.result?.[0];if(!res)return null;const q=res?.indicators?.quote?.[0]||{},cl=(q.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number),vol=(q.volume||[]).map(v=>num(v));if(cl.length<22)return null;
 const price=cl.at(-1),e9=ema(cl,9),e21=ema(cl,21),rr=rsi(cl),m5=(price/cl.at(-6)-1)*100,m20=(price/cl.at(-21)-1)*100,pclose=num(res.meta?.previousClose,cl[0]),day=pclose?(price/pclose-1)*100:0,vbase=vol.slice(-21,-1).filter(x=>x>0),vavg=vbase.length?vbase.reduce((a,b)=>a+b,0)/vbase.length:0,vr=vavg?num(vol.at(-1))/vavg:1,last=(res.timestamp||[]).at(-1)||res.meta?.regularMarketTime||0,fresh=Date.now()/1000-last<35*60;
 let score=0,reason=[];if(e9&&e21&&e9>e21){score+=1.7;reason.push('EMA9 > EMA21')}else{score-=1;reason.push('EMA-Trend schwach')}if(e21&&price>e21)score+=.8;else score-=.6;if(rr!==null){if(rr>=48&&rr<=68){score+=1;reason.push(`RSI ${rr.toFixed(0)}`)}else if(rr>=78){score-=1.5;reason.push(`RSI ${rr.toFixed(0)} überhitzt`)}else if(rr<=32)score-=.8}if(m5>.18){score+=.8;reason.push(`5m +${m5.toFixed(2)}%`)}else if(m5<-.25)score-=.9;if(m20>.5){score+=1.2;reason.push(`20m +${m20.toFixed(2)}%`)}else if(m20<-.5)score-=1.2;if(vr>1.5){score+=.7;reason.push(`Volumen x${vr.toFixed(1)}`)}if(day>1)score+=.4;if(day<-1)score-=.5;
 return{...info,price,score,dayChange:day,momentum5:m5,momentum20:m20,rsi:rr,volumeRatio:vr,newsScore:0,fresh,reasons:reason,headlines:[]};
}

async function news(c){try{const u=new URL('https://feeds.finance.yahoo.com/rss/2.0/headline');u.searchParams.set('s',c.symbol);u.searchParams.set('region','US');u.searchParams.set('lang','en-US');const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0'}});if(!r.ok)return{score:0,headlines:[]};const hs=titles(await r.text());return{score:sentiment(hs),headlines:hs}}catch{return{score:0,headlines:[]}}}

export async function scanMarket(env,cfg,heldSymbols=[]){
 const uni=await loadUniverse(env,cfg),lookup=new Map(uni.items.map(x=>[x.symbol,x])),coarse=[];
 for(const batch of chunks(uni.items.map(x=>x.symbol),SPARK_BATCH)){try{coarse.push(...await sparkBatch(batch,lookup))}catch{}}
 const selected=coarse.filter(x=>x.fresh).sort((a,b)=>b.preScore-a.preScore).slice(0,DEEP_LIMIT);for(const sym of heldSymbols){if(!selected.some(x=>x.symbol===sym)){const x=coarse.find(v=>v.symbol===sym)||lookup.get(sym);if(x)selected.push(x)}}
 const deep=(await mapLimit(selected,6,deepChart)).filter(Boolean).sort((a,b)=>b.score-a.score),targets=deep.slice(0,NEWS_LIMIT);for(const c of deep.filter(x=>heldSymbols.includes(x.symbol))){if(!targets.some(x=>x.symbol===c.symbol)&&targets.length<NEWS_LIMIT+3)targets.push(c)}
 const ns=await mapLimit(targets,5,news),nmap=new Map(targets.map((x,i)=>[x.symbol,ns[i]||{score:0,headlines:[]}])) ;for(const c of deep){const n=nmap.get(c.symbol)||{score:0,headlines:[]};c.newsScore=num(n.score);c.headlines=n.headlines;c.score+=c.newsScore;if(c.newsScore>.35)c.reasons.push(`News +${c.newsScore.toFixed(1)}`);if(c.newsScore<-.35)c.reasons.push(`News ${c.newsScore.toFixed(1)}`);if(c.type==='LEVERAGED_ETF')c.score-=.25}
 deep.sort((a,b)=>b.score-a.score);return{universe:uni.items,generatedAt:uni.generatedAt,candidates:deep};
}
