import {scoreAllV287} from './calibrated-action-score-v287.js';
import {ENTRY_PROFIT_V290,entryDecisionV290,entryAllocationPctV290,positionDecisionV290,rotationDecisionV290,profitDecisionV290} from './entry-profit-behavior-v290-core.js';

const KEY='state/entry-profit-v290';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

function defaults(){return{version:2,candidateHistories:{},positionHistories:{},positions:{},lastRotationAt:0,recent:[],stats:{scoutBuys:0,microBuys:0,earlyBuys:0,regularBuys:0,strongBuys:0,blockedLegacyBuys:0,scoreSells:0,softSellsProtected:0,rotations:0,profitLocks:0,profitHolds:0},updatedAt:null}}
function historyFor(bucket={},s,now=Date.now()){return arr(bucket?.[s]).filter(x=>now-num(x?.at,0)<=12*60_000).sort((a,b)=>num(a?.at)-num(b?.at))}
function remember(bucket,s,score,now){let h=historyFor(bucket,s,now);if(h.length&&now-num(h.at(-1)?.at,0)<20_000)h[h.length-1]={at:now,score};else h.push({at:now,score});bucket[s]=h.slice(-8)}
function prune(bucket={},now=Date.now()){for(const s of Object.keys(bucket))if(!bucket[s]?.length||now-num(bucket[s].at(-1)?.at,0)>20*60_000)delete bucket[s]}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function buySafetyReason(reason=''){return/(?:HARD[- ]?EVENT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST|TARGET-VENUE-BLOCK|VENUE|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|NEWS-IMPACT BLOCK|NEWS-SHOCK|ORDER[- ]?ECONOM|UNECONOMIC|STRONG[- ]?SELL|CONFIRMED REVERSAL|FALLING[- ]?KNIFE|FOMO|PEAK|OVERHEAT|HIGH[- ]?CHASE|VERKÄUFER|SELLER[- ]?TAKEOVER)/i.test(String(reason))}
function hardSellReason(reason=''){return/(?:HARD[- ]?EVENT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST|TARGET-VENUE-BLOCK|VENUE|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|NEWS-IMPACT BLOCK|NEWS-SHOCK|STRONG[- ]?SELL|CONFIRMED REVERSAL)/i.test(String(reason))}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at??p?.openedAt??''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
function heldPnlPct(p={}){const ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return ep>0&&lp>0&&ef>0&&lf>0?(lp*lf/(ep*ef)-1)*100:0}
function liveMetrics(c={}){return{m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),acc:num(c?.momentumAcceleration5,c?.momentum_acceleration5),momentumState:String(c?.momentumState??c?.momentum_state??''),momentumSellSignal:String(c?.momentumSellSignal??c?.momentum_sell_signal??'')}}
function buyLike(a=''){return['BUY','BUY_SCOUT','BUY_MICRO','BUY_EARLY'].includes(String(a).toUpperCase())}

