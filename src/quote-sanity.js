const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

const COMMON_SCALE_MIN=50;
const COMMON_SCALE_MAX=150;
const COMMON_INVERSE_MIN=.006;
const COMMON_INVERSE_MAX=.02;
const MAX_VALUATION_FACTOR=20;
const MIN_VALUATION_FACTOR=.05;

function scaleAligned(entry,current){
  const e=num(entry),c=num(current);
  if(!(e>0&&c>0))return c;
  const r=c/e;
  if(r>=COMMON_SCALE_MIN&&r<=COMMON_SCALE_MAX)return c/100;
  if(r>=COMMON_INVERSE_MIN&&r<=COMMON_INVERSE_MAX)return c*100;
  return c;
}

function positionValue(p){
  const invested=num(p?.invested),ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);
  if(!(invested>=0&&ep>0&&lp>0&&ef>0&&lf>0))return invested;
  return invested*(lp/ep)*(lf/ef);
}

function repairPosition(p){
  const ep=num(p?.entry_price),ef=num(p?.entry_fx,1);
  if(!(ep>0&&ef>0))return{changed:false,rejected:false};
  const oldPrice=num(p.last_price,ep),oldFx=num(p.last_fx,ef);
  let price=scaleAligned(ep,oldPrice),fx=scaleAligned(ef,oldFx),changed=Math.abs(price-oldPrice)>1e-10||Math.abs(fx-oldFx)>1e-10,rejected=false;
  let factor=(price/ep)*(fx/ef);

  // Falls der Feed nach der 100x-Korrektur immer noch eine in einem 60-Sekunden-Scan
  // unplausible Neubewertung liefert, verwenden wir den letzten nachweislich plausiblen
  // Mark bzw. den Einstieg. So kann ein einzelner Feed-Ausreißer weder Depot noch SELL
  // um Größenordnungen verfälschen.
  if(!Number.isFinite(factor)||factor>MAX_VALUATION_FACTOR||factor<MIN_VALUATION_FACTOR){
    const sanePrice=num(p.quote_sanity_last_price,ep),saneFx=num(p.quote_sanity_last_fx,ef);
    price=sanePrice>0?sanePrice:ep;fx=saneFx>0?saneFx:ef;factor=(price/ep)*(fx/ef);changed=true;rejected=true;
  }

  p.last_price=price;
  p.last_fx=fx;
  if(Number.isFinite(factor)&&factor>=MIN_VALUATION_FACTOR&&factor<=MAX_VALUATION_FACTOR){
    p.quote_sanity_last_price=price;
    p.quote_sanity_last_fx=fx;
  }
  if(changed){
    p.quote_sanity_repaired_at=new Date().toISOString();
    p.quote_sanity_reason=rejected?'OUTLIER_REJECTED':'COMMON_100X_SCALE_REPAIRED';
  }
  return{changed,rejected,oldPrice,oldFx,price,fx,factor};
}

function sanitizeSeries(state,currentEquity){
  const start=Math.max(1,num(state?.config?.start_capital,1)),baseline=Math.max(start,currentEquity,1),hi=baseline*20,lo=baseline/20;
  let removedSnapshots=0,correctedHistory=0;
  if(Array.isArray(state.snapshots)){
    const before=state.snapshots.length;
    state.snapshots=state.snapshots.filter(x=>{const e=num(x?.equity,baseline);return e<=0||(e>=lo&&e<=hi)});
    removedSnapshots=before-state.snapshots.length;
    const last=state.snapshots.at(-1);if(last){last.cash=num(state.config?.cash);last.equity=currentEquity}
  }
  if(Array.isArray(state.history)){
    for(const h of state.history){
      const e=num(h?.equity,baseline);
      if((e>hi||e<lo)&&['HALTEN','FEHLER'].includes(String(h?.action||'').toUpperCase())){
        h.equity=currentEquity;h.total_pnl=currentEquity-start;correctedHistory++;
      }
    }
  }
  return{removedSnapshots,correctedHistory};
}

export function repairQuoteAnomaliesState(state){
  if(!state||!Array.isArray(state.positions))return{changed:false,repairedPositions:0,rejectedPositions:0,removedSnapshots:0,correctedHistory:0};
  let repairedPositions=0,rejectedPositions=0;
  for(const p of state.positions){const r=repairPosition(p);if(r.changed)repairedPositions++;if(r.rejected)rejectedPositions++}
  const currentEquity=num(state?.config?.cash)+state.positions.reduce((a,p)=>a+positionValue(p),0),series=sanitizeSeries(state,currentEquity),changed=repairedPositions>0||series.removedSnapshots>0||series.correctedHistory>0;
  if(changed){
    state.aiLog=Array.isArray(state.aiLog)?state.aiLog:[];
    const prev=state.aiLog.at(-1),msg=`Quote-Sanity: ${repairedPositions} Position(en) korrigiert, ${rejectedPositions} extremer Feed-Ausreißer verworfen, ${series.removedSnapshots} fehlerhafte Depot-Snapshot(s) entfernt.`;
    if(prev?.title!=='Kurs-/FX-Ausreißer korrigiert'||prev?.message!==msg){
      state.aiLog.push({id:num(prev?.id)+1,ts:new Date().toISOString(),kind:'SYSTEM',symbol:'',title:'Kurs-/FX-Ausreißer korrigiert',message:msg,confidence:null,meta:{quoteSanity:true,repairedPositions,rejectedPositions,...series}});
      if(state.aiLog.length>300)state.aiLog=state.aiLog.slice(-300);
    }
  }
  return{changed,repairedPositions,rejectedPositions,currentEquity,...series};
}

export function sanitizeHeldPromptPositions(held,state){
  const map=new Map((state?.positions||[]).map(p=>[String(p?.symbol||'').toUpperCase(),p]));
  return (Array.isArray(held)?held:[]).map(h=>{
    const pnl=num(h?.pnlPct),p=map.get(String(h?.symbol||'').toUpperCase());
    if(Math.abs(pnl)<=500)return h;
    let safePnl=0;
    if(p&&num(p.invested)>0){const v=positionValue(p);safePnl=(v/num(p.invested)-1)*100;if(!Number.isFinite(safePnl)||Math.abs(safePnl)>500)safePnl=0}
    return{...h,pnlPct:+safePnl.toFixed(3),peakPnlPct:+Math.max(safePnl,0).toFixed(3),givebackPct:0,quoteSanity:'extreme prompt P/L replaced before AI decision'};
  });
}
