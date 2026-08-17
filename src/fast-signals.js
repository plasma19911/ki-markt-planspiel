const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/FastDecision)'};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function parseJsonBetween(text,startMarker,endMarker=null){
  const start=text.indexOf(startMarker);if(start<0)return[];
  const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;
  const raw=text.slice(from,end>=0?end:text.length).trim();
  try{return JSON.parse(raw)}catch{return[]}
}

function planState(prompt){
  const candidates=parseJsonBetween(prompt,'Kandidaten=',' Gehalten=');
  const held=parseJsonBetween(prompt,' Gehalten=');
  const style=String(prompt.match(/Handelsstil=([^.;\n]+)/)?.[1]||'offensiv').trim().toLowerCase();
  return{candidates:Array.isArray(candidates)?candidates:[],held:Array.isArray(held)?held:[],style};
}

async function universeMeta(assets){
  if(!assets?.fetch)return new Map();
  try{
    const r=await assets.fetch(new Request('https://assets.local/universe.json'));
    if(!r.ok)return new Map();
    const j=await r.json(),m=new Map();
    for(const x of j?.equities||[])if(x?.symbol)m.set(String(x.symbol).toUpperCase(),{sector:x.sector||null,industry:x.industry||null,region:x.region||null});
    return m;
  }catch{return new Map()}
}

function chooseBenchmark(symbol){
  const s=String(symbol||'').toUpperCase();
  if(/\.(DE|F|SG|MU|HM|PA|BR|MI|MC|AS|VI|HE|CO|LS|SW|L|ST|OL|WA|PR)$/.test(s))return'VWCE.DE';
  return'SPY';
}

async function chart(symbol){
  try{
    const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return null;
    const res=(await r.json())?.chart?.result?.[0];if(!res)return null;
    const q=res?.indicators?.quote?.[0]||{},ts=res.timestamp||[],rows=[];
    for(let i=0;i<ts.length;i++){
      const high=num(q.high?.[i],NaN),low=num(q.low?.[i],NaN),close=num(q.close?.[i],NaN),volume=Math.max(0,num(q.volume?.[i]));
      if(Number.isFinite(high)&&Number.isFinite(low)&&Number.isFinite(close))rows.push({t:ts[i],high,low,close,volume});
    }
    if(rows.length<18)return null;
    return{rows,previousClose:num(res.meta?.previousClose,rows[0].close),lastTs:rows.at(-1).t||num(res.meta?.regularMarketTime)};
  }catch{return null}
}

function technical(c){
  if(!c?.rows?.length)return null;
  const rows=c.rows,close=rows.at(-1).close,prevClose=num(c.previousClose,rows[0].close);
  let pv=0,volSum=0;
  for(const r of rows){const tp=(r.high+r.low+r.close)/3,w=Math.max(0,r.volume);pv+=tp*w;volSum+=w}
  const vwap=volSum?pv/volSum:rows.reduce((a,r)=>a+r.close,0)/rows.length;
  const trs=[],plusDM=[],minusDM=[];
  for(let i=1;i<rows.length;i++){
    const cur=rows[i],prev=rows[i-1],up=cur.high-prev.high,down=prev.low-cur.low;
    trs.push(Math.max(cur.high-cur.low,Math.abs(cur.high-prev.close),Math.abs(cur.low-prev.close)));
    plusDM.push(up>down&&up>0?up:0);minusDM.push(down>up&&down>0?down:0);
  }
  const p=14,start=Math.max(0,trs.length-p),tr=trs.slice(start).reduce((a,b)=>a+b,0),pdm=plusDM.slice(start).reduce((a,b)=>a+b,0),mdm=minusDM.slice(start).reduce((a,b)=>a+b,0);
  const atr=trs.slice(start).length?tr/trs.slice(start).length:0,plusDI=tr?100*pdm/tr:0,minusDI=tr?100*mdm/tr:0;
  const dx=(plusDI+minusDI)?100*Math.abs(plusDI-minusDI)/(plusDI+minusDI):0;
  const look=rows.slice(-21,-1),support=Math.min(...look.map(x=>x.low)),resistance=Math.max(...look.map(x=>x.high));
  const back20=rows[Math.max(0,rows.length-5)]?.close||rows[0].close,mom20=(close/back20-1)*100,day=prevClose?(close/prevClose-1)*100:0;
  return{
    price:close,vwap,vwapDistancePct:vwap?(close/vwap-1)*100:0,atr,atrPct:close?atr/close*100:0,adx:dx,plusDI,minusDI,
    support,resistance,priceVsSupportPct:support?(close/support-1)*100:0,priceVsResistancePct:resistance?(close/resistance-1)*100:0,
    mom20,day,fresh:Date.now()/1000-num(c.lastTs,0)<35*60
  };
}

