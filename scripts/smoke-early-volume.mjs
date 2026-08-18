import assert from 'node:assert/strict';
import {applyVolumeConfirmation} from '../src/volume-overlay.js';

const originalFetch=globalThis.fetch,now=Math.floor(Date.now()/1000),day=86400;
function payload(symbol){
  const current=[now-900,now-600,now-300],latestClock=current.at(-1),ts=[],volume=[];
  for(let d=4;d>=1;d--){for(const t of current){ts.push(t-d*day);volume.push(t===latestClock?1000:900)}}
  const weak=String(symbol).toUpperCase().includes('WEAK');
  for(const t of current){ts.push(t);volume.push(t===latestClock?(weak?700:1500):1100)}
  return{chart:{result:[{meta:{symbol,exchangeTimezoneName:'UTC',currentTradingPeriod:{regular:{start:current[0],end:now+3600}}},timestamp:ts,indicators:{quote:[{volume}]}}],error:null}};
}

globalThis.fetch=async input=>{const u=new URL(typeof input==='string'?input:input.url||String(input));if(u.pathname.includes('/v8/finance/chart/'))return Response.json(payload(decodeURIComponent(u.pathname.split('/').at(-1))));throw new Error(`Unexpected URL ${u}`)};

try{
  const fast={actions:[{symbol:'EARLY',action:'BUY',confidence:.8,allocation_pct:20,reason:'FAST-BUY'},{symbol:'WEAK',action:'BUY',confidence:.8,allocation_pct:20,reason:'FAST-BUY'}],context:[{symbol:'EARLY'},{symbol:'WEAK'}]};
  const checked=await applyVolumeConfirmation(fast),strong=checked.volumeConfirmation.ratios.EARLY,weak=checked.volumeConfirmation.ratios.WEAK;
  assert.ok(strong>=1.49&&strong<=1.51,`Historischer Same-Time-Volumenvergleich erwartet ~1.50, erhalten ${strong}`);
  assert.ok(weak>=.69&&weak<=.71,`Schwaches Vergleichsvolumen erwartet ~0.70, erhalten ${weak}`);
  assert.equal(checked.actions.length,2,'Relative Lautstaerke allein darf einen ansonsten validen BUY nicht mehr loeschen');
  const strongBuy=checked.actions.find(x=>x.symbol==='EARLY'),weakBuy=checked.actions.find(x=>x.symbol==='WEAK');
  assert.match(strongBuy.reason,/Volumen x1\.50 bestätigt/);
  assert.match(weakBuy.reason,/unter Bestätigungsniveau/);
  assert.equal(weakBuy.allocation_pct,20,'Schwaches Volumen darf die Order nicht verkleinern und dadurch fixe Kosten verschlechtern');
  assert.ok(weakBuy.confidence<.8,'Schwaches Volumen soll stattdessen die Konfidenz reduzieren');
  assert.equal(checked.volumeConfirmation.requiredForFastBuy,false);
  console.log(JSON.stringify({ok:true,strong,weak,strongBuy,weakBuy,method:checked.volumeConfirmation.method},null,2));
}finally{globalThis.fetch=originalFetch}
