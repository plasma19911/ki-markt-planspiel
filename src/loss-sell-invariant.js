import {zeroOrderFee,zeroRoundTripBrokerFees} from './zero-fee-model.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');
const v274=s=>String(s??'').replace(/FINAL-CONTROLLER V27\.(?:1|2|3)/g,'FINAL-CONTROLLER V27.4');
const MAX_ROUNDTRIP_COST_PCT=1.5;
const NET_EDGE_SAFETY_PCT=.05;
const MIN_EDGE_SAMPLES=8;
const MIN_EDGE_SYMBOLS=3;

function parsePlan(r){
 const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
 if(a<0||b<=a)return null;
 try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}
}
function explicitExitHold(reason=''){
 return/(?:ADAPTIVE\s+EXIT[- ]?HOLD|EXIT[- ]?HOLD|VERKÄUFERSTRUKTUR[^.]{0,100}(?:NICHT|NOCH NICHT)[^.]{0,100}(?:STARK|AUSREICHEND)|SELLER STRUCTURE[^.]{0,100}(?:NOT|INSUFFICIENT)|WEITER BEOBACHTEN(?: STATT ZU FRÜH SCHLIEßEN)?|HOLD STATT SELL)/i.test(String(reason));
}
function hardExternal(c={},reason=''){
 const event=String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase();
 const eventText=String(c?.eventText??c?.event_text??'').trim();
 const news=num(c?.news??c?.newsScore??c?.news_score,0);
 return (event==='HIGH'&&Boolean(eventText))||news<=-.65||/(?:HARD[- ]?EVENT[- ]?EXIT|NOTAUSSTIEG|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST)/i.test(String(reason));
}
function sellerShare(c={}){
 const s=num(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct,null);
 if(s!==null)return s;
 const b=num(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct,null);
 return b===null?null:100-b;
}
function metrics(c={}){
 return{
  m5:num(c?.intraday5m??c?.momentum5,0),
  m20:num(c?.intraday20m??c?.momentum20,0),
  accel:num(c?.momentumAcceleration5??c?.momentum_acceleration5,0),
  draw:num(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,null),
  sellers:sellerShare(c)
 };
}
function priceFx(c={},p={}){
 const price=num(c?.price??c?.last_price??p?.last_price??p?.lastPrice,null),fx=num(c?.fxRate??c?.fx_rate??c?.last_fx??p?.last_fx??p?.lastFx,1)||1;
 return{price,fx,priceEur:price===null?null:price*fx};
}
function netExitSnapshot(position={},candidate={},config={}){
 const invested=num(position?.invested,null),entryFee=num(position?.entry_fee,0)||0,{price,fx,priceEur}=priceFx(candidate,position);
 if(!(invested>0&&price>0&&fx>0)){
  for(const v of [position?.netPnlPct,position?.net_pnl_pct,position?.pnlPct,position?.pnl_pct,position?.pnl]){const n=num(v,null);if(n!==null)return{pct:n,euro:null,gross:null,exitFee:null,priceMovePct:n};}
  return{pct:null,euro:null,gross:null,exitFee:null,priceMovePct:null};
 }
 const slip=Math.max(0,num(config?.slippage_percent,.10)||0),execPrice=price*(1-slip/100),execPriceEur=execPrice*fx,qty=num(position?.zero_quantity,null),entryPrice=num(position?.entry_price??position?.entryPrice,null),entryFx=num(position?.entry_fx,1)||1;
 let gross=qty!==null&&qty>0?qty*execPriceEur:null;
 if(!(gross>=0)&&entryPrice>0)gross=invested*(execPrice/entryPrice)*(fx/entryFx);
 if(!(gross>=0))return{pct:null,euro:null,gross:null,exitFee:null,priceMovePct:null};
 const type=String(position?.instrument_type||'EQUITY').toUpperCase(),feeInfo=zeroOrderFee({notionalEur:gross,priceEur:execPriceEur,quantity:qty,instrumentType:type,fractionalAllowed:type!=='ETF'}),exitFee=num(feeInfo?.total,0)||0,netEuro=gross-exitFee-invested-entryFee,den=invested+entryFee,pct=den>0?netEuro/den*100:null,entryBase=entryPrice>0?entryPrice*entryFx:null,priceMovePct=entryBase>0?(execPriceEur/entryBase-1)*100:null;
 return{pct,euro:netEuro,gross,exitFee,entryFee,priceMovePct,feeInfo};
}
function strongIndependentBreak(m){
 const sellerControl=m.sellers!==null&&m.sellers>=62;
 const trendBreak=m.m20<=-.22&&m.accel<=-.035;
 const fastBreak=m.m5<=-.30&&m.m20<=-.15&&m.accel<=-.03;
 const severeBreak=m.m20<=-.45&&m.accel<=-.08&&(m.draw===null||m.draw<=-1.0);
 return (sellerControl&&(trendBreak||fastBreak))||severeBreak;
}
function buyEconomics(action,candidate,state={}){
 const cash=Math.max(0,num(state?.config?.cash,0)||0),pct=Math.max(0,num(action?.allocation_pct,0)||0),budget=cash*pct/100,{priceEur}=priceFx(candidate,{}),type=String(candidate?.type??candidate?.instrument_type??'EQUITY').toUpperCase();
 if(!(budget>0&&priceEur>0))return{ok:true,budget,costPct:0};
 const fees=zeroRoundTripBrokerFees({notionalEur:budget,priceEur,instrumentType:type,fractionalAllowed:type!=='ETF'});if(!fees?.affordable||!(fees.tradeNotional>0))return{ok:false,budget,costPct:Infinity,fees,reason:'ZERO-Ausführung nicht wirtschaftlich/ausführbar'};
 const slip=Math.max(0,num(state?.config?.slippage_percent,.10)||0),costPct=(num(fees.total,0)/fees.tradeNotional*100)+2*slip;
 return{ok:costPct<=MAX_ROUNDTRIP_COST_PCT,budget,costPct,fees,reason:`erwartete Roundtrip-Kosten ${costPct.toFixed(2)}%`};
}
function setupType(action={}){
 const explicit=String(action?.setup_type||'').toUpperCase();if(explicit)return explicit;
 const m=String(action?.reason||'').match(/\bBUY\s+(EARLY_BREAKOUT|PULLBACK_RECLAIM|BASE_RECLAIM)\b/i);return String(m?.[1]||'').toUpperCase();
}
function marketRegimePolicy(action,candidate={}){
 const reg=candidate?.forwardForecast?.marketRegime||{},regime=String(reg?.regime||'UNKNOWN').toUpperCase(),type=setupType(action),m=metrics(candidate),score=num(candidate?.liveScore??candidate?.score,0)||0,confidence=num(candidate?.liveConfidence??candidate?.confidence,0)||0,news=num(candidate?.news??candidate?.newsScore??candidate?.news_score,0)||0,rel20=m.m20-(num(reg?.median20,0)||0),rel5=m.m5-(num(reg?.median5,0)||0);
 if(regime==='RISK_OFF'){
  const strongBreakout=score>=5.1&&confidence>=.66&&m.m20>=.35&&m.m5>=.10&&m.accel>=.04&&rel20>=.25&&rel5>=.12&&news>=-.05;
  const strongReclaim=['PULLBACK_RECLAIM','BASE_RECLAIM'].includes(type)&&score>=4.4&&confidence>=.58&&m.m5>=.04&&m.accel>=.03&&rel20>=.15;
  if(type==='EARLY_BREAKOUT'&&!strongBreakout)return{block:true,multiplier:0,regime,reason:`RISK_OFF: EARLY_BREAKOUT nicht stark genug relativ zum Markt (rel20 ${rel20.toFixed(2)}, rel5 ${rel5.toFixed(2)})`};
  if(type!=='EARLY_BREAKOUT'&&!strongReclaim)return{block:true,multiplier:0,regime,reason:`RISK_OFF: kein ausreichend bestätigter Reclaim relativ zum Markt`};
  return{block:false,multiplier:.55,regime,reason:'RISK_OFF: nur relative Stärke erlaubt; Positionsgröße auf 55% reduziert'};
 }
 if(regime==='REVERSAL_DOWN'){
  const strongBreakout=score>=4.8&&confidence>=.62&&m.m20>=.25&&m.m5>=.08&&m.accel>=.035&&rel20>=.18;
  const reclaim=['PULLBACK_RECLAIM','BASE_RECLAIM'].includes(type)&&m.m5>=.03&&m.accel>=.025&&rel20>=.10;
  if(type==='EARLY_BREAKOUT'&&!strongBreakout)return{block:true,multiplier:0,regime,reason:'REVERSAL_DOWN: schwacher Breakout gegen drehenden Gesamtmarkt'};
  if(type!=='EARLY_BREAKOUT'&&!reclaim)return{block:true,multiplier:0,regime,reason:'REVERSAL_DOWN: Reclaim noch nicht bestätigt'};
  return{block:false,multiplier:.70,regime,reason:'REVERSAL_DOWN: neue Long-Position vorsichtiger dimensioniert'};
 }
 if(regime==='RANGE'&&type==='EARLY_BREAKOUT'&&!(score>=5&&confidence>=.65))return{block:false,multiplier:.75,regime,reason:'RANGE: normaler Breakout auf 75% Größe gekappt'};
 return{block:false,multiplier:1,regime,reason:null};
}
function expectedEdgePolicy(action,candidate={},economics={}){
 const reason=String(action?.reason||''),em=reason.match(/E\[Move\]\s*([+-]?\d+(?:\.\d+)?)%/i),nm=reason.match(/\bn=(\d+)\b/i),ff=candidate?.forwardForecast||{},expectedFromReason=em?Number(em[1]):null,ff15=num(ff?.horizons?.[15]?.expectedPct,null),ff30=num(ff?.horizons?.[30]?.expectedPct,null),ffExpected=ff15!==null&&ff30!==null?ff15*.60+ff30*.40:null,expected=expectedFromReason!==null?expectedFromReason:ffExpected,n=nm?Number(nm[1]):0,ffSamples=Math.max(0,num(ff?.samples,0)||0),ffSymbols=Math.max(0,num(ff?.uniqueSymbols,0)||0),mature=n>=MIN_EDGE_SAMPLES||(ffSamples>=MIN_EDGE_SAMPLES&&ffSymbols>=MIN_EDGE_SYMBOLS),cost=num(economics?.costPct,0)||0,netEdge=expected===null?null:expected-cost,minimum=cost+NET_EDGE_SAFETY_PCT,block=mature&&expected!==null&&expected<minimum;
 return{block,mature,expected,cost,netEdge,n,ffSamples,ffSymbols,minimum,reason:block?`reifer Erwartungswert ${expected.toFixed(3)}% deckt Roundtrip-Kosten ${cost.toFixed(2)}% plus ${NET_EDGE_SAFETY_PCT.toFixed(2)}% Sicherheitsmarge nicht`:`${mature&&expected!==null?`erwarteter Netto-Vorteil ${netEdge>=0?'+':''}${netEdge.toFixed(3)}%`:'Erwartungswert noch nicht reif genug für einen Kosten-Hardblock'}`};
}
export function enforceLossSellInvariant(plan,state={}){
 if(!plan||!Array.isArray(plan.actions))return{plan,blocked:0,uneconomicBuys:0,edgeBlocks:0,regimeBlocks:0,regimeCaps:0};
 const positions=new Map(arr(state?.positions).map(p=>[key(p),p]));
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c]));
 let blocked=0,uneconomicBuys=0,edgeBlocks=0,regimeBlocks=0,regimeCaps=0;
 const actions=plan.actions.map(a=>{
  const s=key(a),normalized={...a,reason:v274(a?.reason)},action=String(a?.action||'').toUpperCase();
  if(action==='BUY'){
   const c=candidates.get(s)||{},regime=marketRegimePolicy(normalized,c);
   if(regime.block){regimeBlocks++;return{symbol:s,action:'HOLD',confidence:Math.max(.68,num(a?.confidence,.68)),allocation_pct:0,reason:`MARKET-REGIME V27.4: BUY blockiert · ${regime.reason}. Kein Long-Trade nur weil der Einzelchart kurzfristig grün aussieht.`};}
   let adjusted=normalized;
   if(regime.multiplier<1){regimeCaps++;adjusted={...normalized,allocation_pct:+(Math.max(0,num(normalized?.allocation_pct,0)||0)*regime.multiplier).toFixed(2),reason:`${normalized.reason} · MARKET-REGIME V27.4: ${regime.reason}.`};}
   const eco=buyEconomics(adjusted,c,state);
   if(!eco.ok){uneconomicBuys++;return{symbol:s,action:'HOLD',confidence:Math.max(.66,num(a?.confidence,.66)),allocation_pct:0,reason:`ORDER-ECONOMICS V27.4: BUY blockiert · vorgesehenes Budget ${eco.budget.toFixed(2)} € · ${eco.reason} · Limit ${MAX_ROUNDTRIP_COST_PCT.toFixed(2)}%. Keine Mini-Order, deren Gebühren/Slippage den erwarteten Vorteil auffressen.`};}
   const edge=expectedEdgePolicy(adjusted,c,eco);
   if(edge.block){edgeBlocks++;return{symbol:s,action:'HOLD',confidence:Math.max(.68,num(a?.confidence,.68)),allocation_pct:0,reason:`NET-EDGE V27.4: BUY blockiert · ${edge.reason}. Ein positives Rohsignal reicht nicht, wenn der statistische Vorteil nach Kosten negativ ist.`};}
   if(edge.mature&&edge.expected!==null)adjusted={...adjusted,reason:`${adjusted.reason} · NET-EDGE V27.4: E[Move] ${edge.expected>=0?'+':''}${edge.expected.toFixed(3)}% vs. Kosten ${edge.cost.toFixed(2)}% => netto ${edge.netEdge>=0?'+':''}${edge.netEdge.toFixed(3)}%.`};
   return adjusted;
  }
  if(action!=='SELL')return normalized;
  const p=positions.get(s);if(!p)return normalized;
  const c={...p,...(candidates.get(s)||{})},net=netExitSnapshot(p,c,state?.config||{});if(net.pct===null||net.pct>0)return normalized;
  const reason=String(a?.reason||''),m=metrics(c),external=hardExternal(c,reason),contradiction=explicitExitHold(reason),independent=strongIndependentBreak(m),profitExitNetLoss=/PROFIT EXIT/i.test(reason);
  const buyerSideStronger=m.sellers!==null&&m.sellers<50,shallowPriceDamage=net.priceMovePct===null||net.priceMovePct>-1.25,mustHold=!external&&(contradiction||profitExitNetLoss||buyerSideStronger||(shallowPriceDamage&&!independent));
  if(!mustHold)return normalized;
  blocked++;
  const sellerText=m.sellers===null?'Verkäuferanteil nicht bestätigt':`Verkäufer ${m.sellers.toFixed(0)}%`,netText=net.euro===null?`Netto-P/L ${net.pct.toFixed(2)}%`:`Netto-P/L bei Exit ca. ${net.euro>=0?'+':''}${net.euro.toFixed(2)} € (${net.pct.toFixed(2)}%)`,why=profitExitNetLoss?'„PROFIT EXIT“ wäre nach echten ZERO-Gebühren tatsächlich ein Verlust':contradiction?'tiefere Prüfung fordert ausdrücklich HOLD':'keine ausreichend unabhängige bestätigte Verkäufer-/Strukturinvaliderung';
  return{symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:`LOSS-SELL-INVARIANT V27.4: Verlustverkauf blockiert · ${netText} · ${sellerText} · ${why} · kein externer Hard-Risk. Position weiter beobachten statt Kosten/Marktrauschen als Verlust zu realisieren.`};
 });
 const suffix=`${blocked?` · LOSS-SELL-INVARIANT: ${blocked} unnötige(n) Verlust-SELL(s) blockiert.`:''}${uneconomicBuys?` · ORDER-ECONOMICS: ${uneconomicBuys} unwirtschaftliche Mini-BUY(s) blockiert.`:''}${edgeBlocks?` · NET-EDGE: ${edgeBlocks} nach Kosten unattraktive BUY(s) blockiert.`:''}${regimeBlocks?` · MARKET-REGIME: ${regimeBlocks} Long-BUY(s) gegen schwachen Gesamtmarkt blockiert.`:''}${regimeCaps?` · MARKET-REGIME: ${regimeCaps} Positionsgröße(n) risikoadaptiv reduziert.`:''}`;
 return{plan:{...plan,actions,summary:v274(plan.summary)+suffix},blocked,uneconomicBuys,edgeBlocks,regimeBlocks,regimeCaps};
}
export class LossSellInvariant{
 constructor(base,{getState=null}={}){this.base=base;this.getState=getState;}
 async run(model,input){
  const r=await this.base.run(model,input),plan=parsePlan(r);if(!plan)return r;
  const state=typeof this.getState==='function'?(this.getState()||{}):{};
  const out=enforceLossSellInvariant(plan,state).plan;
  return{...r,response:JSON.stringify(out)};
 }
}
