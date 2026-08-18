const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/GapOverlay)'};
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const MAX_GAP_SYMBOLS=12;

function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function stateFromPrompt(prompt){const candidates=parseJsonBetween(prompt,'Kandidaten=',' Gehalten='),held=parseJsonBetween(prompt,' Gehalten=');return{candidates:Array.isArray(candidates)?candidates:[],held:Array.isArray(held)?held:[]}}

async function chart(symbol){
  try{
    const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return null;const res=(await r.json())?.chart?.result?.[0];if(!res)return null;
    const q=res?.indicators?.quote?.[0]||{},ts=res.timestamp||[],rows=[];
    for(let i=0;i<ts.length;i++){
      const open=num(q.open?.[i],NaN),high=num(q.high?.[i],NaN),low=num(q.low?.[i],NaN),close=num(q.close?.[i],NaN),volume=Math.max(0,num(q.volume?.[i]));
      if(Number.isFinite(high)&&Number.isFinite(low)&&Number.isFinite(close))rows.push({open:Number.isFinite(open)?open:close,high,low,close,volume});
    }
    if(rows.length<3)return null;return{rows,previousClose:num(res.meta?.previousClose,rows[0].open),lastTs:num(res.meta?.regularMarketTime)};
  }catch{return null}
}

function analyze(c){
  if(!c?.rows?.length)return null;const rows=c.rows,first=rows[0],last=rows.at(-1),prev=num(c.previousClose,first.open),opening=first.open||first.close,gapPct=prev?(opening/prev-1)*100:0,or=rows.slice(0,Math.min(3,rows.length)),orHigh=Math.max(...or.map(x=>x.high)),orLow=Math.min(...or.map(x=>x.low));
  let pv=0,vs=0;for(const r of rows){const w=Math.max(0,r.volume),tp=(r.high+r.low+r.close)/3;pv+=tp*w;vs+=w}const vwap=vs?pv/vs:rows.reduce((a,x)=>a+x.close,0)/rows.length,price=last.close,aboveRange=price>orHigh,belowRange=price<orLow,aboveVwap=price>vwap,volBase=rows.slice(1,Math.min(13,rows.length)).map(x=>x.volume).filter(x=>x>0),base=volBase.length?volBase.reduce((a,b)=>a+b,0)/volBase.length:0,openingVolumeRatio=base?first.volume/base:1;
  let state='NORMAL',blockBuy=false,sellRisk=0,reasons=[];
  if(gapPct>=1.5){
    if(aboveRange&&aboveVwap){state='GAP_AND_GO';reasons.push('Aufwärts-Gap hält über Opening Range und VWAP')}
    else if(!aboveVwap&&belowRange){state='GAP_FADE';sellRisk=gapPct>=3?2.4:1.6;blockBuy=true;reasons.push('Aufwärts-Gap fällt unter VWAP und Opening Range zurück')}
    else{state='GAP_UNCONFIRMED';blockBuy=gapPct>=3;reasons.push('Aufwärts-Gap noch nicht bestätigt')}
    if(gapPct>=5&&!aboveRange){blockBuy=true;reasons.push('großes Gap ohne Range-Bestätigung: nicht hinterherkaufen')}
  }else if(gapPct<=-1.5){
    if(belowRange&&!aboveVwap){state='GAP_DOWN_CONTINUATION';sellRisk=Math.abs(gapPct)>=3?2.4:1.6;reasons.push('Abwärts-Gap bleibt unter Opening Range und VWAP')}
    else if(aboveRange&&aboveVwap){state='GAP_DOWN_RECOVERY';reasons.push('Abwärts-Gap vollständig über Opening Range/VWAP zurückerobert')}
    else{state='GAP_DOWN_MIXED';reasons.push('Abwärts-Gap ohne klare Fortsetzung oder Erholung')}
  }
  return{gapPct,openingRangeHigh:orHigh,openingRangeLow:orLow,vwap,aboveRange,belowRange,aboveVwap,openingVolumeRatio,state,blockBuy,sellRisk,reasons,fresh:Date.now()/1000-num(c.lastTs,0)<35*60};
}

export async function buildGapOverlay(prompt){
  const s=stateFromPrompt(prompt),held=new Set(s.held.map(x=>String(x.symbol).toUpperCase())),selected=[];
  for(const c of s.candidates)if(held.has(String(c.symbol).toUpperCase())&&!selected.some(x=>x.symbol===c.symbol)&&selected.length<MAX_GAP_SYMBOLS)selected.push(c);
  for(const c of s.candidates){if(selected.length>=MAX_GAP_SYMBOLS)break;if(!selected.some(x=>x.symbol===c.symbol))selected.push(c)}
  const rows=await Promise.all(selected.map(async c=>({candidate:c,gap:analyze(await chart(c.symbol))}))),context=[],actions=[];
  for(const x of rows){const c=x.candidate,g=x.gap,key=String(c.symbol).toUpperCase();if(!g)continue;let action='HOLD',confidence=.5,reason=`GAP ${g.state}: ${g.reasons.join(' · ')}`;
    if(held.has(key)&&g.sellRisk>=2.2&&(g.state==='GAP_FADE'||g.state==='GAP_DOWN_CONTINUATION')){action='SELL';confidence=clamp(.65+g.sellRisk*.08,.68,.9);actions.push({symbol:c.symbol,action:'SELL',confidence,allocation_pct:0,reason:`FAST-GAP-SELL: ${g.reasons.join(' · ')}`})}
    context.push({symbol:c.symbol,held:held.has(key),gapPct:+g.gapPct.toFixed(2),state:g.state,blockBuy:g.blockBuy,openingVolumeRatio:+g.openingVolumeRatio.toFixed(2),aboveOpeningRange:g.aboveRange,belowOpeningRange:g.belowRange,aboveVwap:g.aboveVwap,action,confidence,reason});
  }
  return{summary:`Gap/Opening-Range: ${context.filter(x=>x.state!=='NORMAL').length} aktive Gap-Lagen aus ${context.length}/${MAX_GAP_SYMBOLS} möglichen Checks.`,actions,context,maxSymbols:MAX_GAP_SYMBOLS};
}

export function applyGapOverlay(fast,gap){
  if(!fast)return fast;const actions=[...(fast.actions||[])],gmap=new Map((gap?.context||[]).map(x=>[String(x.symbol).toUpperCase(),x]));
  for(let i=actions.length-1;i>=0;i--){const a=actions[i],g=gmap.get(String(a.symbol).toUpperCase());if(a.action==='BUY'&&g?.blockBuy){actions.splice(i,1);continue}if(a.action==='BUY'&&g?.state==='GAP_AND_GO')a.reason=`${a.reason} · Gap-and-go bestätigt`}
  for(const s of gap?.actions||[]){if(s.action!=='SELL')continue;const i=actions.findIndex(x=>String(x.symbol).toUpperCase()===String(s.symbol).toUpperCase());if(i>=0)actions[i]={...actions[i],action:'SELL',allocation_pct:0,confidence:Math.max(num(actions[i].confidence),num(s.confidence)),reason:`${s.reason} · Opening-Range-Risiko`};else actions.push(s)}
  return{...fast,actions,summary:`${fast.summary} ${gap?.summary||''}`.trim(),gapContext:gap?.context||[]};
}
