import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/FastDecision)'};
const MIN_TECH_HISTORY_BARS=18;
const MIN_CURRENT_SESSION_BARS=3;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;

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
    for(const x of j?.equities||[])if(x?.symbol)m.set(String(x.symbol).toUpperCase(),{
      sector:x.sector||null,industry:x.industry||null,region:x.region||null,marketCapUSD:num(x.marketCapUSD||x.marketCap)
    });
    return m;
  }catch{return new Map()}
}

function chooseBenchmark(symbol){
  const s=String(symbol||'').toUpperCase();
  if(/\.(DE|F|SG|MU|HM|PA|BR|MI|MC|AS|VI|HE|CO|LS|SW|L|ST|OL|WA|PR)$/.test(s))return'VWCE.DE';
  return'SPY';
}

function sessionDayKey(ts,tz){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:tz||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(num(ts)*1000))}catch{return new Date(num(ts)*1000).toISOString().slice(0,10)}
}

async function chart(symbol){
  try{
    const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    // Mehrere Handelstage liefern genug Historie fuer ATR/ADX direkt nach der Oeffnung.
    // Pre-/Postmarket bleibt aus: nur regulaere Kurse duerfen den Live-BUY bestaetigen.
    u.searchParams.set('range','5d');u.searchParams.set('interval','5m');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return null;
    const res=(await r.json())?.chart?.result?.[0];if(!res)return null;
    const q=res?.indicators?.quote?.[0]||{},ts=res.timestamp||[],rows=[],tz=res.meta?.exchangeTimezoneName||'UTC';
    for(let i=0;i<ts.length;i++){
      const high=num(q.high?.[i],NaN),low=num(q.low?.[i],NaN),close=num(q.close?.[i],NaN),volume=Math.max(0,num(q.volume?.[i]));
      if(Number.isFinite(high)&&Number.isFinite(low)&&Number.isFinite(close))rows.push({t:ts[i],high,low,close,volume,dayKey:sessionDayKey(ts[i],tz)});
    }
    if(rows.length<MIN_TECH_HISTORY_BARS)return null;
    const regular=res.meta?.currentTradingPeriod?.regular||{},start=num(regular.start,0),end=num(regular.end,0);
    let sessionRows=start>0?rows.filter(x=>x.t>=start&&(!end||x.t<=end+300)):[];
    // Manche Yahoo-Antworten enthalten currentTradingPeriod nicht. Dann nur den letzten
    // Kalendertag verwenden; die Freshness-Pruefung verhindert alte Schlusskurse als Live-Signal.
    if(!sessionRows.length){const latestDay=rows.at(-1)?.dayKey;sessionRows=latestDay?rows.filter(x=>x.dayKey===latestDay):[]}
    return{rows,sessionRows,previousClose:num(res.meta?.previousClose,rows[0].close),lastTs:sessionRows.at(-1)?.t||rows.at(-1).t||num(res.meta?.regularMarketTime),exchangeTimezoneName:tz};
  }catch{return null}
}

async function sparkCloses(symbols,range,interval){
  const out=new Map();if(!symbols.length)return out;
  try{
    const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');
    u.searchParams.set('symbols',symbols.join(','));u.searchParams.set('range',range);u.searchParams.set('interval',interval);u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return out;
    const j=await r.json();
    for(const item of j?.spark?.result||[]){
      const res=item?.response?.[0],sym=String(item.symbol||res?.meta?.symbol||'').toUpperCase();
      const closes=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);
      if(sym&&closes.length>=2)out.set(sym,{closes,lastTs:num(res?.meta?.regularMarketTime)});
    }
  }catch{}
  return out;
}

async function quoteBatch(symbols){
  const out=new Map();if(!symbols.length)return out;
  try{
    const u=new URL('https://query1.finance.yahoo.com/v7/finance/quote');u.searchParams.set('symbols',symbols.join(','));
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return out;
    const j=await r.json();
    for(const q of j?.quoteResponse?.result||[]){
      const sym=String(q.symbol||'').toUpperCase(),bid=num(q.bid,NaN),ask=num(q.ask,NaN),mid=Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid?(bid+ask)/2:null;
      out.set(sym,{bid:Number.isFinite(bid)?bid:null,ask:Number.isFinite(ask)?ask:null,spreadPct:mid?((ask-bid)/mid)*100:null,volume:num(q.regularMarketVolume),avgVolume:num(q.averageDailyVolume3Month||q.averageDailyVolume10Day),marketCap:num(q.marketCap)});
    }
  }catch{}
  return out;
}

