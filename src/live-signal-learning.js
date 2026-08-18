const KEY='state/zero-live-signal-learning-v1';
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));

function heldFromPrompt(prompt){const marker=' Gehalten=',i=prompt.indexOf(marker);if(i<0)return[];try{const x=JSON.parse(prompt.slice(i+marker.length).trim());return Array.isArray(x)?x:[]}catch{return[]}}
function contextMap(fast){const gaps=new Map((fast?.gapContext||[]).map(x=>[String(x.symbol).toUpperCase(),x])),out=new Map();for(const c of fast?.context||[]){const k=String(c.symbol).toUpperCase(),g=gaps.get(k),a=num(c?.multiTimeframe?.alignment),bucket=a>=3?'MTF_UP':a<=-3?'MTF_DOWN':'MTF_MIXED',gap=String(g?.state||'NO_GAP');out.set(k,{signature:`${c.regime||'UNKNOWN'}|${bucket}|${gap}`,regime:c.regime||'UNKNOWN',mtf:a,gap})}return out}
function read(storage){try{return storage?.kv?.get(KEY)||{open:{},pending:{},stats:{},completed:0}}catch{return{open:{},pending:{},stats:{},completed:0}}}
function write(storage,state){try{storage?.kv?.put(KEY,state)}catch{}}
function addOutcome(state,signature,pnl){const s=state.stats[signature]||{count:0,wins:0,sumPnl:0,sumAbsPnl:0};s.count++;if(pnl>0)s.wins++;s.sumPnl+=pnl;s.sumAbsPnl+=Math.abs(pnl);state.stats[signature]=s;state.completed=num(state.completed)+1}

export function applyLiveOutcomeLearning(fast,prompt,storage){
  if(!fast)return fast;const held=heldFromPrompt(prompt),heldMap=new Map(held.map(x=>[String(x.symbol).toUpperCase(),x])),ctx=contextMap(fast),state=read(storage),now=Date.now();state.open=state.open||{};state.pending=state.pending||{};state.stats=state.stats||{};
  for(const [symbol,o] of Object.entries(state.open))if(!heldMap.has(symbol)){addOutcome(state,o.signature||'UNKNOWN',num(o.lastPnlPct));delete state.open[symbol]}
  for(const [symbol,h] of heldMap){const pending=state.pending[symbol],currentCtx=ctx.get(symbol),o=state.open[symbol]||{signature:pending?.signature||currentCtx?.signature||'UNKNOWN',openedAt:now,peakPnlPct:num(h.peakPnlPct,h.pnlPct)};o.lastPnlPct=num(h.pnlPct);o.peakPnlPct=Math.max(num(o.peakPnlPct),num(h.peakPnlPct,h.pnlPct));o.updatedAt=now;state.open[symbol]=o;delete state.pending[symbol]}
  for(const [symbol,p] of Object.entries(state.pending))if(now-num(p.at)>24*3600*1000)delete state.pending[symbol];

  const actions=[];for(const a of fast.actions||[]){const symbol=String(a.symbol).toUpperCase(),c=ctx.get(symbol),sig=c?.signature||'UNKNOWN';const st=state.stats[sig],count=num(st?.count),winRate=count?num(st.wins)/count:null,avgPnl=count?num(st.sumPnl)/count:null;let next={...a};
    if(a.action==='BUY'&&count>=12){
      if(avgPnl<-.2||winRate<.42){
        next.confidence=clamp(num(a.confidence)-.07,.5,.95);
        next.reason=`${a.reason} · Live-Lernen bremst Setup (${count} Fälle, Ø ${avgPnl.toFixed(2)}%); Positionsgröße bleibt wegen fixer Gebühren unverändert`;
        if(count>=25&&avgPnl<-.45&&winRate<.4)continue;
      }else if(avgPnl>.25&&winRate>.54){
        next.confidence=clamp(num(a.confidence)+.035,.5,.95);
        next.reason=`${a.reason} · Live-Lernen bestätigt Setup (${count} Fälle, Treffer ${(winRate*100).toFixed(0)}%)`;
      }
    }
    if(next.action==='BUY')state.pending[symbol]={signature:sig,at:now};
    actions.push(next)
  }
  state.updatedAt=now;write(storage,state);const learned=Object.entries(state.stats).filter(([,v])=>num(v.count)>=12).length;
  return{...fast,actions,liveLearning:{completedOutcomes:num(state.completed),matureSetupBuckets:learned,minOutcomesPerBucket:12,mode:'confidence-only-paper-outcome-learning'}};
}
