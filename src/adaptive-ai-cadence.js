const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const arr=v=>Array.isArray(v)?v:[];

function parseBlock(text,start,end=null){
 const a=String(text||'').indexOf(start);if(a<0)return[];const from=a+start.length,b=end?String(text).indexOf(end,from):-1;
 try{const x=JSON.parse(String(text).slice(from,b>=0?b:String(text).length).trim());return arr(x)}catch{return[]}
}
function cashFromPrompt(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function dayOf(c){for(const k of ['day','day_change','dayChange','changePct'])if(Number.isFinite(Number(c?.[k])))return Number(c[k]);return 0}
function scoreOf(c){for(const k of ['liveScore','score','expectedScore','expected_value'])if(Number.isFinite(Number(c?.[k])))return Number(c[k]);return 0}
function confidenceOf(c){for(const k of ['liveConfidence','confidence','signal_confidence'])if(Number.isFinite(Number(c?.[k])))return Number(c[k]);return 0}

export function aiCadenceContext(prompt=''){
 const candidates=parseBlock(prompt,'Kandidaten=',' Gehalten='),held=parseBlock(prompt,' Gehalten='),cash=cashFromPrompt(prompt),invested=held.reduce((a,x)=>a+Math.max(0,num(x?.invested,x?.amount)),0),capital=Math.max(.01,cash+invested),cashShare=cash/capital;
 const strong=candidates.filter(c=>{
  const day=dayOf(c),score=scoreOf(c),conf=confidenceOf(c),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
  return score>=4.8&&conf>=.66&&day>=-8&&day<=3.5&&event!=='HIGH'&&sell!=='STRONG';
 }).sort((a,b)=>scoreOf(b)-scoreOf(a)||confidenceOf(b)-confidenceOf(a));
 return{cash,invested,cashShare,strongCandidate:strong[0]||null,strongCandidateCount:strong.length};
}

export function adaptivePlanCooldownMs(prompt='',baseMs=10*60*1000){
 const base=Math.max(60_000,num(baseMs,10*60*1000)),c=aiCadenceContext(prompt);
 // Viel ungenutztes Kapital + ein starkes, nicht bereits ueberhitztes Setup soll
 // schneller von der Voll-KI geprueft werden. Das erzeugt KEINEN BUY: alle nach-
 // gelagerten MTF-, Candle-Flow-, Event-, Venue- und Safety-Guards bleiben erhalten.
 if(c.strongCandidate&&c.cashShare>=.55)return Math.min(base,3*60*1000);
 if(c.strongCandidate&&c.cashShare>=.35)return Math.min(base,5*60*1000);
 return base;
}
