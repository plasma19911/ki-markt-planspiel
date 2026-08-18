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
assert.match(v8,/LEADER_TARGET=50/,'Normaler Scanpool muss auf 50 externe Marktleader begrenzt sein');
assert.match(v8,/TradingView DE Most Active/);
assert.match(v8,/TradingView DE Unusual Volume/);
assert.match(v8,/TradingView DE Top Gainers/);
assert.match(v8,/Yahoo Most Active/);
assert.match(v8,/Yahoo Trending/);
assert.match(v8,/Yahoo Top Gainers/);
assert.match(v8,/EXTERNAL_TOP_50/,'Externe Listen muessen der Normalmodus sein');
assert.match(v8,/MASTER-FALLBACK/,'Bei Ausfall externer Listen muss ein kleiner statischer Fallback existieren');
assert.match(v8,/held_symbols_added/,'Gehaltene Aktien muessen unabhaengig von Toplisten zusaetzlich ueberwacht werden');
assert.doesNotMatch(v8,/ROTATING_EQUITIES=160/,'Die alte 8.000er Dauerrotation darf im Free-Top-50-Profil nicht mehr aktiv sein');

const scansPerDay=24*60/5;
assert.equal(scansPerDay,288);
const statusCallsPerDay=24*60;
assert.equal(statusCallsPerDay,1440);
const leaderPageFetchesMax=scansPerDay*6;
assert.equal(leaderPageFetchesMax,1728);

console.log(JSON.stringify({ok:true,cloudflarePlan:'FREE',scanIntervalMinutes:5,scheduledScansPerDay:scansPerDay,statusCallsPerDayPerOpenTab:statusCallsPerDay,dynamicExternalLeaderTarget:50,leaderSources:6,maxLeaderPageFetchesPerDayWithoutCache:leaderPageFetchesMax,heldStocksAlwaysAdded:true},null,2));
