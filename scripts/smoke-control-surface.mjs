import assert from 'node:assert/strict';
import fs from 'node:fs';

// Permanent regression for the public control surface, dashboard payload budget,
// and Worker/static-asset routing. Keep this in the normal validation workflow.
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const wrapper=read('src/index-v18.js');
const index=read('src/index.js');
const quota=read('public/quota-guard.js');
const wrangler=read('wrangler.jsonc');

// State-changing endpoints must stay behind a mandatory server-side secret.
for(const path of ['/api/start','/api/stop','/api/reset','/api/scan','/api/migrate-from-old-sql']){
  assert.ok(wrapper.includes(`'${path}'`),`${path} muss im CONTROL_TOKEN-Guard bleiben`);
}
assert.match(wrapper,/CONTROL_TOKEN/,'Steuer-Guard braucht CONTROL_TOKEN');
assert.match(wrapper,/controlSecretMissing:true[^\n]*503|503[^\n]*controlSecretMissing:true/,'Fehlendes CONTROL_TOKEN muss Steueraktionen fail-closed sperren');
assert.match(wrapper,/controlTokenRequired:true[^\n]*401|401[^\n]*controlTokenRequired:true/,'Fehlendes oder falsches Token muss 401 liefern');
assert.match(wrapper,/x-control-token/,'Server muss x-control-token pruefen');
assert.match(wrapper,/sec-fetch-site/,'Browser-Cross-Site-Schutz muss aktiv bleiben');
assert.match(wrapper,/origin/,'Origin-Pruefung muss aktiv bleiben');

// The browser must attach the token and be able to recover from a 401 prompt.
assert.match(quota,/planspiel\.controlToken/,'UI muss CONTROL_TOKEN lokal verwalten');
assert.match(quota,/x-control-token/,'UI muss x-control-token an Steuer-POSTs senden');
assert.match(quota,/controlTokenRequired/,'UI muss eine 401-Token-Anforderung erkennen');

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
  controlTokenFailClosed:true,
  browserCsrfGuard:true,
  dashboardHistoryWindow:60,
  dashboardAiLogWindow:40,
  lazyHistory:true,
  staticAssetsBypassWorker:true
},null,2));
