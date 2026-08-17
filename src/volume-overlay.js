import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/VolumeOverlay)'};
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

async function volumeRatio(symbol){
  try{
    const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return null;
    const res=(await r.json())?.chart?.result?.[0],v=(res?.indicators?.quote?.[0]?.volume||[]).filter(x=>num(x)>0).map(Number);
    if(v.length<5)return null;
    const last=v.at(-1),base=v.slice(Math.max(0,v.length-13),-1),avg=base.length?base.reduce((a,b)=>a+b,0)/base.length:0;
    return avg>0?last/avg:null;
  }catch{return null}
}

export async function applyVolumeConfirmation(fast){
  if(!fast?.actions?.length)return fast;
  const buySymbols=[...new Set(fast.actions.filter(x=>x.action==='BUY').map(x=>String(x.symbol).toUpperCase()))].slice(0,4);
  if(!buySymbols.length)return fast;
  const ratios=new Map(await Promise.all(buySymbols.map(async s=>[s,await volumeRatio(s)])));
  const min=num(FAST_CALIBRATION.minRelativeVolume,1.10),actions=[];
  for(const a of fast.actions){
    if(a.action!=='BUY'){actions.push(a);continue}
    const ratio=ratios.get(String(a.symbol).toUpperCase());
    if(ratio==null){
      actions.push({...a,confidence:Math.min(num(a.confidence,.5),.68),allocation_pct:+(num(a.allocation_pct)*.72).toFixed(1),reason:`${a.reason} · Volumenbestätigung nicht verfügbar: Positionsgröße reduziert`});
      continue;
    }
    if(ratio<min){
      // Breakouts ohne wenigstens normales aktuelles Volumen werden nicht schnell gekauft.
      continue;
    }
    actions.push({...a,reason:`${a.reason} · 5m-Volumen x${ratio.toFixed(2)} bestätigt`});
  }
  return{...fast,actions,volumeConfirmation:{requiredForFastBuy:true,minRatio:min,ratios:Object.fromEntries([...ratios].map(([k,v])=>[k,v==null?null:+v.toFixed(2)]))}};
}
