const KEY='state/zero-live-signal-learning-v1';
const MAX_FRESH_PENDING_MS=8*60*1000;
const key=v=>String(v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function read(storage){try{return storage?.kv?.get(KEY)||null}catch{return null}}
function write(storage,state){try{storage?.kv?.put(KEY,state)}catch{}}

// The fast layer runs before downstream pullback/venue/cost/execution guards. Therefore
// a FAST BUY is only a proposal, not proof that a paper position was opened. Reconcile
// the learning state with the actual held positions before/after every production scan.
export function reconcileLearningWithExecutedPositions(storage,positions=[],now=Date.now()){
  const state=read(storage);if(!state||typeof state!=='object')return{changed:false,pendingBefore:0,pendingAfter:0,removed:0,staleHeldRemoved:0};
  state.pending=state.pending&&typeof state.pending==='object'?state.pending:{};
  const held=new Set((Array.isArray(positions)?positions:[]).map(x=>key(x?.symbol)).filter(Boolean));
  const before=Object.keys(state.pending).length;let removed=0,staleHeldRemoved=0;
  for(const [symbol,p] of Object.entries(state.pending)){
    const s=key(symbol),age=Math.max(0,now-num(p?.at,0));
    // Not held after execution => proposal was blocked/not executed and must not become
    // an entry-learning sample later. A held symbol may keep only a very fresh proposal
    // so the next scan can attach the exact pre-execution timing snapshot.
    if(!held.has(s)){delete state.pending[symbol];removed++;continue}
    if(!num(p?.at,0)||age>MAX_FRESH_PENDING_MS){delete state.pending[symbol];removed++;staleHeldRemoved++}
  }
  const after=Object.keys(state.pending).length,changed=after!==before;
  if(changed){state.pendingExecutionReconciledAt=now;write(storage,state)}
  return{changed,pendingBefore:before,pendingAfter:after,removed,staleHeldRemoved,heldCount:held.size,maxFreshPendingMinutes:MAX_FRESH_PENDING_MS/60000,pendingOnlyForExecutedPositions:true};
}

export function getLearningExecutionReconcileStatus(storage){
  const state=read(storage)||{},pending=state.pending&&typeof state.pending==='object'?Object.keys(state.pending).length:0;
  return{enabled:true,pendingEntries:pending,maxFreshPendingMinutes:MAX_FRESH_PENDING_MS/60000,pendingOnlyForExecutedPositions:true,lastReconciledAt:state.pendingExecutionReconciledAt||null,note:'FAST-BUY-Vorschlaege werden nur dann als Einstiegssample behalten, wenn danach tatsaechlich eine Paper-Position existiert.'};
}
