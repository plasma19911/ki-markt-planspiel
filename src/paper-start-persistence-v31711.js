const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const PAPER_START_PERSISTENCE_V31711={version:31.711,patch:'31.7.11-idempotent-start-preserves-paper-ledger'};

export function hasExistingPaperRunV31711(state={}){
  const c=state?.config||{};
  return Boolean(c?.started_at)&&(
    num(c?.scan_count)>0||arr(state?.positions).length>0||arr(state?.history).some(x=>!['START'].includes(String(x?.action||'').toUpperCase()))||arr(state?.snapshots).length>1
  );
}

export function durationMinutesV31711(o={}){
  const v=Math.max(1,Math.floor(num(o?.durationValue,7))),u=String(o?.durationUnit||'days');
  return v*(u==='hours'?60:u==='weeks'?10080:1440);
}

export function existingRunSnapshotV31711(state={}){
  return{scanCount:num(state?.config?.scan_count),positions:arr(state?.positions).length,history:arr(state?.history).length,startCapital:num(state?.config?.start_capital),cash:num(state?.config?.cash),running:Boolean(state?.config?.running)};
}
