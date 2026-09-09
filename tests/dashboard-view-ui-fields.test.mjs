import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url),v20=fs.readFileSync(new URL('src/index-v20.js',root),'utf8'),match=v20.match(/const DASHBOARD_FIELDS=\[([\s\S]*?)\];/);
assert.ok(match,'DASHBOARD_FIELDS muss auffindbar bleiben');
const declared=new Set([...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
const modules={exposureNetwork:'public/exposure-ui.js',brokerTarget:'public/zero-ui.js',agmCalendar:'public/agm-calendar-ui.js',freeTierBudget:'public/data-kraken-ui.js',marketBreadth:'public/data-kraken-ui.js'};
for(const [field,file] of Object.entries(modules)){const source=fs.readFileSync(new URL(file,root),'utf8');assert.match(source,new RegExp(`\\b${field}\\b`),`${file} muss ${field} tatsächlich lesen`);assert.ok(declared.has(field),`${field} muss im Browser-Dashboard-View enthalten sein`)}
const html=fs.readFileSync(new URL('public/index.html',root),'utf8');
assert.match(html,/src="\/exposure-ui\.js[^" ]*"/,'Expositionsnetz-Modul muss im Dashboard geladen werden');
assert.match(html,/src="\/zero-ui\.js[^" ]*"/,'Trade-Republic-Zielprofil muss im Dashboard geladen werden');
assert.match(v20,/dashboardRequest=view==='dashboard'\|\|\(!view&&!agentUa\)/,'Normale Browser erhalten weiterhin den Dashboard-View');
assert.match(v20,/DASHBOARD_REFRESH_MS=20_000/,'Dashboardcache muss nach kurzer Zeit im Hintergrund erneuern');
assert.match(v20,/DASHBOARD_STALE_MS=90_000/,'Dashboardcache darf nie unbegrenzt alte Daten ausliefern');
assert.match(v20,/x-dashboard-cache/,'Dashboardantwort muss Cachetreffer transparent kennzeichnen');
console.log(JSON.stringify({ok:true,repairedUiFields:Object.keys(modules)},null,2));
