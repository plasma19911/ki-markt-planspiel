import {getTradeDecisionLearning} from './trade-decision-learning.js';

const KEY='state/trade-maturity-v280';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const text=r=>String(r?.response||r?.result?.response||'');
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

function defaults(){return{version:1,snapshots:{},entries:{},exitWatches:{},stats:{earlyLossExitRecovered:0,goodLossExit:0},recent:[],updatedAt:null}}
function parsePlan(r){const raw=text(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function metrics(c={}){return{
 score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),price:num(c?.price,c?.last_price),day:num(c?.day,c?.day_change),
 m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi:num(c?.intradayRsi,c?.rsi??50),
 news:num(c?.news,c?.newsScore??c?.news_score),event:String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase(),eventText:String(c?.eventText??c?.event_text??''),
 state:String(c?.momentumState??c?.momentum_state??'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal??c?.momentum_sell_signal??'NONE').toUpperCase(),
 sellers:Number.isFinite(Number(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct))?Number(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct):Number.isFinite(Number(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct))?100-Number(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct):null
}}
function heldPnlPct(p={}){for(const v of [p?.pnlPct,p?.pnl_pct,p?.pnl])if(Number.isFinite(Number(v)))return Number(v);const ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return ep>0&&lp>0&&ef>0&&lf>0?(lp*lf/(ep*ef)-1)*100:0}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at??p?.openedAt??''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
function hardRisk(c={},reason=''){const m=metrics(c),r=String(reason),neg=/(?:KEIN(?:E|EN|ER)?|NICHT|UNBESTÄTIGT|UNBESTAETIGT|NO\s+|NOT\s+)\s{0,20}(?:STRONG[- ]?SELL|HARD[- ]?EVENT|REVERSAL)/i.test(r);return (m.event==='HIGH'&&m.eventText.trim())||m.news<=-.65||m.sell==='STRONG'||(!neg&&/(?:HARD[- ]?EVENT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST)/i.test(r))}
function severeBreak(m,pl=0){const seller=m.sellers!==null&&m.sellers>=68;return (seller&&m.m20<=-.30&&m.accel<=-.04)||(m.m5<=-.48&&m.m20<=-.28&&m.accel<=-.055)||(pl<=-2.5&&m.m20<=-.30&&m.accel<=-.04)}
function mildNoise(m,pl=0){const sellerBad=m.sellers!==null&&m.sellers>=64;return pl>-1.6&&m.m20>-.28&&m.accel>-.055&&!sellerBad}
function hotReason(reason=''){return/(?:OPPORTUNITY-RECHECK|zu schnell gelaufen|FOMO|Nicht hinterherkaufen|PEAK|OVERHEAT|HIGH-CHASE)/i.test(String(reason))}
function stockOnly(c={}){const t=String(c?.instrument_type??c?.instrumentType??c?.type??'EQUITY').toUpperCase();return !/(?:ETF|ETP|FUND)/.test(t)}
function safetyHold(reason=''){return/(?:HARD|EVENT|NEWS-IMPACT|NEWS-SHOCK|REVERSAL|STRONG SELL|VENUE|GETTEX|FX|QUOTE|FALLING KNIFE)/i.test(String(reason))}
function acceleratingSetup(m,prev,now){
 if(!prev||!(m.price>0)||m.event==='HIGH'||m.state==='REVERSAL'||m.sell==='STRONG'||m.news<-.15)return false;
 const age=(now-num(prev.at,now))/60000;if(age<.45||age>6)return false;
 const scoreDelta=m.score-num(prev.score),confDelta=m.confidence-num(prev.confidence),newsDelta=m.news-num(prev.news);
 const improving=scoreDelta>=.20||confDelta>=.025||newsDelta>=.18;
 return improving&&m.score>=5.15&&m.confidence>=.60&&m.m5>=.02&&m.m5<=.48&&m.m20>=.03&&m.accel>=.018&&m.rsi<71&&m.day<=4.0;
}
function learnedMinHold(storage,mem,m,entry={}){
 const dl=getTradeDecisionLearning(storage),exitPatience=num(dl?.summary?.exitPatienceMultiplier,1),st=mem?.stats||{},bad=num(st.earlyLossExitRecovered),good=num(st.goodLossExit),regret=bad/Math.max(1,bad+good);
 let minutes=15+Math.max(0,exitPatience-1)*25+regret*6;
 if(String(entry?.type||'').includes('CATALYST'))minutes+=2;
 if(Math.abs(m.m5)>=.35||Math.abs(m.m20)>=.75)minutes+=2;
 return clamp(minutes,12,30);
}
function starterPct(state,m){const cash=Math.max(0,num(state?.config?.cash)),market=arr(state?.positions).reduce((a,p)=>a+Math.max(0,num(p?.invested)),0),equity=Math.max(1,cash+market),cashRatio=cash/equity;let pct=m.score>=5.8?12:10;if(cashRatio>=.55)pct+=2;if(cash>=500)pct=Math.max(pct,500/cash*100);return clamp(pct,7,16)}
function entryType(reason=''){const m=String(reason).match(/(?:BUY|OPPORTUNITY-LEARNING V27\.9)\s+(?:[^:]*\s)?(CATALYST|RECLAIM|TRAINING|EARLY_BREAKOUT|PULLBACK_RECLAIM|BASE_RECLAIM)/i);return m?.[1]?.toUpperCase()||'UNKNOWN'}
function learnExitWatches(mem,candidates,now){
 for(const [s,w] of Object.entries(mem.exitWatches||{})){
  const c=candidates.get(s),m=metrics(c||{}),age=(now-num(w.at,now))/60000;if(!c||!(m.price>0)){if(age>35)delete mem.exitWatches[s];continue}
  const move=(m.price/num(w.price,m.price)-1)*100;w.peak=Math.max(num(w.peak,0),move);w.trough=Math.min(num(w.trough,0),move);w.lastSeenAt=now;
  if(age>=5&&w.lossExit&&!w.resolved&&w.peak>=.80){w.resolved=true;mem.stats.earlyLossExitRecovered=num(mem.stats.earlyLossExitRecovered)+1;mem.recent.push({at:now,symbol:s,type:'EARLY_LOSS_EXIT_RECOVERED',minutes:+age.toFixed(1),postExitPeakPct:+w.peak.toFixed(2)});delete mem.exitWatches[s];continue}
  if(age>=12&&!w.resolved&&w.trough<=-.80&&w.peak<.45){w.resolved=true;mem.stats.goodLossExit=num(mem.stats.goodLossExit)+1;mem.recent.push({at:now,symbol:s,type:'GOOD_LOSS_EXIT',minutes:+age.toFixed(1),postExitTroughPct:+w.trough.toFixed(2)});delete mem.exitWatches[s];continue}
  if(age>35)delete mem.exitWatches[s];
 }
}

export function enforceTradeMaturityV280(plan,state={},storage=null,now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const mem={...defaults(),...read(storage,defaults())};mem.snapshots={...(mem.snapshots||{})};mem.entries={...(mem.entries||{})};mem.exitWatches={...(mem.exitWatches||{})};mem.stats={...defaults().stats,...(mem.stats||{})};mem.recent=arr(mem.recent);
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c])),positions=new Map(arr(state?.positions).map(p=>[key(p),p]));
 learnExitWatches(mem,candidates,now);
 const priorSnapshots={...mem.snapshots};
 for(const [s,c] of candidates){const m=metrics(c);mem.snapshots[s]={at:now,score:m.score,confidence:m.confidence,news:m.news,price:m.price,m5:m.m5,m20:m.m20,accel:m.accel}}
 const counters={acceleratedEntries:0,earlyLossHolds:0,recoveryHolds:0,hardExitsPreserved:0,severeBreakExits:0,exitRegretLearned:num(mem.stats.earlyLossExitRecovered)};
 const out=[];
 for(const raw of plan.actions){
  const s=key(raw),action=String(raw?.action||'').toUpperCase(),reason=String(raw?.reason||''),c=candidates.get(s)||{},m=metrics(c),p=positions.get(s);
  if(action==='BUY'){
   mem.entries[s]={at:now,type:entryType(reason),score:m.score,confidence:m.confidence};out.push(raw);continue;
  }
  if(action==='HOLD'&&!p&&s&&candidates.has(s)&&stockOnly(c)&&!hotReason(reason)&&!safetyHold(reason)&&acceleratingSetup(m,priorSnapshots[s],now)){
   const pct=+starterPct(state,m).toFixed(2);counters.acceleratedEntries++;mem.entries[s]={at:now,type:'ACCELERATING_SETUP',score:m.score,confidence:m.confidence};
   out.push({symbol:s,action:'BUY',confidence:clamp(Math.max(.63,m.confidence),.60,.86),allocation_pct:pct,reason:`TRADE-MATURITY V28.0 ACCELERATING_SETUP BUY: Setup verbessert sich über aufeinanderfolgende Scans und wird vor dem späten Ausbruch erkannt · Score ${m.score.toFixed(2)} · Confidence ${m.confidence.toFixed(2)} · 5m ${m.m5.toFixed(2)} · 20m ${m.m20.toFixed(2)} · Beschleunigung ${m.accel.toFixed(2)} · Starter ${pct.toFixed(1)}% Cash. Kein FOMO-/Peak-Bypass.`});continue;
  }
  if(action==='SELL'&&p){
   const pl=heldPnlPct({...p,...c}),age=ageMinutes(p,now),entry=mem.entries[s]||{},minHold=learnedMinHold(storage,mem,m,entry),recoveryWindow=Math.min(35,minHold+10);
   if(hardRisk(c,reason)){counters.hardExitsPreserved++;mem.exitWatches[s]={at:now,price:m.price||num(p?.last_price),lossExit:pl<0,peak:0,trough:0};delete mem.entries[s];out.push(raw);continue}
   if(severeBreak(m,pl)){counters.severeBreakExits++;mem.exitWatches[s]={at:now,price:m.price||num(p?.last_price),lossExit:pl<0,peak:0,trough:0};delete mem.entries[s];out.push(raw);continue}
   if(pl<=0&&age<minHold){counters.earlyLossHolds++;out.push({symbol:s,action:'HOLD',confidence:Math.max(.76,num(raw?.confidence,.76)),allocation_pct:0,reason:`THESIS-MATURITY V28.0: Position erst ${age.toFixed(1)} Min. offen und ${pl.toFixed(2)}% im Minus. Normales Anfangsrauschen ist kein Exit. Gelernte Mindest-Reifezeit ${minHold.toFixed(1)} Min.; früher SELL nur bei hartem Risiko oder bestätigtem schweren Strukturbruch.`});continue}
   if(pl<=0&&age<recoveryWindow&&mildNoise(m,pl)){counters.recoveryHolds++;out.push({symbol:s,action:'HOLD',confidence:Math.max(.74,num(raw?.confidence,.74)),allocation_pct:0,reason:`RECOVERY-WINDOW V28.0: ${s} liegt ${pl.toFixed(2)}% zurück, aber Verkäufer-/Trendstruktur bestätigt noch keinen echten Bruch. Bis max. ${recoveryWindow.toFixed(1)} Min. bekommt die These Zeit zur Erholung; kein Verlustverkauf nur wegen kurzer Schwäche.`});continue}
   mem.exitWatches[s]={at:now,price:m.price||num(p?.last_price),lossExit:pl<0,peak:0,trough:0};delete mem.entries[s];out.push(raw);continue;
  }
  out.push(raw);
 }
 for(const s of Object.keys(mem.entries))if(!positions.has(s)&&!out.some(a=>key(a)===s&&String(a?.action).toUpperCase()==='BUY')&&now-num(mem.entries[s]?.at,0)>60*60000)delete mem.entries[s];
 for(const [s,v] of Object.entries(mem.snapshots))if(now-num(v?.at,0)>20*60000&&!candidates.has(s))delete mem.snapshots[s];
 if(mem.recent.length>120)mem.recent=mem.recent.slice(-120);mem.version=1;mem.updatedAt=new Date(now).toISOString();write(storage,mem);
 plan.actions=out;plan.summary=`${String(plan.summary||'').slice(0,190)} · MATURITY V28.0: ${counters.acceleratedEntries} früher erkannte BUY(s) · ${counters.earlyLossHolds} frühe Verlust-SELL(s) gehalten · ${counters.recoveryHolds} Recovery-HOLD(s) · ${counters.hardExitsPreserved+counters.severeBreakExits} echte Risiko-Exit(s) erlaubt.`;
 return{plan,counters,state:mem};
}

export class TradeMaturityGuardV280{
 constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
 async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const plan=parsePlan(r);if(!plan)return r;const result=enforceTradeMaturityV280(plan,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=result;return encode(r,result.plan)}
 status(){const s=this.latest?.state||{...defaults(),...read(this.storage,defaults())};return{enabled:true,version:28.0,paperTradingOnly:true,stocksOnly:true,acceleratingSetupRecognition:true,learnedMinimumHold:true,earlyLossNoiseProtection:true,recoveryWindow:true,hardRiskImmediate:true,severeStructureBreakImmediate:true,postExitRecoveryLearning:true,latest:this.latest?.counters||null,stats:s?.stats||{},recent:arr(s?.recent).slice(-12).reverse(),rule:'V28.0 erkennt sich verbessernde Setups über mehrere Scans früher und schützt frisch eröffnete Positionen vor Verlustverkäufen aus normalem Anfangsrauschen. Soft-SELL im Minus braucht Reifezeit oder echten Strukturbruch; harte Risiken bleiben sofort ausführbar. Post-Exit-Rebounds trainieren die künftige Haltedauer.'}}
}
