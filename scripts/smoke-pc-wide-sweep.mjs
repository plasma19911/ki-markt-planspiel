import assert from 'node:assert/strict';
import {normalizeWideSweepEntries,WIDE_SWEEP_TARGET} from '../src/wide-sweep-utils.js';

const now=Date.now(),ts=new Date(now-20_000).toISOString();
const rows=[];
for(let i=0;i<24;i++)rows.push({symbol:`TEST${i}.DE`,wideScore:20-i*.4,m5Pct:.1+i*.01,m20Pct:.3,accelerationPct:.08,sessionPct:1.5,last:10+i,observedAt:ts});
rows.push({symbol:'TEST0.DE',wideScore:99,m5Pct:1,m20Pct:2,accelerationPct:.8,sessionPct:3,last:10,observedAt:ts});
rows.push({symbol:'BAD.V',wideScore:100,m5Pct:3,m20Pct:5,accelerationPct:2,sessionPct:8,last:1,observedAt:ts});
rows.push({symbol:'STALE.DE',wideScore:100,m5Pct:3,m20Pct:5,accelerationPct:2,sessionPct:8,last:1,observedAt:new Date(now-10*60_000).toISOString()});
rows.push({symbol:'ZERO.DE',wideScore:100,last:0,observedAt:ts});

const out=normalizeWideSweepEntries(rows,now);
assert.equal(out.length,WIDE_SWEEP_TARGET,'Wide Sweep muss auf die vorgesehenen Finalisten begrenzt bleiben');
assert.equal(out[0].symbol,'TEST0.DE','Der bessere Duplikat-Eintrag muss gewinnen');
assert.equal(out[0].wideScore,99);
assert.equal(out.some(x=>x.symbol==='BAD.V'),false,'Venture-Symbole duerfen keine Deep-Slots verbrauchen');
assert.equal(out.some(x=>x.symbol==='STALE.DE'),false,'Veraltete Wide-Sweep-Signale duerfen nicht verwendet werden');
assert.equal(out.some(x=>x.symbol==='ZERO.DE'),false,'Nullkurse duerfen nicht verwendet werden');
for(let i=1;i<out.length;i++)assert.ok(out[i-1].wideScore>=out[i].wideScore,'Wide Sweep muss nach Auffaelligkeit sortiert sein');
console.log(JSON.stringify({ok:true,target:WIDE_SWEEP_TARGET,selected:out.length,top:out[0],forcedBuy:false},null,2));
