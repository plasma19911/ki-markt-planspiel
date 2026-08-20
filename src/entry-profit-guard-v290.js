import {scoreAllV287} from './calibrated-action-score-v287.js';
import {ENTRY_PROFIT_V290,entryDecisionV290,entryAllocationPctV290,profitDecisionV290} from './entry-profit-behavior-v290-core.js';

const KEY='state/entry-profit-v290';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

function defaults(){return{version:1,histories:{},positions:{},recent:[],stats:{scoutBuys:0,microBuys:0,earlyBuys:0,regularBuys:0,strongBuys:0,profitLocks:0,profitHolds:0},updatedAt:null}}
function historyFor(mem,s,now){return arr(mem?.histories?.[s]).filter(x=>now-num(x?.at,0)<=12*60_000).sort((a,b)=>num(a?.at)-num(b?.at))}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function buySafetyReason(reason=''){return/(?:HARD[- ]?EVENT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST|TARGET-VENUE-BLOCK|VENUE|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|NEWS-IMPACT BLOCK|NEWS-SHOCK|ORDER[- ]?ECONOM|UNECONOMIC|STRONG[- ]?SELL|CONFIRMED REVERSAL|FALLING[- ]?KNIFE|FOMO|PEAK|OVERHEAT|HIGH[- ]?CHASE|VERKÄUFER|SELLER[- ]?TAKEOVER)/i.test(String(reason))}
function hardSellReason(reason=''){return/(?:HARD[- ]?EVENT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST|TARGET-VENUE-BLOCK|VENUE|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|NEWS-IMPACT BLOCK|NEWS-SHOCK|STRONG[- ]?SELL|CONFIRMED REVERSAL)/i.test(String(reason))}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at??p?.openedAt??''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
function heldPnlPct(p={}){const ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return ep>0&&lp>0&&ef>0&&lf>0?(lp*lf/(ep*ef)-1)*100:0}
function liveMetrics(c={}){return{m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),acc:num(c?.momentumAcceleration5,c?.momentum_acceleration5),momentumState:String(c?.momentumState??c?.momentum_state??''),momentumSellSignal:String(c?.momentumSellSignal??c?.momentum_sell_signal??'')}}

