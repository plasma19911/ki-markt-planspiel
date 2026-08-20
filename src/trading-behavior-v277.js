import {zeroOrderFee} from './zero-fee-model.js';

const KEY='state/trading-behavior-v277';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const text=r=>String(r?.response||r?.result?.response||'');
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

function parsePlan(r){const raw=text(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function defaults(){return{version:2,signals:{},peaks:{},updatedAt:null}}
function metrics(c={}){return{
 score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),price:num(c?.price,c?.last_price),day:num(c?.day,c?.day_change),
 m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),
 rsi:num(c?.intradayRsi,c?.rsi??50),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,
 sellers:Number.isFinite(Number(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct))?Number(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct):Number.isFinite(Number(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct))?100-Number(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct):null,
 news:num(c?.news,c?.newsScore??c?.news_score),event:String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase()
}}
function entryType(reason=''){return String(reason).match(/BUY\s+(EARLY_BREAKOUT|PULLBACK_RECLAIM|BASE_RECLAIM|AGM_PREVIEW)/i)?.[1]?.toUpperCase()||'UNKNOWN'}
function family(t){return t==='PULLBACK_RECLAIM'||t==='BASE_RECLAIM'?'RECLAIM':t}
function positionValue(p={}){const invested=Math.max(0,num(p?.invested)),ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return ep>0&&lp>0&&ef>0&&lf>0?invested*(lp/ep)*(lf/ef):invested}
function portfolio(state={}){const cash=Math.max(0,num(state?.config?.cash)),market=arr(state?.positions).reduce((a,p)=>a+positionValue(p),0),equity=Math.max(1,cash+market);return{cash,market,equity,investedRatio:market/equity}}
function lateImpulse(m){return m.m5>=1.0||m.accel>=.80||(m.m5>=.65&&m.rsi>=72)||(m.day>=5&&m.m5>=.55)}
function deteriorating(m){return m.m5<-.08||m.m20<-.12||m.accel<-.04}
function exceptional(m){return m.score>=4.9&&m.confidence>=.68&&m.m5>=.06&&m.m5<=.65&&m.m20>=.18&&m.accel>=.02&&m.accel<=.35&&m.rsi>=45&&m.rsi<70&&m.day<=3.2}
function strongCandidate(m){return m.score>=4.55&&m.confidence>=.62&&m.m20>=.15&&m.m5>=.04&&m.accel>=.015&&m.rsi<73}
function hardRisk(c={},reason=''){const m=metrics(c);return (m.event==='HIGH'&&String(c?.eventText??c?.event_text??'').trim())||m.news<=-.65||/(?:HARD[- ]?EVENT|NOTAUSSTIEG|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST)/i.test(String(reason))}
function strongWinnerBreak(c={}){const m=metrics(c),seller=m.sellers!==null&&m.sellers>=62;return (seller&&m.m20<=-.18&&m.accel<=-.03)||(seller&&m.m5<=-.30)||(m.m20<=-.40&&m.accel<=-.07)}
function firstPositive(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n)&&n>0)return n}return 0}
function netExit(position={},candidate={},config={}){
 const invested=Math.max(0,num(position?.invested)),entryFee=Math.max(0,num(position?.entry_fee)),price=firstPositive(candidate?.price,candidate?.last_price,position?.last_price,position?.entry_price),fx=firstPositive(candidate?.fxRate,candidate?.fx_rate,candidate?.last_fx,position?.last_fx,position?.entry_fx),qty=num(position?.zero_quantity,0),entryPrice=num(position?.entry_price),entryFx=firstPositive(position?.entry_fx,1);
 if(!(invested>0&&price>0&&fx>0))return{euro:null,pct:null};
 const slip=Math.max(0,num(config?.slippage_percent,.10)),execPrice=price*(1-slip/100),execEur=execPrice*fx;
 let gross=qty>0?qty*execEur:entryPrice>0?invested*(execPrice/entryPrice)*(fx/entryFx):null;if(!(gross>=0))return{euro:null,pct:null};
 const type=String(position?.instrument_type||'EQUITY').toUpperCase(),fee=zeroOrderFee({notionalEur:gross,priceEur:execEur,quantity:qty>0?qty:null,instrumentType:type,fractionalAllowed:type!=='ETF'}).total||0,net=gross-fee-invested-entryFee,den=invested+entryFee;
 return{euro:net,pct:den>0?net/den*100:null,exitFee:fee,fx};
}
function convictionCapPct(m,type,riskMode='offensiv'){
 const mode=String(riskMode||'offensiv').toLowerCase(),mult=mode==='vorsichtig'?.78:mode==='ausgewogen'?.90:1;
 let cap=exceptional(m)?25:strongCandidate(m)?22:18;if(type==='AGM_PREVIEW')cap=Math.min(cap,12);return cap*mult;
}
function normalizeVersion(s=''){return String(s).replace(/FINAL-CONTROLLER V27\.(?:1|2|3|4|5|6)/g,'FINAL-CONTROLLER V27.7')}
function resetSignal(mem,s,type,m,now){mem.signals[s]={at:now,lastSeenAt:now,type,family:family(type),score:m.score,confidence:m.confidence,price:m.price};return mem.signals[s]}
function touchSignal(mem,s,now){const old=mem.signals[s];if(old)old.lastSeenAt=now;return old}

