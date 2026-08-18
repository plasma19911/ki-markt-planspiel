import assert from 'node:assert/strict';
import {applyVolumeConfirmation} from '../src/volume-overlay.js';

const originalFetch=globalThis.fetch,now=Math.floor(Date.now()/1000),day=86400;
function payload(symbol){
  const current=[now-900,now-600,now-300],latestClock=current.at(-1),ts=[],volume=[];
  // Vier vorherige Handelstage mit Volumen um 1000 zur gleichen 5m-Zeitposition.
  for(let d=4;d>=1;d--){for(const t of current){ts.push(t-d*day);volume.push(t===latestClock?1000:900)}}
  // Heutige drei bereits abgeschlossene Bars; letzte Bar ist 1.5x so stark wie historisch.
  for(const t of current){ts.push(t);volume.push(t===latestClock?1500:1100)}
  return{chart:{result:[{meta:{symbol,exchangeTimezoneName:'UTC',currentTradingPeriod:{regular:{start:current[0],end:now+3600}}},timestamp:ts,indicators:{quote:[{volume}]}}],error:null}};
}

globalThis.fetch=async input=>{const u=new URL(typeof input==='string'?input:input.url||String(input));if(u.pathname.includes('/v8/finance/chart/'))return Response.json(payload(decodeURIComponent(u.pathname.split('/').at(-1))));throw new Error(`Unexpected URL ${u}`)};

try{
  const fast={actions:[{symbol:'EARLY',action:'BUY',confidence:.8,allocation_pct:20,reason:'FAST-BUY'}],context:[{symbol:'EARLY'}]};
  const checked=await applyVolumeConfirmation(fast),ratio=checked.volumeConfirmation.ratios.EARLY;
  assert.ok(ratio>=1.49&&ratio<=1.51,`Historischer Same-Time-Volumenvergleich erwartet ~1.50, erhalten ${ratio}`);
  assert.equal(checked.actions.length,1,'Starker frueher BUY darf nicht wegen fehlender 5 heutiger Bars verschwinden');
  assert.equal(checked.actions[0].action,'BUY');
  assert.match(checked.actions[0].reason,/Volumen x1\.50 bestätigt/);
  console.log(JSON.stringify({ok:true,ratio,method:checked.volumeConfirmation.method},null,2));
}finally{globalThis.fetch=originalFetch}