function ema(values,p){if(values.length<p)return null;const k=2/(p+1);let e=avg(values.slice(0,p));for(const v of values.slice(p))e=v*k+e*(1-k);return e}

function wilderAdx(rows,p=14){
  if(rows.length<p+3)return{atr:0,adx:0,plusDI:0,minusDI:0};
  const tr=[],plus=[],minus=[];
  for(let i=1;i<rows.length;i++){
    const c=rows[i],pr=rows[i-1];
    // Overnight-Gaps zwischen zwei Handelstagen duerfen den Intraday-ADX/ATR nicht aufblasen.
    if(c.dayKey&&pr.dayKey&&c.dayKey!==pr.dayKey)continue;
    const up=c.high-pr.high,down=pr.low-c.low;
    tr.push(Math.max(c.high-c.low,Math.abs(c.high-pr.close),Math.abs(c.low-pr.close)));
    plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);
  }
  if(tr.length<p)return{atr:0,adx:0,plusDI:0,minusDI:0};
  let trS=tr.slice(0,p).reduce((a,b)=>a+b,0),pS=plus.slice(0,p).reduce((a,b)=>a+b,0),mS=minus.slice(0,p).reduce((a,b)=>a+b,0),dx=[];
  const pushDx=()=>{const pdi=trS?100*pS/trS:0,mdi=trS?100*mS/trS:0;dx.push(pdi+mdi?100*Math.abs(pdi-mdi)/(pdi+mdi):0);return[pdi,mdi]};
  let [plusDI,minusDI]=pushDx();
  for(let i=p;i<tr.length;i++){
    trS=trS-trS/p+tr[i];pS=pS-pS/p+plus[i];mS=mS-mS/p+minus[i];[plusDI,minusDI]=pushDx();
  }
  let adx=dx.length?avg(dx.slice(0,Math.min(p,dx.length))):0;
  for(const v of dx.slice(p))adx=(adx*(p-1)+v)/p;
  return{atr:trS/p,adx,plusDI,minusDI};
}

function swingLevels(rows,atr,price){
  const r=rows.slice(-60),highs=[],lows=[];
  for(let i=2;i<r.length-2;i++){
    const x=r[i];
    if(x.high>=r[i-1].high&&x.high>=r[i-2].high&&x.high>=r[i+1].high&&x.high>=r[i+2].high)highs.push(x.high);
    if(x.low<=r[i-1].low&&x.low<=r[i-2].low&&x.low<=r[i+1].low&&x.low<=r[i+2].low)lows.push(x.low);
  }
  const tol=Math.max(num(atr)*.35,price*.0015),cluster=values=>{
    const groups=[];for(const v of values){let g=groups.find(x=>Math.abs(x.level-v)<=tol);if(!g)groups.push(g={level:v,count:0});g.level=(g.level*g.count+v)/(g.count+1);g.count++}return groups;
  };
  const hc=cluster(highs),lc=cluster(lows),prior=r.slice(0,-1),priorHigh=prior.length?Math.max(...prior.map(x=>x.high)):price,priorLow=prior.length?Math.min(...prior.map(x=>x.low)):price;
  const below=lc.filter(x=>x.level<=price).sort((a,b)=>(price-a.level)-(price-b.level)||b.count-a.count)[0],above=hc.filter(x=>x.level>=price).sort((a,b)=>(a.level-price)-(b.level-price)||b.count-a.count)[0];
  const support=below?.level||priorLow,resistance=above?.level||priorHigh;
  return{support,resistance,supportStrength:below?.count||1,resistanceStrength:above?.count||1,priorHigh,priorLow,breakoutPct:priorHigh?(price/priorHigh-1)*100:0,breakdownPct:priorLow?(price/priorLow-1)*100:0};
}