function sectorPeerStrength(candidates,meta){
  const groups=new Map();
  for(const c of candidates){const s=meta.get(String(c.symbol).toUpperCase())?.sector;if(!s)continue;const arr=groups.get(s)||[];arr.push(num(c.day));groups.set(s,arr)}
  const out=new Map();
  for(const c of candidates){const key=String(c.symbol).toUpperCase(),s=meta.get(key)?.sector,vals=s?groups.get(s)||[]:[];if(vals.length<2)continue;const own=num(c.day),peers=vals.slice();const i=peers.indexOf(own);if(i>=0)peers.splice(i,1);if(!peers.length)continue;const avg=peers.reduce((a,b)=>a+b,0)/peers.length;out.set(key,{sector:s,relativePct:own-avg,peerAverageDayPct:avg,peerCount:peers.length})}
  return out;
}

function allocation(style,confidence){
  const base=style==='vorsichtig'?10:style==='ausgewogen'?16:22;
  return clamp(base+(confidence-.6)*25,8,30);
}

function decisionFor(c,t,held,marketTech,sectorStrength,style){
  const marketRel=t&&marketTech&&marketTech.fresh?t.mom20-marketTech.mom20:null;
  const sectorRel=sectorStrength?.relativePct??null;
  let buy=0,sell=0;const buyWhy=[],sellWhy=[];
  const state=String(c.momentumState||'NORMAL'),sellSignal=String(c.momentumSellSignal||'NONE');
  if(state==='BREAKOUT'){buy+=1.5;buyWhy.push('bestätigter Momentum-Breakout')}else if(state==='BUILDING'){buy+=.7;buyWhy.push('Momentum baut sich auf')}
  if(t){
    if(t.vwapDistancePct>.12){buy+=1;buyWhy.push('über VWAP')}else if(t.vwapDistancePct<-.18){sell+=1;sellWhy.push('unter VWAP')}
    if(t.adx>=22&&t.plusDI>t.minusDI){buy+=1.1;buyWhy.push(`ADX ${t.adx.toFixed(0)} Trend bestätigt`)}
    if(t.adx>=22&&t.minusDI>t.plusDI){sell+=1.1;sellWhy.push(`ADX ${t.adx.toFixed(0)} Abwärtstrend bestätigt`)}
    if(t.priceVsResistancePct>=0){buy+=1;buyWhy.push('Widerstand gebrochen')}else if(t.priceVsResistancePct>-0.35){buy+=.45;buyWhy.push('direkt am Widerstand')}
    if(t.priceVsSupportPct<-.15){sell+=1.2;sellWhy.push('Unterstützung gebrochen')}
    if(t.atrPct>2.5){buy-=.5;buyWhy.push('hohe ATR bremst Einstieg')}
  }
  if(marketRel!=null){if(marketRel>.12){buy+=.7;buyWhy.push('stärker als Gesamtmarkt')}else if(marketRel<-.18){sell+=.7;sellWhy.push('schwächer als Gesamtmarkt')}}
  if(sectorRel!=null){if(sectorRel>.25){buy+=.55;buyWhy.push('stärker als Sektor-Peers')}else if(sectorRel<-.3){sell+=.55;sellWhy.push('schwächer als Sektor-Peers')}}
  if(num(c.volumeRatio)>1.25){buy+=.55;buyWhy.push('Volumen bestätigt')}
  if(num(c.intradayRsi)>79){buy-=1;buyWhy.push('RSI überhitzt')}
  if(sellSignal==='STRONG'){sell+=3;sellWhy.push('Momentum-Reversal STRONG')}else if(sellSignal==='WATCH'){sell+=1.2;sellWhy.push('Momentum-Erschöpfung')}
  if(state==='REVERSAL'){sell+=1.5;sellWhy.push('Reversal-Zustand')}
  if(num(c.drawdownFrom20mHighPct)<-.6){sell+=.8;sellWhy.push('deutlicher Rücklauf vom 20m-Hoch')}
  if(num(c.news)<-.3){sell+=.45;sellWhy.push('negative News-Bestätigung')}
  if(num(c.news)>.3){buy+=.35;buyWhy.push('positive News-Bestätigung')}

  if(held&&(sell>=4||sellSignal==='STRONG'&&sell>=3.6)){
    const confidence=clamp(.56+sell*.055,.56,.94);
    return{symbol:c.symbol,action:'SELL',confidence,allocation_pct:0,reason:`FAST-SELL: ${sellWhy.slice(0,5).join(' · ')}`,fastScore:+sell.toFixed(2),marketRelative20m:marketRel,sectorRelativeDay:sectorRel};
  }
  if(!held&&buy>=4.2&&sell<1.6&&t?.fresh&&t.vwapDistancePct>0&&t.adx>=18&&sellSignal==='NONE'&&(state==='BREAKOUT'||state==='BUILDING')){
    const confidence=clamp(.55+buy*.05,.55,.9);
    return{symbol:c.symbol,action:'BUY',confidence,allocation_pct:+allocation(style,confidence).toFixed(1),reason:`FAST-BUY: ${buyWhy.slice(0,5).join(' · ')}`,fastScore:+buy.toFixed(2),marketRelative20m:marketRel,sectorRelativeDay:sectorRel};
  }
  return{symbol:c.symbol,action:'HOLD',confidence:clamp(.45+Math.max(buy,sell)*.035,.45,.72),allocation_pct:0,reason:`FAST-HOLD: BUY ${buy.toFixed(1)} / SELL ${sell.toFixed(1)}`,fastScore:+(buy-sell).toFixed(2),marketRelative20m:marketRel,sectorRelativeDay:sectorRel};
}