export function enforceTradingBehaviorV277(plan,state={},storage=null,now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const mem={...defaults(),...read(storage,defaults())};mem.signals={...(mem.signals||{})};mem.peaks={...(mem.peaks||{})};
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c])),positions=new Map(arr(state?.positions).map(p=>[key(p),p])),pf=portfolio(state);
 const counters={entryConfirmationWaits:0,lateImpulseBlocks:0,deteriorationBlocks:0,saturationBlocks:0,convictionSizeCaps:0,tinyProfitHolds:0,confirmationResets:0};
 // Track winner high-water marks only inside the current run/position lifetime.
 for(const [s,p] of positions){const c={...p,...(candidates.get(s)||{})},net=netExit(p,c,state?.config||{}),opened=String(p?.opened_at||p?.openedAt||''),old=mem.peaks[s];if(!old||old.opened!==opened)mem.peaks[s]={opened,peakNetPct:Number.isFinite(net.pct)?net.pct:0};else if(Number.isFinite(net.pct))old.peakNetPct=Math.max(num(old.peakNetPct),net.pct)}
 for(const s of Object.keys(mem.peaks))if(!positions.has(s))delete mem.peaks[s];
 const out=[];
 for(const raw of plan.actions){
  const s=key(raw),action=String(raw?.action||'').toUpperCase(),reason=normalizeVersion(raw?.reason||''),a={...raw,reason};
  if(action==='BUY'){
   if(positions.has(s)){out.push({symbol:s,action:'HOLD',confidence:Math.max(.78,num(a?.confidence,.78)),allocation_pct:0,reason:'TRADING-BEHAVIOR V27.7: Bestandsposition wird nicht erneut gekauft. Automatische Aufstockung bleibt aus.'});continue}
   const c=candidates.get(s)||{},m=metrics(c),type=entryType(reason),fam=family(type);let sig=mem.signals[s];
   const sigAge=sig?Math.max(0,(now-num(sig.at,now))/60000):Infinity,lastSeenAge=sig?Math.max(0,(now-num(sig.lastSeenAt??sig.at,now))/60000):Infinity;
   if(lateImpulse(m)){counters.lateImpulseBlocks++;if(sig){delete mem.signals[s];counters.confirmationResets++}out.push({symbol:s,action:'HOLD',confidence:Math.max(.72,num(a?.confidence,.72)),allocation_pct:0,reason:`ENTRY-PATIENCE V27.7: ${s} ist im aktuellen 5-Minuten-Impuls zu schnell gelaufen (5m ${m.m5.toFixed(2)}%, Beschleunigung ${m.accel.toFixed(2)}). Kein FOMO-Kauf; erst Stabilisierung/Reclaim und danach neue Bestätigung.`});continue}
   if(deteriorating(m)){counters.deteriorationBlocks++;if(sig){delete mem.signals[s];counters.confirmationResets++}out.push({symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:`ENTRY-PATIENCE V27.7: Setup verschlechtert sich vor Ausführung (5m ${m.m5.toFixed(2)}%, 20m ${m.m20.toFixed(2)}%, Beschleunigung ${m.accel.toFixed(2)}). Bestätigung wird zurückgesetzt; kein Kauf in nachlassende Struktur.`});continue}
   if(pf.investedRatio>=.85&&!strongCandidate(m)){counters.saturationBlocks++;if(!sig||sig.family!==fam||sigAge>20)resetSignal(mem,s,type,m,now);else touchSignal(mem,s,now);out.push({symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:`CAPITAL-SELECTIVITY V27.7: Depot bereits ${(pf.investedRatio*100).toFixed(0)}% investiert. Restcash bleibt für überdurchschnittliche Setups reserviert; aktuelles Signal ist dafür nicht stark genug.`});continue}
   // Start a baseline only once. One-minute scans may update lastSeenAt, but must not
   // reset `at`, otherwise the required 2-minute confirmation can never mature.
   if(!sig||sig.family!==fam||sigAge>20||lastSeenAge>7){sig=resetSignal(mem,s,type,m,now);counters.entryConfirmationWaits++;out.push({symbol:s,action:'HOLD',confidence:Math.max(.68,num(a?.confidence,.68)),allocation_pct:0,reason:'ENTRY-CONFIRM V27.7: erster gesunder Setup-Snapshot gespeichert; vor BUY wird eine zeitlich getrennte Bestätigung abgewartet.'});continue}
   const priceJump=sig.price>0&&m.price>0?(m.price/sig.price-1)*100:null;
   if(priceJump!==null&&priceJump>.80){resetSignal(mem,s,type,m,now);counters.entryConfirmationWaits++;counters.confirmationResets++;out.push({symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:`ENTRY-CONFIRM V27.7: Kurs ist seit dem ersten Signal bereits weitere +${priceJump.toFixed(2)}% gelaufen. Nicht hinterherkaufen; neue Bestätigungsbasis ab aktuellem Kurs.`});continue}
   const confirmed=Boolean(sigAge>=2&&sigAge<=20&&lastSeenAge<=7&&m.score>=Math.max(3.55,num(sig.score)-.5)&&m.confidence>=.52);
   if(!exceptional(m)&&!confirmed){touchSignal(mem,s,now);counters.entryConfirmationWaits++;out.push({symbol:s,action:'HOLD',confidence:Math.max(.68,num(a?.confidence,.68)),allocation_pct:0,reason:`ENTRY-CONFIRM V27.7: gesundes Setup bleibt bestehen, Bestätigungsalter ${sigAge.toFixed(1)} Min.; normaler BUY erst ab 2 Min. stabiler Struktur.`});continue}
   const riskMode=state?.config?.risk_mode??state?.config?.riskMode??'offensiv',capEqPct=convictionCapPct(m,type,riskMode),maxValue=pf.equity*capEqPct/100,maxCashPct=pf.cash>0?100*maxValue/pf.cash:0,requested=Math.max(0,num(a?.allocation_pct)),allowed=Math.min(requested,maxCashPct);
   touchSignal(mem,s,now);
   if(allowed+0.01<requested){counters.convictionSizeCaps++;out.push({...a,allocation_pct:+allowed.toFixed(2),reason:`${reason} · CONVICTION-SIZING V27.7: neue Position auf max. ${capEqPct.toFixed(1)}% Depotwert begrenzt; Größe folgt Qualität statt freiem Cash.`});continue}
   out.push(a);continue;
  }
  if(action==='SELL'){
   const p=positions.get(s),c={...(p||{}),...(candidates.get(s)||{})};
   if(p&&/PROFIT EXIT|GEWINNER|WINNER/i.test(reason)){
    const net=netExit(p,c,state?.config||{}),threshold=Math.max(2.5,num(p?.invested)*.0035),peak=num(mem.peaks?.[s]?.peakNetPct,net.pct||0),giveback=Number.isFinite(net.pct)?peak-net.pct:0,breakNow=strongWinnerBreak(c);
    if(Number.isFinite(net.euro)&&net.euro>0&&net.euro<threshold&&!hardRisk(c,reason)&&!(peak>=1.2&&giveback>=.8&&breakNow)&&!breakNow){counters.tinyProfitHolds++;out.push({symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:`PROFIT-PATIENCE V27.7: erwarteter Netto-Gewinn bei Exit nur ca. +${net.euro.toFixed(2)} €; sinnvoller Mindestpuffer aktuell ${threshold.toFixed(2)} €. Ohne bestätigten Gewinnerbruch nicht für Cent-Gewinn drehen.`});continue}
   }
   out.push(a);continue;
  }
  out.push(a);
 }
 for(const [s,v] of Object.entries(mem.signals))if(now-num(v?.lastSeenAt??v?.at,0)>45*60000&&!positions.has(s))delete mem.signals[s];
 mem.version=2;mem.updatedAt=new Date(now).toISOString();write(storage,mem);
 plan.actions=out;plan.summary=`${normalizeVersion(plan.summary||'FINAL-CONTROLLER V27.7')} · BEHAVIOR V27.7: ${counters.entryConfirmationWaits} Entry-Bestätigung(en) abgewartet · ${counters.lateImpulseBlocks} Impuls-/FOMO-BUY(s) geblockt · ${counters.saturationBlocks} Restcash-BUY(s) verworfen · ${counters.tinyProfitHolds} Mini-Gewinn-SELL(s) gehalten.`;
 return{plan,counters,state:mem};
}

export class TradingBehaviorGuardV277{
 constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null;}
 async run(input){const r=await this.inner.run(input),plan=parsePlan(r);if(!plan)return r;const state=typeof this.getState==='function'?(this.getState()||{}):{},result=enforceTradingBehaviorV277(plan,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=result.counters;return encode(r,result.plan)}
 status(){return{enabled:true,version:27.7,stateVersion:2,latest:this.latest,entryConfirmation:true,minuteScanConfirmationSafe:true,lateImpulseRecheck:true,tinyProfitPatience:true,heldFxFallbackSafe:true,portfolioSaturationSelectivity:true,convictionSizing:true,rule:'Normale BUYs brauchen zeitlich getrennte Bestätigung; 1-Minuten-Scans setzen den Bestätigungstimer nicht zurück. Extreme 5m-Impulse werden nicht gejagt. Bei hoher Depotauslastung wird Restcash nur für starke Setups eingesetzt. PROFIT-EXITs mit Cent-Nettoertrag bleiben ohne echten Gewinnerbruch HOLD.'}}
}