export function enforceEntryProfitV290(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const mem={...defaults(),...read(storage,defaults())};
  mem.candidateHistories={...(mem.candidateHistories||mem.histories||{})};mem.positionHistories={...(mem.positionHistories||{})};mem.positions={...(mem.positions||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
  const scored=scoreAllV287(state,storage,now,false),candidates=new Map(arr(state?.candidates).map(x=>[key(x),x])),positions=new Map(arr(state?.positions).map(x=>[key(x),x]));
  const actions=plan.actions.map(x=>({...x})),candidateBehaviors=[],positionBehaviors=[],profitBehaviors=[],counters={scoutBuys:0,microBuys:0,earlyBuys:0,regularBuys:0,strongBuys:0,blockedLegacyBuys:0,scoreSells:0,softSellsProtected:0,rotations:0,profitLocks:0,profitHolds:0};

  for(const row of scored.ranking){const s=key(row),d=entryDecisionV290(row,historyFor(mem.candidateHistories,s,now),now);candidateBehaviors.push({...d,symbol:s})}
  const cBehavior=new Map(candidateBehaviors.map(x=>[x.symbol,x]));
  const cash=Math.max(0,num(state?.config?.cash,state?.cash));

  // V29.1 is authoritative for every non-held BUY. Old soft thresholds cannot leak through.
  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a),kind=String(a?.action||'').toUpperCase(),d=cBehavior.get(s);if(kind!=='BUY'||!d||positions.has(s))continue;
    if(!buyLike(d.action)){
      actions[i]={...a,action:'HOLD',allocation_pct:0,reason:`SCORE-SYNC V29.1 HOLD: ${s} Kaufscore ${d.score.toFixed(1)}/100 · ${d.label}. Verbindliche Skala: 50–52 beobachten · 53–55 Scout · 56–57 Mikro · 58–61 früh · 62+ regulär. Alte V28.x-Score-Schwellen sind hier aufgehoben.`};counters.blockedLegacyBuys++;continue;
    }
    const pct=entryAllocationPctV290(cash,d);actions[i]={...a,allocation_pct:pct,reason:`SCORE-SYNC V29.1 ${d.tier}: ${s} Kaufscore ${d.score.toFixed(1)}/100 · ${d.label} · ${Math.round(d.coverage*100)}% Datenabdeckung. Positionsgröße folgt der neuen Stufe; Hard-Block/FOMO/Überdehnung bleiben bindend.`};
  }

  let activeNewBuys=actions.filter(a=>String(a?.action||'').toUpperCase()==='BUY'&&!positions.has(key(a))).length,scouts=actions.filter(a=>String(a?.action||'').toUpperCase()==='BUY'&&cBehavior.get(key(a))?.tier==='SCOUT').length;
  const promotable=candidateBehaviors.filter(x=>buyLike(x.action)).sort((a,b)=>b.score-a.score||b.trend.deltaWindow-a.trend.deltaWindow);
  for(const d of promotable){
    if(activeNewBuys>=ENTRY_PROFIT_V290.entry.maxNewBuysPerDecision)break;
    if(d.tier==='SCOUT'&&scouts>=ENTRY_PROFIT_V290.entry.maxScoutBuysPerDecision)continue;
    const idx=actions.findIndex(a=>key(a)===d.symbol&&String(a?.action||'').toUpperCase()==='HOLD'&&!positions.has(key(a))&&!buySafetyReason(a?.reason));if(idx<0)continue;
    const a=actions[idx],pct=entryAllocationPctV290(cash,d),conf=d.tier==='SCOUT'?.58:d.tier==='MICRO'?.61:d.tier==='EARLY'?.64:d.tier==='REGULAR'?.68:.72;
    actions[idx]={...a,action:'BUY',allocation_pct:pct,confidence:clamp(Math.max(num(a?.confidence,.58),conf),.56,.90),reason:`ENTRY V29.1 ${d.tier}: ${d.symbol} Kaufscore ${d.score.toFixed(1)}/100 · Trend ${d.trend.deltaWindow>=0?'+':''}${d.trend.deltaWindow.toFixed(1)} · ${Math.round(d.coverage*100)}% Datenabdeckung · ${d.label}. Niedrige Einstiegsscores verlangen bewusst stärkere echte Marktbestätigung.`};
    activeNewBuys++;if(d.tier==='SCOUT'){scouts++;counters.scoutBuys++}else if(d.tier==='MICRO')counters.microBuys++;else if(d.tier==='EARLY')counters.earlyBuys++;else if(d.tier==='REGULAR')counters.regularBuys++;else counters.strongBuys++;
  }

  // Re-score every held position with the same canonical scale and then apply profit-lock.
  for(const row of scored.positionScores){
    const s=key(row),p=positions.get(s);if(!p)continue;const c=candidates.get(s)||p,ph=historyFor(mem.positionHistories,s,now),pd=positionDecisionV290(row,ph,p,now),m=liveMetrics(c),old=mem.positions[s]||{},pnl=heldPnlPct({...p,...c});
    const gd=profitDecisionV290({pnlPct:pnl,peakPnlPct:old.peakPnlPct,holdScore:num(row?.holdScore,row?.fusionScore),peakHoldScore:old.peakHoldScore,lastHoldScore:old.lastHoldScore,coverage:num(row?.coverage),partial:Boolean(row?.partial),ageMinutes:ageMinutes(p,now),...m});
    const peakPnl=Math.max(num(old.peakPnlPct,pnl),pnl),peakScore=Math.max(num(old.peakHoldScore,num(row?.holdScore,row?.fusionScore)),num(row?.holdScore,row?.fusionScore));
    mem.positions[s]={peakPnlPct:+peakPnl.toFixed(3),peakHoldScore:+peakScore.toFixed(1),lastHoldScore:+num(row?.holdScore,row?.fusionScore).toFixed(1),lastPnlPct:+pnl.toFixed(3),lastAt:now};
    positionBehaviors.push({...pd,symbol:s});profitBehaviors.push({...gd,symbol:s});
    let idx=actions.findIndex(a=>key(a)===s);if(idx<0){actions.push({symbol:s,action:'HOLD',allocation_pct:0,confidence:.7,reason:'V29.1 position score'});idx=actions.length-1}
    const a=actions[idx],kind=String(a?.action||'').toUpperCase();
    if(kind==='SELL'&&hardSellReason(a?.reason))continue;
    if(gd.action==='SELL'){
      actions[idx]={...a,action:'SELL',allocation_pct:0,confidence:Math.max(num(a?.confidence,.72),.78),reason:`PROFIT-LOCK V29.1: ${s} Gewinn ${gd.pnl>=0?'+':''}${gd.pnl.toFixed(2)}% · Peak +${gd.peak.toFixed(2)}% · Rücklauf ${gd.givebackPoints.toFixed(2)} %-Pkt. · Haltescore ${gd.score.toFixed(1)}/100 · ${gd.label}. Gewinn darf bei 70–75 gesichert werden, wenn Peak, Score-Richtung und Momentum gemeinsam kippen.`};counters.profitLocks++;continue;
    }
    if(pd.action==='SELL'){
      actions[idx]={...a,action:'SELL',allocation_pct:0,confidence:Math.max(num(a?.confidence,.72),.80),reason:`POSITION-SCORE V29.1 SELL: ${s} Haltescore ${pd.score.toFixed(1)}/100 · ${pd.label} · Trend ${pd.trend.deltaWindow>=0?'+':''}${pd.trend.deltaWindow.toFixed(1)} · Alter ${pd.age.toFixed(1)} Min. Verbindliche Positionsskala: 62+ stark halten · 58–61 halten · 53–57 beobachten · 50–52 Achtung · 46–49 Verkauf beobachten · ≤45 nur bestätigt verkaufen.`};counters.scoreSells++;continue;
    }
    if(kind==='SELL'){
      actions[idx]={...a,action:'HOLD',allocation_pct:0,reason:`POSITION-SCORE V29.1 HOLD: ${s} Haltescore ${pd.score.toFixed(1)}/100 · ${pd.label}. Alter weicher V28.x-SELL wird unter der neuen Skala nicht ausgeführt; Hard-Risiko und bestätigter Gewinn-Lock bleiben davon ausgenommen.`};counters.softSellsProtected++;
    }else if(gd.armed)counters.profitHolds++;
  }

  // Better-opportunity rotation uses the same score scale and only when cash is actually scarce.
  const pBehavior=new Map(positionBehaviors.map(x=>[x.symbol,x]));
  const buyCandidates=actions.map((a,i)=>({a,i,d:cBehavior.get(key(a))})).filter(x=>String(x.a?.action||'').toUpperCase()==='BUY'&&x.d&&x.d.score>=ENTRY_PROFIT_V290.rotation.candidateMin).sort((a,b)=>b.d.score-a.d.score);
  if(buyCandidates.length&&counters.rotations<ENTRY_PROFIT_V290.rotation.maxPerDecision){
    const best=buyCandidates[0],weak=[...positions.values()].map(p=>({p,d:pBehavior.get(key(p))})).filter(x=>x.d&&key(x.p)!==key(best.a)).sort((a,b)=>a.d.score-b.d.score)[0];
    if(weak){const rd=rotationDecisionV290({candidate:best.d,position:weak.d,cash,lastRotationAt:mem.lastRotationAt,now});if(rd.rotate){let idx=actions.findIndex(a=>key(a)===key(weak.p));if(idx<0){actions.push({symbol:key(weak.p),action:'HOLD',allocation_pct:0,confidence:.7,reason:'position'});idx=actions.length-1}const wa=actions[idx];if(String(wa?.action||'').toUpperCase()==='HOLD'&&!hardSellReason(wa?.reason)){actions[idx]={...wa,action:'SELL',allocation_pct:0,confidence:.82,reason:`BETTER-OPPORTUNITY V29.1: ${key(weak.p)} Haltescore ${rd.holdScore.toFixed(1)} wird bei knappem Cash durch ${key(best.a)} Kaufscore ${rd.candidateScore.toFixed(1)} ersetzt · Abstand ${rd.gap.toFixed(1)} Punkte. Rotation nur ab regulärer Kaufzone 62+, Mindestabstand, 30 Min. Positionsalter und 20 Min. Cooldown.`};mem.lastRotationAt=now;counters.rotations++}}}
  }

  for(const row of scored.ranking){const s=key(row);if(s)remember(mem.candidateHistories,s,num(row?.buyScore,row?.fusionScore),now)}
  for(const row of scored.positionScores){const s=key(row);if(s)remember(mem.positionHistories,s,num(row?.holdScore,row?.fusionScore),now)}
  const held=new Set(positions.keys());for(const s of Object.keys(mem.positions))if(!held.has(s))delete mem.positions[s];prune(mem.candidateHistories,now);prune(mem.positionHistories,now);
  for(const k of Object.keys(counters))mem.stats[k]=num(mem.stats[k])+num(counters[k]);mem.version=2;mem.updatedAt=new Date(now).toISOString();mem.recent.push({at:now,...counters});mem.recent=mem.recent.slice(-120);write(storage,mem);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,130)} · V29.1 SCORE-SYNC: ${counters.scoutBuys} Scout · ${counters.microBuys} Mikro · ${counters.earlyBuys} früh · ${counters.regularBuys+counters.strongBuys} regulär/stark BUY · ${counters.scoreSells} Score-SELL · ${counters.rotations} Rotation · ${counters.profitLocks} Gewinn-Lock.`;
  return{plan,counters,candidateBehaviors,positionBehaviors,profitBehaviors,state:mem}
}

export class EntryProfitGuardV290{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const plan=parsePlan(r);if(!plan)return r;const out=enforceEntryProfitV290(plan,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const mem={...defaults(),...read(this.storage,defaults())};return{enabled:true,version:29.1,canonicalScoreBands:true,legacyThresholdsSuperseded:true,thresholds:ENTRY_PROFIT_V290,latest:this.latest?.counters||null,candidateBehaviors:this.latest?.candidateBehaviors||[],positionBehaviors:this.latest?.positionBehaviors||[],profitBehaviors:this.latest?.profitBehaviors||[],stats:mem.stats||{},rule:'V29.1 ist der letzte verbindliche Score-Controller: Kauf 50–52 beobachten, 53–55 Scout, 56–57 Mikro, 58–61 früh, 62+ regulär. Position 62+ stark halten, 58–61 halten, 53–57 beobachten, 50–52 Achtung, 46–49 Verkauf beobachten, <=45 nur bestätigt verkaufen, <=32 dringender Score-Exit. Rotation folgt derselben Skala. Gewinn-Lock bleibt separat und kann Gewinner bei 70–75 sichern, wenn der Peak sichtbar kippt.'}}
}