function technical(c){
  if(!c?.rows?.length)return null;
  const rows=c.rows,sessionRows=c.sessionRows||[];
  // Fuer einen Live-Einstieg reichen drei aktuelle 5m-Bars (~15 Min.); ADX/ATR nutzen
  // historische reguläre Intraday-Bars, VWAP dagegen ausschliesslich die heutige Sitzung.
  if(sessionRows.length<MIN_CURRENT_SESSION_BARS)return null;
  const close=sessionRows.at(-1).close,prevClose=num(c.previousClose,rows[0].close),w=wilderAdx(rows),levels=swingLevels(rows,w.atr,close);
  if(!(w.adx>0&&w.atr>0))return null;
  let pv=0,volSum=0;for(const r of sessionRows){const tp=(r.high+r.low+r.close)/3,wv=Math.max(0,r.volume);pv+=tp*wv;volSum+=wv}
  const vwap=volSum?pv/volSum:avg(sessionRows.map(r=>r.close)),back20=sessionRows[Math.max(0,sessionRows.length-5)]?.close||sessionRows[0].close,mom20=(close/back20-1)*100,day=prevClose?(close/prevClose-1)*100:0;
  return{price:close,vwap,vwapDistancePct:vwap?(close/vwap-1)*100:0,atr:w.atr,atrPct:close?w.atr/close*100:0,adx:w.adx,plusDI:w.plusDI,minusDI:w.minusDI,
    support:levels.support,resistance:levels.resistance,supportStrength:levels.supportStrength,resistanceStrength:levels.resistanceStrength,breakoutPct:levels.breakoutPct,breakdownPct:levels.breakdownPct,
    priceVsSupportPct:levels.support?(close/levels.support-1)*100:0,priceVsResistancePct:levels.resistance?(close/levels.resistance-1)*100:0,mom20,day,sessionBars:sessionRows.length,historyBars:rows.length,fresh:Date.now()/1000-num(c.lastTs,0)<35*60};
}

function tfSummary(record,barsBack){
  const c=record?.closes||[];if(c.length<2)return null;const n=Math.min(Math.max(2,barsBack),c.length),slice=c.slice(-n),price=slice.at(-1),start=slice[0],e9=ema(c,9),e21=ema(c,21);
  return{momentumPct:start?(price/start-1)*100:0,emaGapPct:e9&&e21?(e9/e21-1)*100:0,trend:e9&&e21?(e9>e21?'UP':'DOWN'):'FLAT',closes:c};
}

function mtfFor(symbol,maps){
  const k=String(symbol).toUpperCase(),m5=tfSummary(maps.m5.get(k),5),m15=tfSummary(maps.m15.get(k),5),h1=tfSummary(maps.h1.get(k),5),d1=tfSummary(maps.d1.get(k),6),parts=[m5,m15,h1,d1].filter(Boolean);
  let longVotes=0,shortVotes=0;for(const x of parts){if(x.momentumPct>0&&x.trend!=='DOWN')longVotes++;if(x.momentumPct<0&&x.trend!=='UP')shortVotes++}
  return{m5,m15,h1,d1,longVotes,shortVotes,alignment:longVotes-shortVotes};
}

function stdReturns(closes){if(closes.length<3)return 0;const a=[];for(let i=1;i<closes.length;i++)if(closes[i-1])a.push((closes[i]/closes[i-1]-1)*100);const m=avg(a);return Math.sqrt(avg(a.map(x=>(x-m)**2)))}
function marketRegime(mtf){
  const day=num(mtf?.d1?.momentumPct),hour=num(mtf?.h1?.momentumPct),min15=num(mtf?.m15?.momentumPct),vol=stdReturns((mtf?.d1?.closes||[]).slice(-21));
  if(vol>=2.7||Math.abs(min15)>=2.2)return{label:'VOLATILE',dailyVolPct:vol};
  if(day>.7&&hour>.18&&mtf?.alignment>=2)return{label:'TREND_UP',dailyVolPct:vol};
  if(day<-.7&&hour<-.18&&mtf?.alignment<=-2)return{label:'TREND_DOWN',dailyVolPct:vol};
  return{label:'RANGE',dailyVolPct:vol};
}

