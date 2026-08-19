const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

export function mergePositionTranche(existing={},tranche={},marks={}){
 const oldInvested=Math.max(0,num(existing?.invested)),addInvested=Math.max(0,num(tranche?.notional)),total=oldInvested+addInvested;
 if(!(addInvested>0&&total>0))return{...existing};
 const oldPrice=Math.max(1e-12,num(existing?.entry_price,1)),oldFx=Math.max(1e-12,num(existing?.entry_fx,1)),addPrice=Math.max(1e-12,num(tranche?.entryPrice)),addFx=Math.max(1e-12,num(tranche?.fx,1));
 const oldBasisQty=oldInvested/(oldPrice*oldFx),addBasisQty=addInvested/(addPrice*addFx),basisQty=oldBasisQty+addBasisQty,basisProduct=basisQty>0?total/basisQty:addPrice*addFx;
 const entryFx=total>0?(oldFx*oldInvested+addFx*addInvested)/total:addFx,entryPrice=basisProduct/Math.max(entryFx,1e-12),oldQty=num(existing?.zero_quantity,oldBasisQty),addQty=Number.isFinite(Number(tranche?.quantity))&&Number(tranche.quantity)>0?Number(tranche.quantity):addBasisQty;
 return{
  ...existing,
  invested:total,
  entry_fee:Math.max(0,num(existing?.entry_fee))+Math.max(0,num(tranche?.fee)),
  entry_price:entryPrice,
  entry_fx:entryFx,
  zero_quantity:Math.max(0,oldQty)+Math.max(0,addQty),
  last_price:num(marks?.lastPrice,num(existing?.last_price,addPrice)),
  last_fx:num(marks?.lastFx,num(existing?.last_fx,addFx)),
  score:num(marks?.score,num(existing?.score)),
  signal_confidence:num(marks?.confidence,num(existing?.signal_confidence)),
  last_added_at:String(marks?.addedAt||new Date().toISOString()),
  last_add_entry_price:addPrice,
  last_add_fx:addFx,
  last_add_notional:addInvested,
  last_add_fee:Math.max(0,num(tranche?.fee)),
  add_count:Math.max(0,Math.floor(num(existing?.add_count)))+1
 };
}

export function scaleUpAllocation({cash=0,capital=0,invested=0,pnlPct=0,minutesSinceAdd=999,qualified=false,secondChance=false}={}){
 cash=Math.max(0,num(cash));capital=Math.max(.01,num(capital,cash+num(invested)));invested=Math.max(0,num(invested));pnlPct=num(pnlPct);minutesSinceAdd=Math.max(0,num(minutesSinceAdd));
 if(!(cash>2)&&(qualified||secondChance))return{allowed:false,allocationPct:0,targetPositionPct:0,reason:'kein freies Cash'};
 if(!qualified&&!secondChance)return{allowed:false,allocationPct:0,targetPositionPct:0,reason:'keine erneute Qualitätsbestätigung'};
 if(minutesSinceAdd<10)return{allowed:false,allocationPct:0,targetPositionPct:0,reason:`Aufstockungs-Hysterese ${minutesSinceAdd.toFixed(1)}/10 Min.`};
 if(pnlPct<-2&&!secondChance)return{allowed:false,allocationPct:0,targetPositionPct:0,reason:'keine normale Aufstockung in deutlichen Verlust ohne SECOND_CHANCE-Bestätigung'};
 const targetPositionPct=secondChance?20:14,maxCashPct=secondChance?10:6,targetValue=capital*targetPositionPct/100,room=Math.max(0,targetValue-invested),allocationPct=cash>0?Math.min(maxCashPct,room/cash*100):0;
 if(allocationPct<2)return{allowed:false,allocationPct:0,targetPositionPct,reason:'Position bereits nahe Zielgröße'};
 return{allowed:true,allocationPct:+clamp(allocationPct,0,maxCashPct).toFixed(4),targetPositionPct,maxCashPct,reason:`erneut bestätigt; Zielposition bis ${targetPositionPct}%`};
}
