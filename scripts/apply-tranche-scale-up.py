from pathlib import Path
import re

# --- R2 execution: allow an already-held, revalidated symbol to receive a bounded new tranche.
p=Path('src/r2-portfolio.js')
t=p.read_text(encoding='utf-8')
imp="import {scanMarket} from './market-v3.js';"
newimp=imp+"\nimport {mergePositionTranche} from './position-scale-up.js';"
if "from './position-scale-up.js'" not in t:
    if t.count(imp)!=1: raise SystemExit('r2 import anchor unresolved')
    t=t.replace(imp,newimp)

old_held="held=s.positions.map(p=>({symbol:p.symbol,type:p.instrument_type,invested:num(p.invested),pnlPct:num(p.invested)?+((positionValue(p)/num(p.invested)-1)*100).toFixed(2):0,score:num(p.score)}))"
new_held="held=s.positions.map(p=>({symbol:p.symbol,name:p.name||p.symbol,type:p.instrument_type,invested:num(p.invested),pnlPct:num(p.invested)?+((positionValue(p)/num(p.invested)-1)*100).toFixed(2):0,score:num(p.score),opened_at:p.opened_at||null,last_added_at:p.last_added_at||null,add_count:num(p.add_count),entry_price:num(p.entry_price),last_price:num(p.last_price),entry_fx:num(p.entry_fx,1),last_fx:num(p.last_fx,1),currency:p.currency||null}))"
if old_held in t:t=t.replace(old_held,new_held)
elif new_held not in t:raise SystemExit('r2 held-prompt anchor unresolved')

new_open="""function openPosition(s,cand,notional,reason){const c=s.config,before=num(c.cash);if(cand.type==='LEVERAGED_ETF'||before<=0)return false;const existing=s.positions.find(p=>entityKey(p)===entityKey(cand));let amount=Math.max(0,num(notional)),f=fee(amount,c);if(amount+f>before){const fixed=Math.max(0,num(c.fee_fixed)),rate=Math.max(0,num(c.fee_percent))/100;amount=Math.max(0,(before-fixed)/(1+rate));f=fee(amount,c)}if(amount<=0||amount+f>before+1e-8)return false;const market=num(cand.price),fx=num(cand.fxRate,1);if(!(market>0&&fx>0))return false;const slip=slippage(c),exec=market*(1+slip/100),addedAt=nowIso();c.cash=Math.max(0,before-amount-f);c.total_fees=num(c.total_fees)+f;if(existing){const quantity=amount/(exec*fx),merged=mergePositionTranche(existing,{notional:amount,entryPrice:exec,fx,fee:f,quantity},{lastPrice:market,lastFx:fx,score:cand.score,confidence:cand.confidence,addedAt});Object.assign(existing,merged);const eq=equity(s);record(s,'KAUF',{symbol:existing.symbol,name:existing.name||cand.name,type:existing.instrument_type,amount:-(amount+f),fee:f,cashBefore:before,cashAfter:c.cash,equity:eq,score:cand.score,scanNo:num(c.scan_count)+1,reason:`AUFSTOCKUNG: ${reason} · Zusatzorder ${amount.toFixed(2)} ${c.currency} · Gebühr ${f.toFixed(2)} · Slippage ${slip.toFixed(2)}%`});logAI(s,'TRADE','Position aufgestockt',`${existing.symbol}: ${reason}`,{symbol:existing.symbol,confidence:num(cand.confidence),meta:{score:cand.score,amount,addCount:num(existing.add_count)}});return true}s.positions.push({symbol:cand.symbol,name:cand.name||cand.symbol,instrument_type:cand.type,theme:cand.theme||null,company_key:cand.companyKey||null,invested:amount,entry_fee:f,entry_price:exec,last_price:market,entry_fx:fx,last_fx:fx,currency:cand.currency||null,opened_at:addedAt,last_added_at:null,add_count:0,score:num(cand.score),signal_confidence:num(cand.confidence)});const eq=equity(s);record(s,'KAUF',{symbol:cand.symbol,name:cand.name,type:cand.type,amount:-(amount+f),fee:f,cashBefore:before,cashAfter:c.cash,equity:eq,score:cand.score,scanNo:num(c.scan_count)+1,reason:`${reason} · Order ${amount.toFixed(2)} ${c.currency} · Gebühr ${f.toFixed(2)} · Slippage ${slip.toFixed(2)}%`});logAI(s,'TRADE','Kauf ausgeführt',`${cand.symbol}: ${reason}`,{symbol:cand.symbol,confidence:num(cand.confidence),meta:{score:cand.score,amount}});return true}"""
if 'Position aufgestockt' not in t:
    t,n=re.subn(r"function openPosition\(s,cand,notional,reason\)\{.*?\}\nfunction closePosition",new_open+"\nfunction closePosition",t,count=1,flags=re.S)
    if n!=1: raise SystemExit('r2 openPosition function unresolved')