function correlation(a,b){const n=Math.min(a?.length||0,b?.length||0,45);if(n<12)return null;const x=a.slice(-n),y=b.slice(-n),rx=[],ry=[];for(let i=1;i<n;i++){rx.push(x[i]/x[i-1]-1);ry.push(y[i]/y[i-1]-1)}const mx=avg(rx),my=avg(ry);let cov=0,vx=0,vy=0;for(let i=0;i<rx.length;i++){const dx=rx[i]-mx,dy=ry[i]-my;cov+=dx*dy;vx+=dx*dx;vy+=dy*dy}return vx&&vy?cov/Math.sqrt(vx*vy):null}

function sectorPeerStrength(candidates,meta){
  const groups=new Map();for(const c of candidates){const s=meta.get(String(c.symbol).toUpperCase())?.sector;if(!s)continue;const arr=groups.get(s)||[];arr.push(num(c.day));groups.set(s,arr)}
  const out=new Map();for(const c of candidates){const key=String(c.symbol).toUpperCase(),s=meta.get(key)?.sector,vals=s?groups.get(s)||[]:[];if(vals.length<2)continue;const own=num(c.day),peers=[...vals],i=peers.indexOf(own);if(i>=0)peers.splice(i,1);if(peers.length)out.set(key,{sector:s,relativePct:own-avg(peers),peerAverageDayPct:avg(peers),peerCount:peers.length})}return out;
}

function allocation(style,confidence,regime){let base=style==='vorsichtig'?9:style==='ausgewogen'?14:20;if(regime==='VOLATILE'||regime==='TREND_DOWN')base*=.72;return clamp(base+(confidence-.6)*22,6,28)}
function thresholds(regime){let buy=num(FAST_CALIBRATION.buyThreshold,4.2),sell=num(FAST_CALIBRATION.sellThreshold,4);if(regime==='TREND_UP'){buy-=.3;sell+=.2}else if(regime==='TREND_DOWN'){buy+=.65;sell-=.35}else if(regime==='VOLATILE'){buy+=.55;sell-=.15}else buy+=.15;return{buy,sell}}

