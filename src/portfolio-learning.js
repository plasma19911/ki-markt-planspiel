import {MarketPortfolio as BasePortfolio} from './portfolio-no-leverage.js';
import {AI_MODEL,clamp,num} from './constants.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const FEATURES=['emaGapPct','priceVsEma21Pct','rsi','mom5Pct','mom20Pct','dayPct','volatility20Pct'];
const STATUS_CACHE_MS=58000;

function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;for(const v of a.slice(p))e=v*k+e*(1-k);return e}
function rsi(a,p=14){if(a.length<p+1)return null;let g=0,l=0,s=a.slice(-(p+1));for(let i=1;i<s.length;i++){const d=s[i]-s[i-1];d>0?g+=d:l-=d}if(!l)return 100;const rs=(g/p)/(l/p);return 100-100/(1+rs)}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function std(a){if(a.length<2)return 0;const m=avg(a);return Math.sqrt(avg(a.map(x=>(x-m)**2)))}
function positionValue(p){if(!p?.entry_price)return num(p?.invested);return num(p.invested)*(num(p.last_price)/num(p.entry_price))*(num(p.last_fx,1)/num(p.entry_fx,1))}

async function loadLearning(env){
 try{
  const r=await env.ASSETS.fetch(new Request('https://assets.local/analysis-2026.json'));
  if(!r.ok)return null;const j=await r.json(),m=j?.strategyLearning;
  return m?.available?m:null;
 }catch{return null}
}

async function dailyContexts(candidates){
 const items=(candidates||[]).filter(x=>x?.symbol&&x.type!=='LEVERAGED_ETF').slice(0,12);if(!items.length)return new Map();
 try{
  const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',items.map(x=>x.symbol).join(','));u.searchParams.set('range','3mo');u.searchParams.set('interval','1d');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
  const r=await fetch(u,{headers:HEADERS});if(!r.ok)return new Map();const j=await r.json(),out=new Map();
  for(const item of j?.spark?.result||[]){const res=item?.response?.[0];if(!res)continue;const sym=String(item.symbol||res?.meta?.symbol||'').toUpperCase(),c=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);if(c.length<22)continue;const price=c.at(-1),e9=ema(c,9),e21=ema(c,21),rr=rsi(c),m5=(price/c.at(-6)-1)*100,m20=(price/c.at(-21)-1)*100,day=(price/c.at(-2)-1)*100,rets=[];for(let i=Math.max(1,c.length-20);i<c.length;i++)rets.push((c[i]/c[i-1]-1)*100);out.set(sym,{emaGapPct:e9&&e21?(e9/e21-1)*100:0,priceVsEma21Pct:e21?(price/e21-1)*100:0,rsi:rr,mom5Pct:m5,mom20Pct:m20,dayPct:day,volatility20Pct:std(rets)})}
  return out;
 }catch{return new Map()}
}

function applyLearning(ctx,model){
 if(!ctx||!model?.available)return{expected3dPct:null,perfectSimilarity:null,usable:false};
 let pred=num(model.interceptPct),dist=0,n=0;
 for(const k of FEATURES){const sd=Math.max(1e-9,Math.abs(num(model.std?.[k],1))),z=(num(ctx[k])-num(model.mean?.[k]))/sd;pred+=z*num(model.coefficients?.[k]);const pm=model.perfectHindsightPreBuyProfile?.mean?.[k];if(Number.isFinite(Number(pm))){dist+=Math.abs((num(ctx[k])-num(pm))/sd);n++}}
 const v=model.validation||{},usable=num(v.correlation)>0.02&&num(v.topPredictedQuintileForward3Pct)>num(v.overallForward3Pct);
 return{expected3dPct:clamp(pred,-20,20),perfectSimilarity:n?clamp(1-(dist/n)/3,0,1):null,usable};
}

export class MarketPortfolio extends BasePortfolio {
 constructor(ctx,env){
  super(ctx,env);
  this._statusMemo=null;
  this._statusMemoAt=0;
 }
 invalidateStatus(){this._statusMemo=null;this._statusMemoAt=0}
 async status(){
  const now=Date.now();
  if(this._statusMemo&&now-this._statusMemoAt<STATUS_CACHE_MS)return this._statusMemo;
  const s=await super.status();
  this._statusMemo=s;this._statusMemoAt=Date.now();
  return s;
 }
 async start(options={}){this.invalidateStatus();const r=await super.start(options);this.invalidateStatus();return r}
 async stop(){this.invalidateStatus();const r=await super.stop();this.invalidateStatus();return r}
 async reset(){this.invalidateStatus();const r=await super.reset();this.invalidateStatus();return r}
 async scan(){this.invalidateStatus();try{return await super.scan()}finally{this.invalidateStatus()}}

