import assert from 'node:assert/strict';
import fs from 'node:fs';

// Permanent regression for the public control surface, dashboard payload budget,
// and Worker/static-asset routing. Keep this in the normal validation workflow.
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const wrapper=read('src/index-v18.js');
const index=read('src/index.js');
const quota=read('public/quota-guard.js');
const wrangler=read('wrangler.jsonc');

// Owner UI is intentionally passwordless. Keep only the zero-friction browser
// cross-site/CSRF protection so foreign web pages cannot drive the controls.
for(const path of ['/api/start','/api/stop','/api/reset','/api/scan','/api/migrate-from-old-sql']){
  assert.ok(wrapper.includes(`'${path}'`),`${path} muss im Browser-Origin-Guard bleiben`);
}
assert.doesNotMatch(wrapper,/CONTROL_TOKEN|x-control-token|controlTokenRequired|controlSecretMissing/,'CONTROL_TOKEN darf nicht wieder fuer normale Steueraktionen verlangt werden');
assert.match(wrapper,/sec-fetch-site/,'Browser-Cross-Site-Schutz muss aktiv bleiben');
assert.match(wrapper,/origin/,'Origin-Pruefung muss aktiv bleiben');
assert.doesNotMatch(quota,/planspiel\.controlToken|x-control-token|controlTokenRequired|window\.prompt\(/,'UI darf keinen Steuer-Token mehr abfragen');

// Dashboard payload must stay windowed; older history is fetched only on demand.
assert.match(index,/HISTORY_WINDOW=60/,'Dashboard-History muss auf 60 Eintraege begrenzt bleiben');
assert.match(index,/AILOG_WINDOW=40/,'Dashboard-KI-Log muss auf 40 Eintraege begrenzt bleiben');
assert.match(index,/\/api\/history/,'Archiv braucht einen separaten History-Endpunkt');
assert.match(quota,/\/api\/history\?kind=history&limit=500/,'UI muss aeltere History erst auf Nutzerwunsch laden');

// Static assets should bypass the Worker; API and app shell must still run worker-first.
assert.doesNotMatch(wrangler,/"run_worker_first"\s*:\s*\[\s*"\/\*"\s*\]/,'Statische Assets duerfen nicht wieder komplett worker-first laufen');
for(const route of ['/api/*','/','/index.html'])assert.ok(wrangler.includes(`"${route}"`),`${route} muss worker-first bleiben`);
assert.match(wrangler,/"required"\s*:\s*\[\s*"PC_AGENT_TOKEN"\s*\]/,'PC_AGENT_TOKEN muss als erforderliches Deploy-Secret deklariert bleiben');

console.log(JSON.stringify({
  ok:true,
  guardedControlEndpoints:5,
  passwordlessControlUi:true,
  browserCsrfGuard:true,
  dashboardHistoryWindow:60,
  dashboardAiLogWindow:40,
  lazyHistory:true,
  staticAssetsBypassWorker:true
},null,2));