function decisionFor(c,t,heldRec,marketTech,sectorStrength,style,mtf,regime,liq,maxCorr,sameSectorHeld){
  const marketRel=t&&marketTech?num(t.mom20)-num(marketTech.m5?.momentumPct):null,sectorRel=sectorStrength?.relativePct??null,th=thresholds(regime.label);
  let buy=0,sell=0;const buyWhy=[],sellWhy=[],state=String(c.momentumState||'NORMAL'),sellSignal=String(c.momentumSellSignal||'NONE');
  if(state==='BREAKOUT'){buy+=1.45;buyWhy.push('bestätigter Momentum-Breakout')}else if(state==='BUILDING'){buy+=.65;buyWhy.push('Momentum baut sich auf')}
  if(t){
    if(t.vwapDistancePct>.10){buy+=.9;buyWhy.push('über VWAP')}else if(t.vwapDistancePct<-.15){sell+=1;sellWhy.push('unter VWAP')}
    if(t.adx>=num(FAST_CALIBRATION.strongAdx,22)&&t.plusDI>t.minusDI){buy+=1.05;buyWhy.push(`Wilder-ADX ${t.adx.toFixed(0)} aufwärts`)}
    if(t.adx>=num(FAST_CALIBRATION.strongAdx,22)&&t.minusDI>t.plusDI){sell+=1.1;sellWhy.push(`Wilder-ADX ${t.adx.toFixed(0)} abwärts`)}
    if(t.breakoutPct>=.05){buy+=1;buyWhy.push(`Swing-Widerstand gebrochen ${t.breakoutPct.toFixed(2)}%`)}else if(t.priceVsResistancePct>-0.25&&t.priceVsResistancePct<=0){buy+=.35;buyWhy.push('direkt am Swing-Widerstand')}
    if(t.breakdownPct<-.05||t.priceVsSupportPct<-.12){sell+=1.25;sellWhy.push('Swing-Unterstützung gebrochen')}
    if(t.atrPct>num(FAST_CALIBRATION.maxAtrPctBuy,2.5)){buy-=.55;buyWhy.push('hohe ATR bremst Einstieg')}
  }
  if(mtf){if(mtf.longVotes>=3){buy+=1.0;buyWhy.push(`${mtf.longVotes}/4 Zeitebenen aufwärts`)}if(mtf.shortVotes>=3){sell+=1.0;sellWhy.push(`${mtf.shortVotes}/4 Zeitebenen abwärts`)}if(mtf.alignment===4)buy+=.35;if(mtf.alignment===-4)sell+=.35}
  if(regime.label==='TREND_UP'){buy+=.25;buyWhy.push('Marktregime Trend aufwärts')}else if(regime.label==='TREND_DOWN'){sell+=.35;sellWhy.push('Marktregime Trend abwärts')}else if(regime.label==='VOLATILE'){buy-=.35;buyWhy.push('volatiles Marktregime')}
  if(marketRel!=null){if(marketRel>.12){buy+=.6;buyWhy.push('stärker als Gesamtmarkt')}else if(marketRel<-.18){sell+=.65;sellWhy.push('schwächer als Gesamtmarkt')}}
  if(sectorRel!=null){if(sectorRel>.25){buy+=.5;buyWhy.push('stärker als Sektor-Peers')}else if(sectorRel<-.3){sell+=.5;sellWhy.push('schwächer als Sektor-Peers')}}
  if(num(c.volumeRatio)>1.25){buy+=.5;buyWhy.push(`Volumen x${num(c.volumeRatio).toFixed(1)}`)}
  if(num(c.intradayRsi)>79){buy-=.9;buyWhy.push('RSI überhitzt')}
  if(sellSignal==='STRONG'){sell+=3;sellWhy.push('Momentum-Reversal STRONG')}else if(sellSignal==='WATCH'){sell+=1.15;sellWhy.push('Momentum-Erschöpfung')}
  if(state==='REVERSAL'){sell+=1.45;sellWhy.push('Reversal-Zustand')}if(num(c.drawdownFrom20mHighPct)<-.6){sell+=.75;sellWhy.push('Rücklauf vom 20m-Hoch')}
  if(num(c.news)<-.3){sell+=.4;sellWhy.push('negative News-Bestätigung')}if(num(c.news)>.3){buy+=.3;buyWhy.push('positive News-Bestätigung')}
  const spread=liq?.spreadPct;if(spread!=null&&spread>num(FAST_CALIBRATION.maxSpreadPct,.8)){buy-=2.2;buyWhy.push(`Spread ${spread.toFixed(2)}% zu hoch`)}
  if(liq&&liq.avgVolume>0&&liq.avgVolume<15000){buy-=1.6;buyWhy.push('Liquidität zu niedrig')}
  if(maxCorr!=null&&maxCorr>.88){buy-=maxCorr>.95?1.3:.75;buyWhy.push(`hohe Depot-Korrelation ${maxCorr.toFixed(2)}`)}if(sameSectorHeld>=2){buy-=.6;buyWhy.push('Sektorrisiko bereits mehrfach im Depot')}

  if(heldRec){
    const peak=num(heldRec.peakPnlPct),cur=num(heldRec.pnlPct),giveback=Math.max(0,peak-cur),tr=FAST_CALIBRATION.trailing||{},activate=num(tr.activatePnlPct,2),limit=clamp(Math.max(num(tr.minGivebackPct,.8),peak*num(tr.givebackShare,.34)),num(tr.minGivebackPct,.8),num(tr.maxGivebackPct,2.2));
    if(peak>=activate&&giveback>=limit){sell+=1.25;sellWhy.push(`Gewinnsicherung: ${giveback.toFixed(1)}%-Pkt. vom Peak abgegeben`);if(t?.vwapDistancePct<0||mtf?.shortVotes>=2)sell+=.8}
    if(peak>=5&&giveback>=Math.max(1.2,limit)&&mtf?.shortVotes>=2){sell+=1;sellWhy.push('starker Gewinnlauf kippt über mehrere Zeitebenen')}
  }

  if(heldRec&&sell>=th.sell){const confidence=clamp(.55+sell*.055,.56,.95);return{symbol:c.symbol,action:'SELL',confidence,allocation_pct:0,reason:`FAST-SELL: ${sellWhy.slice(0,6).join(' · ')}`,fastScore:+sell.toFixed(2),marketRelative20m:marketRel,sectorRelativeDay:sectorRel,regime:regime.label}}
  const liquidOk=spread==null||spread<=num(FAST_CALIBRATION.maxSpreadPct,.8),buyReady=!heldRec&&buy>=th.buy&&sell<1.7&&t?.fresh&&t.vwapDistancePct>0&&t.adx>=num(FAST_CALIBRATION.minAdxBuy,18)&&sellSignal==='NONE'&&(state==='BREAKOUT'||state==='BUILDING')&&mtf?.longVotes>=2&&liquidOk;
  if(buyReady){const confidence=clamp(.54+buy*.05,.55,.91);return{symbol:c.symbol,action:'BUY',confidence,allocation_pct:+allocation(style,confidence,regime.label).toFixed(1),reason:`FAST-BUY: ${buyWhy.slice(0,6).join(' · ')}`,fastScore:+buy.toFixed(2),marketRelative20m:marketRel,sectorRelativeDay:sectorRel,regime:regime.label}}
  return{symbol:c.symbol,action:'HOLD',confidence:clamp(.44+Math.max(buy,sell)*.035,.44,.74),allocation_pct:0,reason:`FAST-HOLD: BUY ${buy.toFixed(1)} / SELL ${sell.toFixed(1)} · ${regime.label}`,fastScore:+(buy-sell).toFixed(2),marketRelative20m:marketRel,sectorRelativeDay:sectorRel,regime:regime.label};
}

