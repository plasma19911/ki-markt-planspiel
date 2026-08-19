const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||'').toUpperCase().trim();

function pullbackPrecheck(x={}){
 const day=num(x?.dayChange),mom=num(x?.coarseMomentum),accel=num(x?.momentumAcceleration);
 const controlledDay=day>=-8&&day<=1.5,controlledMomentum=mom>=-1.8&&mom<=.45,braking=accel>=.005||(day<=0&&mom>=-.10);
 if(!controlledDay||!controlledMomentum||!braking)return{eligible:false,score:-Infinity};
 const daySweet=day<=0?Math.max(0,3.2-Math.abs(Math.abs(day)-2.0)*.48):Math.max(0,.9-day*.45);
 const tape=Math.max(0,1.35-Math.abs(mom)*.55);
 const brake=clamp(accel*14,-.6,2.4);
 const chasePenalty=Math.max(0,day-.5)*.8+Math.max(0,mom-.25)*1.2;
 return{eligible:true,score:daySweet+tape+brake+Math.max(0,num(x?.preScore))*.025-chasePenalty};
}

export function selectBalancedDeepCandidates(items=[],deepLimit=6,breakoutReserve=3){
 const pool=Array.isArray(items)?items.filter(x=>x?.symbol):[],limit=Math.max(1,Math.floor(num(deepLimit,6))),breakouts=Math.max(0,Math.min(limit-1,Math.floor(num(breakoutReserve,3)))),baseSlots=Math.max(1,limit-breakouts),pullbackReserve=Math.min(2,Math.max(0,baseSlots-1));
 const regular=[...pool].sort((a,b)=>num(b?.preScore)-num(a?.preScore));
 const pullbacks=pool.map(x=>({x,q:pullbackPrecheck(x)})).filter(z=>z.q.eligible).sort((a,b)=>b.q.score-a.q.score||num(b.x?.momentumAcceleration)-num(a.x?.momentumAcceleration));
 const breakout=[...pool].filter(x=>x?.breakoutPre).sort((a,b)=>num(b?.breakoutPreScore)-num(a?.breakoutPreScore));
 const selected=[],used=new Set();
 const add=(x,track)=>{const k=key(x);if(!k||used.has(k)||selected.length>=limit)return false;used.add(k);selected.push({...x,deepSelectionTrack:track});return true};
 for(const z of pullbacks){if(selected.filter(x=>x.deepSelectionTrack==='PULLBACK').length>=pullbackReserve)break;add(z.x,'PULLBACK')}
 for(const x of regular){if(selected.length>=baseSlots)break;add(x,'REGULAR')}
 for(const x of breakout){if(selected.length>=limit)break;add(x,'BREAKOUT')}
 for(const x of regular){if(selected.length>=limit)break;add(x,'REGULAR')}
 return selected.slice(0,limit);
}

export function deepSelectionSummary(selected=[]){
 const rows=Array.isArray(selected)?selected:[];
 return{total:rows.length,pullback:rows.filter(x=>x?.deepSelectionTrack==='PULLBACK').length,breakout:rows.filter(x=>x?.deepSelectionTrack==='BREAKOUT').length,regular:rows.filter(x=>x?.deepSelectionTrack==='REGULAR').length};
}