old_skip="for(const cand of candidates){if(!cand.fresh||existingKeys.has(entityKey(cand)))continue;"
new_skip="for(const cand of candidates){if(!cand.fresh)continue;"
if old_skip in t:t=t.replace(old_skip,new_skip)
elif new_skip not in t:raise SystemExit('r2 existing-position buy skip unresolved')
p.write_text(t,encoding='utf-8')

# --- ZERO accounting: a second KAUF must correct only the new tranche, not erase the old basis.
p=Path('src/zero-accounting.js')
t=p.read_text(encoding='utf-8')
imp="import {ZERO_FEE_MODEL,zeroAffordableBuy,zeroOrderFee} from './zero-fee-model.js';"
newimp=imp+"\nimport {mergePositionTranche} from './position-scale-up.js';"
if "from './position-scale-up.js'" not in t:
    if t.count(imp)!=1: raise SystemExit('zero import anchor unresolved')
    t=t.replace(imp,newimp)

t=t.replace('let cashCorrection=0,equityCorrection=0,feeCorrection=0,blockedBuys=0,reconciledBuys=0,reconciledSells=0;','let cashCorrection=0,equityCorrection=0,feeCorrection=0,blockedBuys=0,reconciledBuys=0,reconciledSells=0,blockedScaleUps=0,reconciledScaleUps=0;')
start=t.find("      if(h.action==='KAUF'){")
end=t.find("      }else if(h.action==='VERKAUF'){",start)
if start<0 or end<0: raise SystemExit('zero KAUF block unresolved')
new_buy="""      if(h.action==='KAUF'){
        const symbol=String(h.symbol||'').toUpperCase(),p=currentBySymbol.get(symbol),beforePos=before?.positions?.get?.(symbol)||null,isScaleUp=Boolean(beforePos&&p),oldFee=num(h.fee),baseNotional=Math.max(0,Math.abs(num(h.amount))-oldFee),baseOutflow=baseNotional+oldFee;
        const trancheEntryPrice=isScaleUp?num(p?.last_add_entry_price):num(p?.entry_price),trancheFx=isScaleUp?num(p?.last_add_fx,1):effectiveEntryFx(p,p?.last_price,p?.last_fx,'EUR'),priceBase=trancheEntryPrice*trancheFx;
        if(p&&baseNotional>0&&priceBase>0){
          const oldPositionValue=positionMarketValue(p),type=String(p.instrument_type||'EQUITY').toUpperCase(),fractionalAllowed=type!=='ETF';
          const fill=zeroAffordableBuy({budgetEur:baseOutflow,priceEur:priceBase,instrumentType:type,fractionalAllowed});
          if(!fill.ok){
            const deltaCash=baseOutflow;let deltaEquity=0;
            if(isScaleUp){const live={last_price:p.last_price,last_fx:p.last_fx,score:p.score,signal_confidence:p.signal_confidence};Object.assign(p,structuredClone(beforePos),live);const restoredValue=positionMarketValue(p);deltaEquity=deltaCash+restoredValue-oldPositionValue;blockedScaleUps++;h.action='KAUF_BLOCKIERT_ZERO_AUFSTOCKUNG'}else{const i=s.positions.indexOf(p);if(i>=0)s.positions.splice(i,1);currentBySymbol.delete(symbol);deltaEquity=deltaCash-oldPositionValue;h.action='KAUF_BLOCKIERT_ZERO'}
            const detail=zeroBlockExplanation(fill,baseOutflow,priceBase,type);cashCorrection+=deltaCash;equityCorrection+=deltaEquity;feeCorrection-=oldFee;blockedBuys++;
            h.amount=0;h.fee=0;h.trade_pnl=null;h.zero_fee_model_version=ZERO_FEE_MODEL.version;h.zero_block_details={code:String(fill?.reason||'UNKNOWN'),budgetEur:+baseOutflow.toFixed(6),priceEur:+priceBase.toFixed(6),instrumentType:type,fractionalAllowed,scaleUp:isScaleUp};
            h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO: ${detail}; ${isScaleUp?'Aufstockung':'Kauf'} rückgängig gemacht.`;
            const id=num(s.aiLog?.at(-1)?.id,0)+1;s.aiLog.push({id,ts:new Date().toISOString(),kind:'SYSTEM',symbol,title:'ZERO-Ausführung blockiert',message:`${symbol}: ${detail}.`,confidence:null,meta:{feeModel:ZERO_FEE_MODEL.version,code:String(fill?.reason||'UNKNOWN'),budgetEur:+baseOutflow.toFixed(6),priceEur:+priceBase.toFixed(6),instrumentType:type,fractionalAllowed,scaleUp:isScaleUp}});if(s.aiLog.length>300)s.aiLog=s.aiLog.slice(-300);
          }else{
            const fee=fill.fee,actualOut=fill.notional+fee,deltaCash=baseOutflow-actualOut;let newPositionValue=oldPositionValue;
            if(isScaleUp){const marks={lastPrice:p.last_price,lastFx:p.last_fx,score:p.score,confidence:p.signal_confidence,addedAt:p.last_added_at||new Date().toISOString()},merged=mergePositionTranche(beforePos,{notional:fill.notional,entryPrice:trancheEntryPrice,fx:trancheFx,fee,quantity:fill.quantity},marks);Object.assign(p,merged);const qty=num(p.zero_quantity),whole=Math.floor(qty+1e-10);p.zero_whole_shares=whole;p.zero_fractional_shares=Math.max(0,qty-whole);p.zero_uses_fractional=p.zero_fractional_shares>1e-8;p.zero_fee_model_version=ZERO_FEE_MODEL.version;reconciledScaleUps++;newPositionValue=positionMarketValue(p)}else{p.invested=fill.notional;p.entry_fee=fee;p.zero_quantity=fill.quantity;p.zero_whole_shares=fill.feeInfo?.wholeQuantity||0;p.zero_fractional_shares=fill.feeInfo?.fractionalQuantity||0;p.zero_uses_fractional=Boolean(fill.usesFractional);p.zero_fee_model_version=ZERO_FEE_MODEL.version;newPositionValue=positionMarketValue(p)}
            const deltaEquity=deltaCash+newPositionValue-oldPositionValue;cashCorrection+=deltaCash;equityCorrection+=deltaEquity;feeCorrection+=fee-oldFee;reconciledBuys++;
            h.amount=-actualOut;h.fee=fee;h.zero_fee_model_version=ZERO_FEE_MODEL.version;h.zero_fee_details={...fill.feeInfo,scaleUp:isScaleUp};
            h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO Brokergebühr ${fee.toFixed(2)} €${fill.usesFractional?' inkl. Bruchstück-Zuschlag':''}${isScaleUp?' · Tranche zum bestehenden Einstand addiert':''}; Spread/Ausführung separat.`;
          }
        }
"""
t=t[:start]+new_buy+t[end:]
old_return='return{cashCorrection,equityCorrection,feeCorrection,blockedBuys,reconciledBuys,reconciledSells,finalEquity,finalPnl};'
new_return='return{cashCorrection,equityCorrection,feeCorrection,blockedBuys,reconciledBuys,reconciledSells,blockedScaleUps,reconciledScaleUps,finalEquity,finalPnl};'
if old_return in t:t=t.replace(old_return,new_return)
elif new_return not in t:raise SystemExit('zero result anchor unresolved')
p.write_text(t,encoding='utf-8')

print('tranche-safe scale-up integrated in R2 and ZERO accounting')