export async function buildFastDecisionLayer(prompt,assets){
  const state=planState(prompt),heldMap=new Map(state.held.map(x=>[String(x.symbol).toUpperCase(),x])),meta=await universeMeta(assets),sectorStrength=sectorPeerStrength(state.candidates,meta),selected=[];
  for(const c of state.candidates)if(heldMap.has(String(c.symbol).toUpperCase())&&!selected.some(x=>x.symbol===c.symbol)&&selected.length<4)selected.push(c);
  for(const c of state.candidates){if(selected.length>=4)break;if(!selected.some(y=>y.symbol===c.symbol))selected.push(c)}if(!selected.length)return{summary:'Fast-Decision: keine Kandidaten.',actions:[],context:[]};
  const benchmarks=[...new Set(selected.map(x=>chooseBenchmark(x.symbol)))].slice(0,2),allSymbols=[...new Set([...selected.map(x=>x.symbol),...state.held.map(x=>x.symbol),...benchmarks].filter(Boolean).map(x=>String(x).toUpperCase()))],maps={};
  const [charts,m5,m15,h1,d1,quotes]=await Promise.all([
    Promise.all(selected.map(async c=>[String(c.symbol).toUpperCase(),technical(await chart(c.symbol))])),sparkCloses(allSymbols,'1d','5m'),sparkCloses(allSymbols,'5d','15m'),sparkCloses(allSymbols,'1mo','60m'),sparkCloses(allSymbols,'6mo','1d'),quoteBatch(selected.map(x=>x.symbol))
  ]);maps.m5=m5;maps.m15=m15;maps.h1=h1;maps.d1=d1;const techMap=new Map(charts.filter(([,v])=>v));
  const heldSectors=new Map();for(const h of state.held){const s=meta.get(String(h.symbol).toUpperCase())?.sector;if(s)heldSectors.set(s,(heldSectors.get(s)||0)+1)}
  const context=[],actions=[];
  for(const c of selected){
    const key=String(c.symbol).toUpperCase(),t=techMap.get(key),benchmark=chooseBenchmark(c.symbol),marketMtf=mtfFor(benchmark,maps),regime=marketRegime(marketMtf),mtf=mtfFor(key,maps),sec=sectorStrength.get(key),daily=maps.d1.get(key)?.closes||[];
    let maxCorr=null;for(const h of state.held){const hk=String(h.symbol).toUpperCase();if(hk===key)continue;const corr=correlation(daily,maps.d1.get(hk)?.closes||[]);if(corr!=null&&(maxCorr==null||corr>maxCorr))maxCorr=corr}
    const d=decisionFor(c,t,heldMap.get(key)||null,marketMtf,sec,state.style,mtf,regime,quotes.get(key),maxCorr,heldSectors.get(meta.get(key)?.sector)||0),q=quotes.get(key);
    context.push({symbol:c.symbol,held:heldMap.has(key),sector:meta.get(key)?.sector||null,benchmark,regime:regime.label,multiTimeframe:{longVotes:mtf.longVotes,shortVotes:mtf.shortVotes,alignment:mtf.alignment,m5:+num(mtf.m5?.momentumPct).toFixed(2),m15:+num(mtf.m15?.momentumPct).toFixed(2),h1:+num(mtf.h1?.momentumPct).toFixed(2),d1:+num(mtf.d1?.momentumPct).toFixed(2)},technical:t?{vwapDistancePct:+t.vwapDistancePct.toFixed(2),atrPct:+t.atrPct.toFixed(2),adx:+t.adx.toFixed(1),plusDI:+t.plusDI.toFixed(1),minusDI:+t.minusDI.toFixed(1),priceVsSupportPct:+t.priceVsSupportPct.toFixed(2),priceVsResistancePct:+t.priceVsResistancePct.toFixed(2),supportStrength:t.supportStrength,resistanceStrength:t.resistanceStrength,sessionBars:t.sessionBars,historyBars:t.historyBars,fresh:t.fresh}:null,liquidity:q?{spreadPct:q.spreadPct==null?null:+q.spreadPct.toFixed(3),avgVolume:q.avgVolume,volume:q.volume}:null,maxPortfolioCorrelation:maxCorr==null?null:+maxCorr.toFixed(2),marketRelative20m:d.marketRelative20m==null?null:+d.marketRelative20m.toFixed(2),sectorRelativeDay:d.sectorRelativeDay==null?null:+d.sectorRelativeDay.toFixed(2),fastAction:d.action,fastScore:d.fastScore,reason:d.reason});
    if(d.action!=='HOLD')actions.push({symbol:d.symbol,action:d.action,confidence:d.confidence,allocation_pct:d.allocation_pct,reason:d.reason});
  }
  const sells=actions.filter(x=>x.action==='SELL').length,buys=actions.filter(x=>x.action==='BUY').length;
  return{summary:`Fast-Decision: ${sells} SELL / ${buys} BUY aus ${context.length} Tiefenchecks. Historischer 5m-ADX/ATR + heutiger Sitzungs-VWAP, Multi-Timeframe, Swing-Level, Marktregime, Spread/Liquidität, Relativstärke und Depotkorrelation kombiniert.`,actions,context,calibration:{version:FAST_CALIBRATION.version,validated:Boolean(FAST_CALIBRATION.validated),sampleCount:num(FAST_CALIBRATION.sampleCount)}};
}

export function mergeFastRiskActions(aiResponse,fast){
  if(!fast?.actions?.length)return aiResponse;const raw=String(aiResponse?.response||aiResponse?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return aiResponse;
  try{const j=JSON.parse(raw.slice(a,b+1)),actions=Array.isArray(j.actions)?j.actions:[];for(const f of fast.actions.filter(x=>x.action==='SELL'&&x.confidence>=.72)){const i=actions.findIndex(x=>String(x.symbol).toUpperCase()===String(f.symbol).toUpperCase());if(i>=0)actions[i]={...actions[i],action:'SELL',confidence:Math.max(num(actions[i].confidence),f.confidence),allocation_pct:0,reason:`${f.reason} · Risiko-Overlay`};else actions.push({...f,reason:`${f.reason} · Risiko-Overlay`})}j.actions=actions;j.summary=`${String(j.summary||'KI-Plan').slice(0,310)} · ${fast.summary}`;return{...aiResponse,response:JSON.stringify(j)}}catch{return aiResponse}
}