export async function buildFastDecisionLayer(prompt,assets){
  const state=planState(prompt),heldSet=new Set(state.held.map(x=>String(x.symbol).toUpperCase())),meta=await universeMeta(assets),sectorStrength=sectorPeerStrength(state.candidates,meta);
  const selected=[];
  for(const c of state.candidates)if(heldSet.has(String(c.symbol).toUpperCase())&&!selected.some(x=>x.symbol===c.symbol)&&selected.length<4)selected.push(c);
  for(const c of state.candidates){if(selected.length>=4)break;if(!selected.some(x=>x.symbol===c.symbol))selected.push(c)}
  if(!selected.length)return{summary:'Fast-Decision: keine Kandidaten.',actions:[],context:[]};
  const benchmarks=[...new Set(selected.map(x=>chooseBenchmark(x.symbol)))].slice(0,2),techMap=new Map();
  const results=await Promise.all([...selected.map(async c=>[String(c.symbol).toUpperCase(),technical(await chart(c.symbol))]),...benchmarks.map(async b=>[b,technical(await chart(b))])]);
  for(const [k,v] of results)if(v)techMap.set(k,v);
  const context=[],actions=[];
  for(const c of selected){
    const key=String(c.symbol).toUpperCase(),t=techMap.get(key),benchmark=chooseBenchmark(c.symbol),bt=techMap.get(benchmark),sec=sectorStrength.get(key),d=decisionFor(c,t,heldSet.has(key),bt,sec,state.style);
    context.push({symbol:c.symbol,held:heldSet.has(key),sector:meta.get(key)?.sector||null,benchmark,technical:t?{vwapDistancePct:+t.vwapDistancePct.toFixed(2),atrPct:+t.atrPct.toFixed(2),adx:+t.adx.toFixed(1),plusDI:+t.plusDI.toFixed(1),minusDI:+t.minusDI.toFixed(1),priceVsSupportPct:+t.priceVsSupportPct.toFixed(2),priceVsResistancePct:+t.priceVsResistancePct.toFixed(2),fresh:t.fresh}:null,marketRelative20m:d.marketRelative20m==null?null:+d.marketRelative20m.toFixed(2),sectorRelativeDay:d.sectorRelativeDay==null?null:+d.sectorRelativeDay.toFixed(2),fastAction:d.action,fastScore:d.fastScore,reason:d.reason});
    if(d.action!=='HOLD')actions.push({symbol:d.symbol,action:d.action,confidence:d.confidence,allocation_pct:d.allocation_pct,reason:d.reason});
  }
  const sells=actions.filter(x=>x.action==='SELL').length,buys=actions.filter(x=>x.action==='BUY').length;
  return{summary:`Fast-Decision: ${sells} SELL / ${buys} BUY aus ${context.length} Tiefenchecks. VWAP, ATR, ADX, Markt-/Sektorrelativstärke und Support/Resistance kombiniert.`,actions,context};
}

export function mergeFastRiskActions(aiResponse,fast){
  if(!fast?.actions?.length)return aiResponse;
  const raw=String(aiResponse?.response||aiResponse?.result?.response||'');
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return aiResponse;
  try{
    const j=JSON.parse(raw.slice(a,b+1)),actions=Array.isArray(j.actions)?j.actions:[];
    for(const f of fast.actions.filter(x=>x.action==='SELL'&&x.confidence>=.72)){
      const i=actions.findIndex(x=>String(x.symbol).toUpperCase()===String(f.symbol).toUpperCase());
      if(i>=0)actions[i]={...actions[i],action:'SELL',confidence:Math.max(num(actions[i].confidence),f.confidence),allocation_pct:0,reason:`${f.reason} · Risiko-Overlay`};
      else actions.push({...f,reason:`${f.reason} · Risiko-Overlay`});
    }
    j.actions=actions;j.summary=`${String(j.summary||'KI-Plan').slice(0,330)} · ${fast.summary}`;
    return{...aiResponse,response:JSON.stringify(j)};
  }catch{return aiResponse}
}
