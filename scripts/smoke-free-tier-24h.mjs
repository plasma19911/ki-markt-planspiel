import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const wrangler=read('wrangler.jsonc');
const index=read('src/index.js');
const v8=read('src/compact-portfolio-v8.js');

assert.match(wrangler,/"crons"\s*:\s*\["\*\/5 \* \* \* \*"\]/,'Cron muss exakt alle 5 Minuten laufen');
assert.match(wrangler,/"run_worker_first"\s*:\s*\["\/api\/\*",\s*"\/app\.js"\]/,'app.js muss durch den Free-UI-Throttle laufen');
assert.match(wrangler,/"head_sampling_rate"\s*:\s*0\.1/,'Observability-Sampling muss fuer Free reduziert sein');
assert.match(index,/compact-portfolio-v8\.js/,'Produktionsentry muss V8-Free-Guard nutzen');
assert.ok(index.includes(".replace(/setInterval\\(load,5000\\)/g,'setInterval(load,60000)')"),'UI-Transform muss 5s auf 60s drosseln');
assert.ok(index.includes(".replace(/includeEtfs:true/g,'includeEtfs:false')"),'UI-Transform muss ETFs clientseitig deaktivieren');
assert.match(v8,/FREE_SCAN_INTERVAL_MS=5\*60\*1000/,'Serverseitiger Scan-Cooldown muss 5 Minuten sein');
assert.match(v8,/maxScheduledScansPerDay:288/,'Status muss maximal 288 geplante Scans pro Tag melden');
assert.match(v8,/free-tier-5m-cooldown/,'Manuelle Zusatzscans muessen innerhalb des Intervalls blockiert werden');
assert.match(v8,/CORE_EQUITIES=80/);
assert.match(v8,/ROTATING_EQUITIES=160/);

function coveredRotating(totalEquities,startSlot=0,scans=288){
  const core=80,count=160,pool=Math.max(0,totalEquities-core),seen=new Set();
  if(!pool)return 0;
  for(let k=0;k<scans;k++){
    const slot=startSlot+k,start=(slot*Math.min(count,pool))%pool;
    for(let i=0;i<Math.min(count,pool);i++)seen.add((start+i)%pool);
  }
  return seen.size;
}
for(const total of [8200,8600]){
  const pool=total-80;
  for(const phase of [0,1,17,137,9999])assert.equal(coveredRotating(total,phase),pool,`${total} Aktien muessen unabhaengig von der Startphase innerhalb 24h komplett rotieren`);
}

const scansPerDay=24*60/5;
assert.equal(scansPerDay,288);
const statusCallsPerDay=24*60;
assert.equal(statusCallsPerDay,1440);

console.log(JSON.stringify({ok:true,cloudflarePlan:'FREE',scanIntervalMinutes:5,scheduledScansPerDay:scansPerDay,statusCallsPerDayPerOpenTab:statusCallsPerDay,fullCoverage8200:true,fullCoverage8600:true},null,2));
