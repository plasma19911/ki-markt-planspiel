import {num,positionMarketValue} from './zero-accounting.js';

const text=v=>String(v||'');

function unsafeReason(h,soldThisScan){
  const symbol=String(h?.symbol||'').toUpperCase(),reason=text(h?.reason);
  if(reason.includes('stärkstes verfügbares Fallback-Signal'))return'KI-Fallback darf keine Ersatzorder eröffnen';
  if(soldThisScan.has(symbol))return'kein Verkauf und Wiederkauf desselben Titels im selben Scan';
  return null;
}

export async function blockUnsafeFreshBuys(engine,before){
  const loaded=await engine?.store?.load?.(true),state=loaded?.state;if(!state)return null;
  const fresh=(state.history||[]).filter(h=>num(h.id)>before.historyId).sort((a,b)=>num(a.id)-num(b.id));
  const soldThisScan=new Set(fresh.filter(h=>h.action==='VERKAUF').map(h=>String(h.symbol||'').toUpperCase()));
  const candidates=fresh.filter(h=>h.action==='KAUF'&&unsafeReason(h,soldThisScan));
  if(!candidates.length)return null;
  return engine.store.update(s=>{
    const rows=(s.history||[]).filter(h=>num(h.id)>before.historyId).sort((a,b)=>num(a.id)-num(b.id));
    const sold=new Set(rows.filter(h=>h.action==='VERKAUF').map(h=>String(h.symbol||'').toUpperCase()));
    let cashCorrection=0,equityCorrection=0,feeCorrection=0,blocked=0;
    for(const h of rows){
      if(h.action==='KAUF'){
        const reason=unsafeReason(h,sold),symbol=String(h.symbol||'').toUpperCase();
        if(reason){
          const p=(s.positions||[]).find(x=>String(x.symbol||'').toUpperCase()===symbol);
          if(p){
            const oldValue=positionMarketValue(p),refund=Math.max(0,Math.abs(num(h.amount))),oldFee=Math.max(0,num(h.fee));
            const i=s.positions.indexOf(p);if(i>=0)s.positions.splice(i,1);
            cashCorrection+=refund;equityCorrection+=refund-oldValue;feeCorrection-=oldFee;blocked++;
            h.action='KAUF_BLOCKIERT_SICHERHEIT';h.amount=0;h.fee=0;h.trade_pnl=null;
            h.reason=`SICHERHEITSBLOCK: ${reason}. Die simulierte Order wurde vollständig rückgängig gemacht.`;
            const id=num(s.aiLog?.at(-1)?.id,0)+1;s.aiLog.push({id,ts:new Date().toISOString(),kind:'SYSTEM',symbol,title:'Unsicheren Kauf blockiert',message:h.reason,confidence:null,meta:{reason}});if(s.aiLog.length>300)s.aiLog=s.aiLog.slice(-300);
          }
        }
      }
      if(Number.isFinite(Number(h.cash_after)))h.cash_after=num(h.cash_after)+cashCorrection;
      if(Number.isFinite(Number(h.equity)))h.equity=num(h.equity)+equityCorrection;
      if(Number.isFinite(Number(h.total_pnl)))h.total_pnl=num(h.total_pnl)+equityCorrection;
    }
    s.config.cash=Math.max(0,num(s.config.cash)+cashCorrection);s.config.total_fees=Math.max(0,num(s.config.total_fees)+feeCorrection);
    for(const snap of s.snapshots||[])if(num(snap.id)>before.snapshotId){snap.cash=Math.max(0,num(snap.cash)+cashCorrection);snap.equity=num(snap.equity)+equityCorrection}
    const finalEquity=num(s.config.cash)+(s.positions||[]).reduce((a,p)=>a+positionMarketValue(p),0),finalPnl=finalEquity-num(s.config.start_capital);
    const lastHistory=s.history?.at(-1);if(lastHistory&&num(lastHistory.id)>before.historyId){lastHistory.cash_after=num(s.config.cash);lastHistory.equity=finalEquity;lastHistory.total_pnl=finalPnl}
    const lastSnapshot=s.snapshots?.at(-1);if(lastSnapshot&&num(lastSnapshot.id)>before.snapshotId){lastSnapshot.cash=num(s.config.cash);lastSnapshot.equity=finalEquity}
    return{blocked,cashCorrection,equityCorrection,feeCorrection,finalEquity,finalPnl};
  });
}
