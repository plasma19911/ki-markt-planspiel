const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/&/g,' AND ').replace(/\b(SE|SA|AG|NV|PLC|ASA|AB|OYJ|SPA|S P A|INC|CORP|CORPORATION|LTD|LIMITED|HOLDING|HOLDINGS|GROUP|GROUPE)\b/g,' ').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const iso=()=>new Date().toISOString();

export const PAPER_EXPLORATION_EXECUTION_RECONCILE_V3175={
  version:31.77,
  enabled:true,
  paperOnly:true,
  maxQuoteAgeMinutes:5,
  minConfidence:.5,
  maxOpenPositions:3,
  maxProbeExposurePct:18,
  requiresFreshCandidate:true,
  requiresVerifiedFx:true,
  requiresTradeRepublicMaster:true
};

function brokerExact(row){return row?.brokerVerified===true&&String(row?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'&&/Trade Republic/i.test(String(row?.brokerVerificationSource||''))&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(row?.isin||''));}
function brokerRowFor(candidate,rows){
  const s=key(candidate),n=norm(candidate?.tradeRepublicName||candidate?.name);
  return arr(rows).find(r=>key(r)===s&&brokerExact(r))||arr(rows).find(r=>norm(r?.tradeRepublicName||r?.name)===n&&brokerExact(r))||null;
}
function candidateFresh(c,now=Date.now(),cfg=PAPER_EXPLORATION_EXECUTION_RECONCILE_V3175){
  if(!(c?.fresh===true||Number(c?.fresh)===1))return false;
  const t=Date.parse(String(c?.updated_at||c?.updatedAt||''));
  return !Number.isFinite(t)||now-t>=0&&now-t<=cfg.maxQuoteAgeMinutes*60000;
}
function marketValue(p){const inv=num(p?.invested),ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return inv>0&&ep>0&&lp>0&&ef>0&&lf>0?inv*(lp/ep)*(lf/ef):inv;}
function equity(s){return num(s?.config?.cash)+arr(s?.positions).reduce((z,p)=>z+marketValue(p),0);}
function probeExposure(s){return arr(s?.positions).filter(p=>p?.paper_exploration_v3175===true||p?.paper_exploration_v3177===true).reduce((z,p)=>z+marketValue(p),0);}
function nextId(rows){return Math.max(0,...arr(rows).map(x=>num(x?.id,0)))+1;}

export async function reconcilePaperExplorationExecutionV3175({engine,unified,brokerRows=[],baseResult=null,now=Date.now()}={}){
  const cfg=PAPER_EXPLORATION_EXECUTION_RECONCILE_V3175,diag={version:31.77,checkedAt:new Date(now).toISOString(),attempted:false,executed:false,reason:null,symbol:null,allocationPct:null,amount:null};
  if(cfg.enabled!==true||!engine?.store?.update||!unified?.latest?.plan)return{...diag,reason:'UNAVAILABLE'};
  if(num(baseResult?.actions)>0)return{...diag,reason:'BASE_EXECUTED_ACTION'};
  const buy=arr(unified.latest.plan.actions).find(a=>String(a?.action||'').toUpperCase()==='BUY'&&a?.paperExplorationV3172===true);
  if(!buy)return{...diag,reason:'NO_CONTROLLED_PROBE_BUY'};
  diag.attempted=true;diag.symbol=key(buy);diag.allocationPct=clamp(num(buy?.allocation_pct),0,100);
  if(num(buy?.confidence)<cfg.minConfidence)return{...diag,reason:'LOW_PLAN_CONFIDENCE'};
  const broker=brokerRowFor(buy,brokerRows);if(!broker)return{...diag,reason:'BROKER_NOT_EXACT'};
  let outcome=null;
  try{
    const saved=await engine.store.update(s=>{
      s.positions=arr(s?.positions);
      if(s.positions.some(p=>key(p)===diag.symbol))return{executed:false,reason:'SYMBOL_ALREADY_OPEN'};
      if(s.positions.length>=cfg.maxOpenPositions)return{executed:false,reason:'PROBE_POSITION_LIMIT',positions:s.positions.length,maxOpenPositions:cfg.maxOpenPositions};
      const c=arr(s?.candidates).find(x=>key(x)===diag.symbol);if(!c)return{executed:false,reason:'CANDIDATE_NOT_IN_CURRENT_STATE'};
      if(!candidateFresh(c,now,cfg))return{executed:false,reason:'CANDIDATE_NOT_FRESH',fresh:c?.fresh??null,updatedAt:c?.updated_at||null};
      const price=num(c?.price),cash=Math.max(0,num(s?.config?.cash)),pct=diag.allocationPct,feeFixed=Math.max(0,num(s?.config?.fee_fixed)),feeRate=Math.max(0,num(s?.config?.fee_percent))/100,slip=Math.max(0,num(s?.config?.slippage_percent,.1));
      if(!(price>0&&cash>0&&pct>0))return{executed:false,reason:'INVALID_PRICE_CASH_OR_SIZE',price,cash,pct};
      const currency=String(c?.currency||s?.config?.currency||'EUR').toUpperCase(),base=String(s?.config?.currency||'EUR').toUpperCase(),fxRaw=num(c?.fx_rate??c?.fxRate,0),fx=currency===base?(fxRaw>0?fxRaw:1):fxRaw,fxVerified=currency===base||c?.fx_verified===true||c?.fxVerified===true;
      if(!(fx>0&&fxVerified))return{executed:false,reason:'FX_NOT_VERIFIED',currency,base,fx,fxVerified};
      const eqBefore=equity(s),existingProbeExposure=probeExposure(s),maxProbeExposure=Math.max(0,eqBefore*cfg.maxProbeExposurePct/100),remainingProbeExposure=Math.max(0,maxProbeExposure-existingProbeExposure),budget=Math.min(cash,cash*pct/100,remainingProbeExposure),notional=Math.max(0,(budget-feeFixed)/(1+feeRate)),fee=feeFixed+notional*feeRate;
      if(!(remainingProbeExposure>feeFixed))return{executed:false,reason:'PROBE_EXPOSURE_LIMIT',existingProbeExposure,maxProbeExposure,remainingProbeExposure};
      if(!(notional>0&&notional+fee<=cash+1e-8))return{executed:false,reason:'ORDER_NOT_ECONOMIC',budget,notional,fee,cash};
      const openedAt=iso(),exec=price*(1+slip/100),before=cash;
      s.config.cash=Math.max(0,cash-notional-fee);s.config.total_fees=num(s.config.total_fees)+fee;
      s.positions.push({symbol:diag.symbol,name:c?.name||broker?.tradeRepublicName||diag.symbol,instrument_type:c?.instrument_type||'EQUITY',theme:c?.theme||null,company_key:c?.company_key||null,invested:notional,entry_fee:fee,entry_price:exec,last_price:price,entry_fx:fx,last_fx:fx,fx_verified:true,currency:c?.currency||base,quote_currency_raw:c?.quote_currency_raw||c?.currency||base,quote_price_scale:num(c?.quote_price_scale,1),quote_unit_normalized:Boolean(c?.quote_unit_normalized),opened_at:openedAt,last_added_at:null,add_count:0,score:num(c?.score),signal_confidence:num(buy?.confidence),paper_exploration_v3175:true,paper_exploration_v3177:true,broker_isin:broker?.isin||null});
      const eq=equity(s),id=nextId(s.history);s.history=arr(s.history);s.history.push({id,ts:openedAt,end_ts:null,event_count:1,start_scan:num(s?.config?.scan_count)+1,end_scan:num(s?.config?.scan_count)+1,action:'KAUF',symbol:diag.symbol,name:c?.name||diag.symbol,instrument_type:c?.instrument_type||'EQUITY',amount:-(notional+fee),fee,trade_pnl:null,cash_before:before,cash_after:s.config.cash,equity:eq,total_pnl:eq-num(s?.config?.start_capital),score:num(c?.score),reason:`V31.7.7 PAPER-EXECUTION-RECONCILE: kontrollierter Probe-BUY aus UnifiedDecisionCore nach verlorenem Basis-Execution-Pfad. ${String(buy?.reason||'').slice(0,500)} · Order ${notional.toFixed(2)} ${base} · Probe-Exposure ${(existingProbeExposure+notional).toFixed(2)}/${maxProbeExposure.toFixed(2)} ${base} · Slippage ${slip.toFixed(2)}%`});
      if(s.history.length>800)s.history=s.history.slice(-800);
      s.aiLog=arr(s.aiLog);s.aiLog.push({id:nextId(s.aiLog),ts:openedAt,kind:'TRADE',symbol:diag.symbol,title:'Probe-Kauf ausgeführt',message:`${diag.symbol}: kontrollierter Paper-Probe-BUY wurde nach erneuter Fresh/FX/Broker-/Exposure-Prüfung ins Paper-Depot reconciled.`,confidence:num(buy?.confidence),meta:{paperExplorationExecutionReconcileV3175:true,multiProbeV3177:true,allocationPct:pct,amount:notional,isin:broker?.isin||null,existingProbeExposure,maxProbeExposure}});if(s.aiLog.length>300)s.aiLog=s.aiLog.slice(-300);
      return{executed:true,reason:'CONTROLLED_PROBE_RECONCILED',symbol:diag.symbol,amount:notional,allocationPct:pct,equity:eq,cash:s.config.cash,positions:s.positions.length,probeExposure:existingProbeExposure+notional,maxProbeExposure};
    });
    outcome=saved?.result||null;
  }catch(e){return{...diag,reason:'STORE_UPDATE_FAILED',error:String(e?.message||e).slice(0,240)}}
  return{...diag,...(outcome||{}),executed:outcome?.executed===true};
}