 async aiPlan(cands,ps,cfg){
  if(!cfg.ai_enabled)return{summary:'KI deaktiviert',actions:[]};
  const allowed=(cands||[]).filter(x=>x.type!=='LEVERAGED_ETF');if(!allowed.length)return{summary:'NEWS-ONLY bzw. keine frischen handelbaren Kurse – keine Orderentscheidung.',actions:[]};
  const held=(ps||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF'),model=await loadLearning(this.env),daily=await dailyContexts(allowed),validation=model?.validation||{};
  const enriched=allowed.slice(0,12).map(x=>{const d=daily.get(String(x.symbol).toUpperCase()),l=applyLearning(d,model);return{x,d,l,priority:num(x.score)+num(x.confidence)+((l.usable&&l.expected3dPct!=null)?clamp(l.expected3dPct,-4,4)*.22:0)+(l.perfectSimilarity!=null?l.perfectSimilarity*.18:0)}}).sort((a,b)=>b.priority-a.priority);
  const data=enriched.map(({x,d,l})=>({symbol:x.symbol,type:x.type,theme:x.theme,liveScore:+num(x.score).toFixed(2),liveConfidence:+num(x.confidence).toFixed(2),day:+num(x.dayChange).toFixed(2),intraday5m:+num(x.momentum5).toFixed(2),intraday20m:+num(x.momentum20).toFixed(2),intradayRsi:x.rsi==null?null:+num(x.rsi).toFixed(1),daily:d?Object.fromEntries(FEATURES.map(k=>[k,+num(d[k]).toFixed(2)])):null,learnedExpected3dPct:l.expected3dPct==null?null:+num(l.expected3dPct).toFixed(2),perfectPreBuySimilarity:l.perfectSimilarity==null?null:+num(l.perfectSimilarity).toFixed(2),learningUsable:l.usable,news:+num(x.newsScore).toFixed(2),newsConfidence:+num(x.newsConfidence).toFixed(2),newsSources:x.newsSources||[],eventRisk:x.eventRisk,eventText:x.eventText||'',pro:(x.pro||[]).slice(0,5),contra:(x.contra||[]).slice(0,5),headlines:(x.headlines||[]).slice(0,3)}));
  const heldData=held.map(p=>({symbol:p.symbol,type:p.instrument_type,invested:num(p.invested),pnlPct:num(p.invested)?+((positionValue(p)/num(p.invested)-1)*100).toFixed(2):0,score:num(p.score),confidence:num(p.signal_confidence)}));
  const m=this.executionModel(cfg),learningInfo=model?`Historisches Kausalmodell ${model.modelVersion}; ${num(model.sampleCount)} Beispiele; Validierung Korrelation ${num(validation.correlation).toFixed(3)}, Richtungsquote ${num(validation.directionAccuracyPct).toFixed(1)}%, Top-Quintil Ø ${num(validation.topPredictedQuintileForward3Pct).toFixed(2)}% vs Gesamt ${num(validation.overallForward3Pct).toFixed(2)}%.`:'Historisches Lernmodell noch nicht verfügbar.';
  const prompt=`PAPER-TRADING ONLY, keine echten Orders. Du sollst nicht den perfekten Rückblick nachspielen, sondern aus seinen kausal verfügbaren Vorzeichen und aus allen historischen Gewinnern/Verlierern lernen. ${learningInfo} learnedExpected3dPct ist eine statistische 3-Tage-Vorerwartung aus Merkmalen, die am jeweiligen historischen Tag bereits bekannt waren. perfectPreBuySimilarity vergleicht nur mit dem LETZTEN ABGESCHLOSSENEN TAG VOR später perfekten Käufen; Zukunftskurse selbst sind verboten. Nutze das Lernmodell nur wenn learningUsable=true und nur als schwachen Prior, niemals als Garantie. Für frühe Käufe verlange möglichst mindestens zwei unabhängige Säulen: (A) positiver kausaler Lernwert/Tagestrend, (B) aktuelle Intraday-Bestätigung durch Trend/Momentum/Volumen, (C) frischer plausibler Katalysator aus News/Event mit guter Quellenkonfidenz. Sehr neue News sind wichtiger als alte; prüfe, ob der Kurs die Nachricht bereits stark eingepreist hat. Bevorzuge einen Einstieg VOR einer überhitzten Bewegung statt ihr hinterherzulaufen. Negative News, schwacher Mehrtagestrend, stark überhitzter RSI oder widersprechende Kursreaktion sind Gegenargumente. Bei gehaltenen Positionen darfst du frei SELL oder HOLD wählen; keine feste Haltedauer/Positionszahl/Branchenquote. Erlaubt: Aktien + normale ETFs. Cash ${num(cfg.cash).toFixed(2)} ${cfg.currency}; Kosten ${m.feeFixed.toFixed(2)} je Kauf/Verkauf + ${m.feePercent.toFixed(3)}%, Slippage ${m.slippagePercent.toFixed(2)}%. Die Summe neuer BUY-allocation_pct darf 100% des aktuell verfügbaren Cash nicht überschreiten. Gib keine versteckten Gedankengänge aus. reason soll knapp nennen: Hauptauslöser, warum jetzt statt später, wichtigste Gegenbedingung/Invalidierung. JSON-only {"summary":"kurz","actions":[{"symbol":"TICKER","action":"BUY|SELL|HOLD","confidence":0.0,"allocation_pct":0,"reason":"kurz"}]}. Kandidaten=${JSON.stringify(data)} Gehalten=${JSON.stringify(heldData)}`;
  try{const r=await this.env.AI.run(AI_MODEL,{messages:[{role:'user',content:prompt}],max_completion_tokens:1100}),t=String(r?.response||r?.result?.response||''),a=t.indexOf('{'),b=t.lastIndexOf('}');if(a<0||b<=a)throw new Error('kein JSON');const j=JSON.parse(t.slice(a,b+1));return{summary:String(j.summary||'KI-Lernplan').slice(0,500),actions:(Array.isArray(j.actions)?j.actions:[]).map(x=>({symbol:String(x.symbol||'').toUpperCase(),action:String(x.action||'HOLD').toUpperCase(),confidence:clamp(num(x.confidence),0,1),allocation_pct:clamp(num(x.allocation_pct),0,100),reason:String(x.reason||'').slice(0,420)})).filter(x=>['BUY','SELL','HOLD'].includes(x.action))}}catch(e){return{summary:`KI-Fallback: ${String(e.message||e).slice(0,160)}`,actions:[]}}
 }
}