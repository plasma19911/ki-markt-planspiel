import assert from 'node:assert/strict';
import {normalizeWideSweepEntries,WIDE_SWEEP_TARGET,WIDE_SWEEP_DIP_RESERVE} from '../src/wide-sweep-utils.js';

const now=Date.now(),ts=new Date(now-20_000).toISOString();
const rows=[];
for(let i=0;i<40;i++)rows.push({symbol:`TEST${i}.DE`,wideScore:20-i*.4,m5Pct:.1+i*.01,m20Pct:.3,accelerationPct:.08,sessionPct:1.5,last:10+i,observedAt:ts});
rows.push({symbol:'TEST0.DE',wideScore:99,m5Pct:1,m20Pct:2,accelerationPct:.8,sessionPct:3,last:10,observedAt:ts});
rows.push({symbol:'BAD.V',wideScore:100,m5Pct:3,m20Pct:5,accelerationPct:2,sessionPct:8,last:1,observedAt:ts});
rows.push({symbol:'STALE.DE',wideScore:100,m5Pct:3,m20Pct:5,accelerationPct:2,sessionPct:8,last:1,observedAt:new Date(now-10*60_000).toISOString()});
rows.push({symbol:'ZERO.DE',wideScore:100,last:0,observedAt:ts});
// Beim Zusammenfuehren von C#- und Fast-Radar-Daten muss die deutlich frischere
// Beobachtung gewinnen, auch wenn der alte Messpunkt noch einen hoeheren Score hatte.
rows.push({symbol:'FRESH.DE',wideScore:100,m5Pct:1,m20Pct:2,accelerationPct:.8,sessionPct:3,last:10,observedAt:new Date(now-70_000).toISOString()});
rows.push({symbol:'FRESH.DE',wideScore:19.8,m5Pct:.02,m20Pct:.1,accelerationPct:.02,sessionPct:.2,last:10.1,observedAt:new Date(now-10_000).toISOString()});

const out=normalizeWideSweepEntries(rows,now);
assert.equal(WIDE_SWEEP_TARGET,32,'Produktionsprofil muss 32 Finalisten erlauben');
assert.equal(WIDE_SWEEP_DIP_RESERVE,20,'20 der 32 Slots muessen fuer gebremste Dips reserviert sein');
assert.equal(out.length,WIDE_SWEEP_TARGET,'Wide Sweep muss auf die vorgesehenen Finalisten begrenzt bleiben');
assert.equal(out[0].symbol,'TEST0.DE','Der bessere zeitgleiche Duplikat-Eintrag muss gewinnen');
assert.equal(out[0].wideScore,99);
assert.equal(out.find(x=>x.symbol==='FRESH.DE')?.wideScore,19.8,'Eine deutlich frischere Messung muss einen alten hohen Score ersetzen');
assert.equal(out.some(x=>x.symbol==='BAD.V'),false,'Venture-Symbole duerfen keine Deep-Slots verbrauchen');
assert.equal(out.some(x=>x.symbol==='STALE.DE'),false,'Veraltete Wide-Sweep-Signale duerfen nicht verwendet werden');
assert.equal(out.some(x=>x.symbol==='ZERO.DE'),false,'Nullkurse duerfen nicht verwendet werden');

const dipRows=[];
for(let i=0;i<24;i++)dipRows.push({symbol:`DIP${i}.DE`,wideScore:1+i*.01,m5Pct:-.12,m20Pct:-.7,accelerationPct:.08+i*.002,sessionPct:-1.2-i*.08,last:30+i,observedAt:ts});
for(let i=0;i<24;i++)dipRows.push({symbol:`MOM${i}.DE`,wideScore:30-i*.2,m5Pct:.4,m20Pct:.8,accelerationPct:.12,sessionPct:2,last:60+i,observedAt:ts});
const dipOut=normalizeWideSweepEntries(dipRows,now);
assert.equal(dipOut.length,WIDE_SWEEP_TARGET);
assert.equal(dipOut.filter(x=>x.dipDiscovery).length,WIDE_SWEEP_DIP_RESERVE,'Gute gebremste Dips muessen ihre 20 reservierten Plaetze erhalten');
assert.equal(dipOut.slice(0,WIDE_SWEEP_DIP_RESERVE).every(x=>x.dipDiscovery),true,'Dip-Reserve muss vor Momentum gefuellt werden');

console.log(JSON.stringify({ok:true,target:WIDE_SWEEP_TARGET,dipReserve:WIDE_SWEEP_DIP_RESERVE,selected:out.length,top:out[0],freshMerge:out.find(x=>x.symbol==='FRESH.DE'),forcedBuy:false},null,2));
