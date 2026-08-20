import {zeroOrderFee,zeroRoundTripBrokerFees} from './zero-fee-model.js';
import {candidateQuoteUnit,positionQuoteUnit,normalizeQuoteCurrency} from './quote-currency-units.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');
const v275=s=>String(s??'').replace(/FINAL-CONTROLLER V27\.(?:1|2|3|4)/g,'FINAL-CONTROLLER V27.5');
const MAX_ROUNDTRIP_COST_PCT=1.5;
const MIN_NET_EDGE_MARGIN_PCT=.05;

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
  score:num(c?.liveScore??c?.score,0),
  confidence:num(c?.liveConfidence??c?.confidence,0),
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
function marketRegimeGate(candidate={},action={}){
 const ff=candidate?.forwardForecast||{},reg=String(ff?.marketRegime?.regime||'UNKNOWN').toUpperCase(),m=metrics(candidate),type=String(action?.reason||'').match(/BUY\s+([A-Z_]+)/i)?.[1]||'';
 if(reg==='RISK_OFF'){
  const relativeStrength=m.m20>=.35&&m.m5>=.08&&m.accel>=.03&&m.score>=4.6&&m.confidence>=.60;
  if(!relativeStrength)return{block:true,multiplier:0,reason:'MARKET-REGIME V27.5: breiter Markt RISK_OFF; kein normaler BUY ohne klar bestätigte relative Stärke.'};
  return{block:false,multiplier:.55,reason:'MARKET-REGIME V27.5: RISK_OFF, aber klare relative Stärke; Positionsgröße vorsorglich 45% reduziert.'};
 }
 if(reg==='REVERSAL_DOWN')return{block:false,multiplier:.70,reason:'MARKET-REGIME V27.5: breiter Markt dreht ab; Positionsgröße 30% reduziert.'};
 if(reg==='RANGE'&&type==='EARLY_BREAKOUT')return{block:false,multiplier:.75,reason:'MARKET-REGIME V27.5: Range-Markt; Breakout-Größe 25% reduziert.'};
 return{block:false,multiplier:1,reason:''};
}
function matureExpectedMove(candidate={},action={}){
 const ff=candidate?.forwardForecast||{},samples=Math.max(0,num(ff?.samples,0)||0),symbols=Math.max(0,num(ff?.uniqueSymbols,0)||0),h15=num(ff?.horizons?.[15]?.expectedPct,null),h30=num(ff?.horizons?.[30]?.expectedPct,null);
 if(samples>=8&&symbols>=3&&h15!==null&&h30!==null)return{mature:true,samples,symbols,expectedPct:h15*.60+h30*.40,source:'forward-15/30'};
 const e=candidate?.calibratedExpectation||candidate?.entryExpectation||null,n=Math.max(0,num(e?.samples15,0)||0),p=num(e?.posteriorExpectedMovePct,null);
 if(n>=12&&p!==null)return{mature:true,samples:n,symbols:null,expectedPct:p,source:'timing-calibration'};
 const reason=String(action?.reason||''),match=reason.match(/E\[Move\]\s*([+-]?\d+(?:[.,]\d+)?)%.*?n=(\d+)/i);
 if(match){const parsed=Number(match[1].replace(',','.')),rn=Number(match[2]);if(Number.isFinite(parsed)&&rn>=12)return{mature:true,samples:rn,symbols:null,expectedPct:parsed,source:'final-controller-calibration'};}
 return{mature:false,samples,symbols,expectedPct:null,source:'insufficient'};
}
export function enforceLossSellInvariant(plan,state={}){
 if(!plan||!Array.isArray(plan.actions))return{plan,blocked:0,uneconomicBuys:0,netEdgeBlocks:0,edgeBlocks:0,marketRegimeBlocks:0,regimeBlocks:0,marketRegimeCaps:0,regimeCaps:0,minorUnitBlocks:0};
 const positions=new Map(arr(state?.positions).map(p=>[key(p),p]));
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c]));
 let blocked=0,uneconomicBuys=0,netEdgeBlocks=0,marketRegimeBlocks=0,marketRegimeCaps=0,minorUnitBlocks=0;
 const actions=plan.actions.map(a=>{
  const s=key(a),normalized={...a,reason:v275(a?.reason)},action=String(a?.action||'').toUpperCase();
  if(action==='BUY'){
   const c=candidates.get(s)||{},unit=candidateQuoteUnit(c),baseCurrency=normalizeQuoteCurrency(state?.config?.currency||'EUR'),quoteCurrency=normalizeQuoteCurrency(c?.currency||unit.majorCurrency),fx=num(c?.fxRate??c?.fx_rate,null),fxVerified=c?.fxVerified===true||c?.fx_verified===true||quoteCurrency===baseCurrency;
   if(quoteCurrency&&quoteCurrency!==baseCurrency&&!(fxVerified&&fx>0)){return{symbol:s,action:'HOLD',confidence:Math.max(.78,num(a?.confidence,.78)),allocation_pct:0,reason:`FX-SAFETY V27.5: BUY blockiert · ${quoteCurrency}/${baseCurrency} aktuell nicht verifiziert. Kein Ersatzkurs 1 und keine Fremdwährungsorder ohne belastbaren FX-Kurs.`};}
   const unitCheck=unit;
   if(unitCheck.minorUnit&&!c?.quoteUnitNormalized&&!c?.quote_unit_normalized){minorUnitBlocks++;return{symbol:s,action:'HOLD',confidence:Math.max(.72,num(a?.confidence,.72)),allocation_pct:0,reason:`QUOTE-UNIT-SAFETY V27.5: BUY blockiert, weil ${unitCheck.rawCurrency} noch nicht auf ${unitCheck.majorCurrency}-Haupteinheit normalisiert ist. Kein Handel auf potenziell 100x falscher Preisbasis.`};}
   const eco=buyEconomics(a,c,state);
   if(!eco.ok){uneconomicBuys++;return{symbol:s,action:'HOLD',confidence:Math.max(.66,num(a?.confidence,.66)),allocation_pct:0,reason:`ORDER-ECONOMICS V27.5: BUY blockiert · vorgesehenes Budget ${eco.budget.toFixed(2)} € · ${eco.reason} · Limit ${MAX_ROUNDTRIP_COST_PCT.toFixed(2)}%. Keine Mini-Order, deren Gebühren/Slippage den erwarteten Vorteil auffressen.`};}
   const edge=matureExpectedMove(c,a);if(edge.mature&&edge.expectedPct!==null&&edge.expectedPct<=eco.costPct+MIN_NET_EDGE_MARGIN_PCT){netEdgeBlocks++;return{symbol:s,action:'HOLD',confidence:Math.max(.68,num(a?.confidence,.68)),allocation_pct:0,reason:`NET-EDGE V27.5: BUY blockiert · reifer erwarteter Move ${edge.expectedPct>=0?'+':''}${edge.expectedPct.toFixed(3)}% (${edge.source}, n=${edge.samples}) reicht nicht über erwartete Roundtrip-Kosten ${eco.costPct.toFixed(2)}% + Sicherheitsmarge ${MIN_NET_EDGE_MARGIN_PCT.toFixed(2)}%.`};}
   const gate=marketRegimeGate(c,a);if(gate.block){marketRegimeBlocks++;return{symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:gate.reason};}
   if(gate.multiplier<1){marketRegimeCaps++;return{...normalized,allocation_pct:+(Math.max(0,num(a?.allocation_pct,0))*gate.multiplier).toFixed(2),reason:`${normalized.reason} · ${gate.reason}`};}
   return normalized;
  }
  if(action!=='SELL')return normalized;
  const p=positions.get(s);if(!p)return normalized;
  const pUnit=positionQuoteUnit(p);if(pUnit.minorUnit&&!p?.minor_unit_repaired_at&&!p?.quote_unit_repaired_at){minorUnitBlocks++;return{symbol:s,action:'HOLD',confidence:Math.max(.80,num(a?.confidence,.80)),allocation_pct:0,reason:`QUOTE-UNIT-SAFETY V27.5: SELL blockiert, weil die Bestandsposition noch rohe ${pUnit.rawCurrency}-Preise enthalten kann. Erst ${pUnit.majorCurrency}-Preis/FX-Basis reparieren; kein automatischer Verkauf auf potenziell 100x falscher Bewertung.`};}
  const c={...p,...(candidates.get(s)||{})},net=netExitSnapshot(p,c,state?.config||{});if(net.pct===null||net.pct>0)return normalized;
  const reason=String(a?.reason||''),m=metrics(c),external=hardExternal(c,reason),contradiction=explicitExitHold(reason),independent=strongIndependentBreak(m),profitExitNetLoss=/PROFIT EXIT/i.test(reason);
  const buyerSideStronger=m.sellers!==null&&m.sellers<50,shallowPriceDamage=net.priceMovePct===null||net.priceMovePct>-1.25,mustHold=!external&&(contradiction||profitExitNetLoss||buyerSideStronger||(shallowPriceDamage&&!independent));
  if(!mustHold)return normalized;
  blocked++;
  const sellerText=m.sellers===null?'Verkäuferanteil nicht bestätigt':`Verkäufer ${m.sellers.toFixed(0)}%`,netText=net.euro===null?`Netto-P/L ${net.pct.toFixed(2)}%`:`Netto-P/L bei Exit ca. ${net.euro>=0?'+':''}${net.euro.toFixed(2)} € (${net.pct.toFixed(2)}%)`,why=profitExitNetLoss?'„PROFIT EXIT“ wäre nach echten ZERO-Gebühren tatsächlich ein Verlust':contradiction?'tiefere Prüfung fordert ausdrücklich HOLD':'keine ausreichend unabhängige bestätigte Verkäufer-/Strukturinvaliderung';
  return{symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:`LOSS-SELL-INVARIANT V27.5: Verlustverkauf blockiert · ${netText} · ${sellerText} · ${why} · kein externer Hard-Risk. Position weiter beobachten statt Kosten/Marktrauschen als Verlust zu realisieren.`};
 });
 const suffix=`${blocked?` · LOSS-SELL-INVARIANT: ${blocked} unnötige(n) Verlust-SELL(s) blockiert.`:''}${uneconomicBuys?` · ORDER-ECONOMICS: ${uneconomicBuys} unwirtschaftliche Mini-BUY(s) blockiert.`:''}${netEdgeBlocks?` · NET-EDGE: ${netEdgeBlocks} nach Kosten negative/zu schwache BUY(s) blockiert.`:''}${marketRegimeBlocks?` · MARKET-REGIME: ${marketRegimeBlocks} BUY(s) im Risk-off blockiert.`:''}${marketRegimeCaps?` · MARKET-REGIME-CAP: ${marketRegimeCaps} BUY-Größe(n) reduziert.`:''}${minorUnitBlocks?` · QUOTE-UNIT-SAFETY: ${minorUnitBlocks} Handel auf unnormalisierter Minor-Unit-Basis blockiert.`:''}`;
 return{plan:{...plan,actions,summary:v275(plan.summary)+suffix},blocked,uneconomicBuys,netEdgeBlocks,edgeBlocks:netEdgeBlocks,marketRegimeBlocks,regimeBlocks:marketRegimeBlocks,marketRegimeCaps,regimeCaps:marketRegimeCaps,minorUnitBlocks};
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
