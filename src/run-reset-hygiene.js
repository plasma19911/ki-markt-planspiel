import {clearSecondChanceRuntime} from './second-chance-runtime.js';
import {clearOrderApprovals} from './order-approval.js';

// Nur laufbezogene Zustände löschen. Langfristiges Lernen, Tagesbudget und
// Runtime-Konfiguration bleiben absichtlich erhalten.
export const RUN_SCOPED_KV_KEYS=[
  'quota/zero-ai-v1',
  'state/zero-fast-profit-peaks-v1',
  'state/trading-behavior-v277'
];

export const PRESERVED_ACROSS_RESTART=[
  'quota/free-ai-daily-v2',
  'runtime-trade-config-v1',
  'live/replay/learning/calibration'
];

function deleteKv(storage,key){
  try{
    const kv=storage?.kv;
    if(kv?.delete){kv.delete(key);return true}
    if(storage?.delete){storage.delete(key);return true}
  }catch{}
  return false;
}

export function clearRunScopedDecisionState({storage=null,freeAiGuard=null}={}){
  const cleared=[];
  for(const key of RUN_SCOPED_KV_KEYS)if(deleteKv(storage,key))cleared.push(key);

  try{clearSecondChanceRuntime();cleared.push('runtime/second-chance-watch')}catch{}
  try{clearOrderApprovals(storage);cleared.push('state/order-approvals-v1')}catch{}

  // FreeAiGuard besitzt zusätzlich rein im Speicher gehaltene Cooldowns/Antworten.
  // Das Tages-Neuronbudget liegt separat im KV und wird NICHT zurückgesetzt.
  if(freeAiGuard&&typeof freeAiGuard==='object'){
    try{freeAiGuard.planAt=0}catch{}
    try{freeAiGuard.newsAt=0}catch{}
    try{freeAiGuard.lastNewsResponse=''}catch{}
    cleared.push('memory/free-ai-plan-news-cooldown');
  }

  return{
    ok:true,
    cleared,
    preserved:[...PRESERVED_ACROSS_RESTART],
    rule:'Neuer Lauf übernimmt Lernen und Konfiguration, aber niemals alte Positions-Peaks, Entry-Bestätigungen, Plan-/News-Cooldowns, Second-Chance-Watchlist oder Ordervorschläge.'
  };
}