export function enforceEntryProfitV290(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const mem={...defaults(),...read(storage,defaults())};mem.histories={...(mem.histories||{})};mem.positions={...(mem.positions||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
  const scored=scoreAllV287(state,storage,now,false),candidates=new Map(arr(state?.candidates).map(x=>[key(x),x])),positions=new Map(arr(state?.positions).map(x=>[key(x),x]));
  const actions=plan.actions.map(x=>({...x})),candidateBehaviors=[],profitBehaviors=[],counters={scoutBuys:0,microBuys:0,earlyBuys:0,regularBuys:0,strongBuys:0,profitLocks:0,profitHolds:0};

  for(const row of scored.ranking){const s=key(row),d=entryDecisionV290(row,historyFor(mem,s,now),now);candidateBehaviors.push({...d,symbol:s})}
  let promoted=0,scouts=0;
  const promotable=candidateBehaviors.filter(x=>['BUY_SCOUT','BUY_MICRO','BUY_EARLY','BUY'].includes(x.action)).sort((a,b)=>b.score-a.score||b.trend.deltaWindow-a.trend.deltaWindow);
  for(const d of promotable){
    if(promoted>=ENTRY_PROFIT_V290.entry.maxNewBuysPerDecision)break;
    if(d.tier==='SCOUT'&&scouts>=ENTRY_PROFIT_V290.entry.maxScoutBuysPerDecision)continue;
    const idx=actions.findIndex(a=>key(a)===d.symbol&&String(a?.action||'').toUpperCase()==='HOLD'&&!buySafetyReason(a?.reason));
    if(idx<0)continue;
    const cash=Math.max(0,num(state?.config?.cash,state?.cash)),a=actions[idx],pct=entryAllocationPctV290(cash,d);
    const conf=d.tier==='SCOUT'?.58:d.tier==='MICRO'?.61:d.tier==='EARLY'?.64:d.tier==='REGULAR'?.68:.72;
    actions[idx]={...a,action:'BUY',allocation_pct:pct,confidence:clamp(Math.max(num(a?.confidence,.58),conf),.56,.90),reason:`ENTRY V29.0 ${d.tier}: ${d.symbol} Kaufscore ${d.score.toFixed(1)}/100 · Trend ${d.trend.deltaWindow>=0?'+':''}${d.trend.deltaWindow.toFixed(1)} · ${Math.round(d.coverage*100)}% Datenabdeckung · ${d.label}. Früh einsteigen statt den Hauptanstieg bis 76+ abzuwarten; Hard-Block, Falling-Knife, FOMO und Überdehnung bleiben gesperrt.`};
    promoted++;if(d.tier==='SCOUT'){scouts++;counters.scoutBuys++}else if(d.tier==='MICRO')counters.microBuys++;else if(d.tier==='EARLY')counters.earlyBuys++;else if(d.tier==='REGULAR')counters.regularBuys++;else counters.strongBuys++;
  }

  for(const row of scored.positionScores){
    const s=key(row),p=positions.get(s);if(!p)continue;
    const c=candidates.get(s)||p,m=liveMetrics(c),old=mem.positions[s]||{},pnl=heldPnlPct({...p,...c});
    const d=profitDecisionV290({pnlPct:pnl,peakPnlPct:old.peakPnlPct,holdScore:num(row?.holdScore,row?.fusionScore),peakHoldScore:old.peakHoldScore,lastHoldScore:old.lastHoldScore,coverage:num(row?.coverage),partial:Boolean(row?.partial),ageMinutes:ageMinutes(p,now),...m});
    const peakPnl=Math.max(num(old.peakPnlPct,pnl),pnl),peakScore=Math.max(num(old.peakHoldScore,num(row?.holdScore,row?.fusionScore)),num(row?.holdScore,row?.fusionScore));
    mem.positions[s]={peakPnlPct:+peakPnl.toFixed(3),peakHoldScore:+peakScore.toFixed(1),lastHoldScore:+num(row?.holdScore,row?.fusionScore).toFixed(1),lastPnlPct:+pnl.toFixed(3),lastAt:now};
    profitBehaviors.push({...d,symbol:s});
    const idx=actions.findIndex(a=>key(a)===s);if(idx<0)continue;const a=actions[idx],kind=String(a?.action||'').toUpperCase();
    if(kind==='HOLD'&&d.action==='SELL'){
      actions[idx]={...a,action:'SELL',allocation_pct:0,confidence:Math.max(num(a?.confidence,.72),.78),reason:`PROFIT-LOCK V29.0: ${s} Gewinn ${d.pnl>=0?'+':''}${d.pnl.toFixed(2)}% · Peak +${d.peak.toFixed(2)}% · Rücklauf ${d.givebackPoints.toFixed(2)} %-Pkt. · Haltescore ${d.score.toFixed(1)}/100 · ${d.label}. Gewinn darf auch bei Score 70–75 gesichert werden, wenn Score/Momentum vom Peak klar nachlassen; steigender Trend bleibt HOLD.`};counters.profitLocks++;
    }else if(kind==='HOLD'&&d.armed)counters.profitHolds++;
    else if(kind==='SELL'&&hardSellReason(a?.reason)){}
  }

  for(const row of scored.ranking){const s=key(row);if(!s)continue;let h=historyFor(mem,s,now);const score=num(row?.buyScore,row?.fusionScore);if(h.length&&now-num(h.at(-1)?.at,0)<20_000)h[h.length-1]={at:now,score};else h.push({at:now,score});mem.histories[s]=h.slice(-8)}
  const held=new Set(positions.keys());for(const s of Object.keys(mem.positions))if(!held.has(s))delete mem.positions[s];for(const s of Object.keys(mem.histories))if(!mem.histories[s].length||now-num(mem.histories[s].at(-1)?.at,0)>20*60_000)delete mem.histories[s];
  for(const k of Object.keys(counters))mem.stats[k]=num(mem.stats[k])+num(counters[k]);mem.updatedAt=new Date(now).toISOString();mem.recent.push({at:now,...counters});mem.recent=mem.recent.slice(-120);write(storage,mem);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,145)} · V29.0: ${counters.scoutBuys} Scout · ${counters.microBuys} Mikro · ${counters.earlyBuys} früh · ${counters.regularBuys+counters.strongBuys} regulär/stark BUY · ${counters.profitLocks} Gewinn-Lock.`;
  return{plan,counters,candidateBehaviors,profitBehaviors,state:mem}
}

export class EntryProfitGuardV290{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const plan=parsePlan(r);if(!plan)return r;const out=enforceEntryProfitV290(plan,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const mem={...defaults(),...read(this.storage,defaults())};return{enabled:true,version:29.0,thresholds:ENTRY_PROFIT_V290,latest:this.latest?.counters||null,candidateBehaviors:this.latest?.candidateBehaviors||[],profitBehaviors:this.latest?.profitBehaviors||[],stats:mem.stats||{},rule:'V29.0 beginnt bei Score 60 mit einem kleinen Scout nur bei sehr starker Beschleunigung und hoher Datenabdeckung. 65–67 Mikro, 68–71 früher Einstieg, 72+ regulärer Kauf. Gewinner werden nicht auf einen niedrigen Exit-Score gezwungen: bei nachlassendem Peak-/Momentum-Verhalten kann Gewinn auch bei Haltescore 70–75 gesichert werden; bei weiter steigendem Trend bleibt HOLD.'}}
}
