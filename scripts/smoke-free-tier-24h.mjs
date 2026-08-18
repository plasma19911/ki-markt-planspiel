import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gettexSessionState} from '../src/gettex-session.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const wrangler=read('wrangler.jsonc');
const index=read('src/index.js');
const compact=read('src/compact-portfolio.js');
const constants=read('src/constants.js');
const v2=read('src/compact-portfolio-v2.js');
const v3=read('src/compact-portfolio-v3.js');
const v4=read('src/compact-portfolio-v4.js');
const v8=read('src/compact-portfolio-v8.js');
const v9=read('src/compact-portfolio-v9.js');
const future=read('src/future-watch.js');
const quota=read('public/quota-guard.js');

assert.match(wrangler,/"crons"\s*:\s*\["\* 5-22 \* \* 1-5"\]/,'Cron darf nachts und am Wochenende nicht durchgehend feuern');
assert.match(wrangler,/"head_sampling_rate"\s*:\s*0\.1/,'Observability-Sampling muss fuer Free reduziert sein');
assert.match(index,/compact-portfolio-v9\.js/,'Produktionsentry muss V9 mit Future-Watch nutzen');
assert.match(index,/gettexSessionState/,'Scheduled-Handler muss gettex vor dem Durable Object pruefen');
assert.match(index,/session\.prepareNow/,'07:25 muss eine separate Pre-Open-Vorbereitung ausloesen koennen');
assert.ok(index.includes(".replace(/setInterval\\(load,5000\\)/g,'setInterval(load,60000)')"),'UI-Status muss waehrend Handel auf 60s gedrosselt bleiben');
assert.ok(index.includes(".replace(/includeEtfs:true/g,'includeEtfs:false')"),'UI muss ETFs clientseitig deaktivieren');

assert.match(compact,/AI_DAILY_NEURON_SOFT_CAP=8_000/,'Workers-AI muss vor dem 10k-Free-Tageslimit softwareseitig stoppen');
assert.match(compact,/GLM_INPUT_NEURONS_PER_TOKEN=5_500\/1_000_000/,'GLM Input-Neuronfaktor muss dem Cloudflare-Modell entsprechen');
assert.match(compact,/GLM_OUTPUT_NEURONS_PER_TOKEN=36_400\/1_000_000/,'GLM Output-Neuronfaktor muss dem Cloudflare-Modell entsprechen');
assert.match(compact,/AI_PLAN_OUTPUT_CAP=400/,'Plan-AI-Ausgabe muss begrenzt sein');
assert.match(compact,/AI_NEWS_OUTPUT_CAP=120/,'News-AI-Ausgabe muss begrenzt sein');
assert.match(compact,/freeAiBudget/,'AI-Tagesbudget muss im Status sichtbar sein');
assert.match(compact,/includeEtfs:false/,'Basismodul darf ETFs nicht wieder aktivieren');

assert.match(v2,/NEWS_LEARNING_COOLDOWN_MS=13\*60\*1000/,'News-Lernen muss von den 10-Minuten-Spitzen entzerrt sein');
assert.match(v3,/MACRO_COOLDOWN_MS=11\*60\*1000/,'Makro muss von den 10-Minuten-Spitzen entzerrt sein');
assert.match(v4,/!raw\?\.macroRadar\?\.updatedAt/,'Exposure darf nicht vor dem ersten Makrostand leer gecacht werden');

assert.match(v8,/FREE_SCAN_INTERVAL_MS=60\*1000/,'Serverseitiger Scan-Cooldown muss eine Minute sein');
assert.match(v8,/LEADER_TARGET=25/,'Normaler Scanpool muss auf 25 externe Marktleader begrenzt sein');
assert.match(v8,/LEADER_CACHE_MS=5\*60\*1000/,'Externe Leaderlisten duerfen nur alle 5 Minuten erneuert werden');
assert.match(v8,/LEADER_CACHE_KV_KEY/,'Leadercache muss Durable-Object-Neustarts ueberstehen');
assert.match(v8,/persistentLeaderCache:true/,'Status muss persistenten Leadercache bestaetigen');
assert.match(v8,/EXTERNAL_FETCH_SOFT_CAP=36/,'Pro Scan muss mit Redirect-Reserve vor dem Cloudflare-50er-Hardlimit gebremst werden');
assert.match(v8,/free-tier-subrequest-soft-cap/,'Soft-Cap muss reale Zusatzfetches blockieren');
assert.match(v8,/held_symbols_added/,'Gehaltene Aktien muessen unabhaengig von Toplisten zusaetzlich ueberwacht werden');
assert.match(constants,/DEEP_LIMIT = 2/,'Nur zwei Finalisten duerfen pro Minutenrunde tief geprueft werden');
assert.match(constants,/NEWS_RADAR_BATCH = 2/,'News-Radar muss im Minutenprofil klein bleiben');

assert.match(v9,/gettex-closed-sleep/,'Ausserhalb gettex muss der komplette Scanner schlafen');
assert.match(v9,/PREOPEN_FETCH_SOFT_CAP=24/,'Pre-Open muss einen eigenen Subrequest-Softcap besitzen');
assert.match(v9,/noNews:true/,'Schlafmodus muss News explizit deaktivieren');
assert.match(v9,/preOpenPrepare/,'07:25 muss Overnight-Vorbereitung ohne Trades besitzen');
assert.match(v9,/noTrades:true/,'Pre-Open darf keine Trades ausfuehren');
assert.match(v9,/FUTURE_WATCH_COOLDOWN_MS=10\*60\*1000/,'Fruehindikator darf nur alle 10 Minuten extern aktualisiert werden');
assert.match(future,/AI_POWER_GRID/);assert.match(future,/NUCLEAR_URANIUM/);assert.match(future,/DEFENSE_SECURITY/);assert.match(future,/CYBER_SECURITY/);assert.match(future,/ENERGY_SECURITY/);
assert.match(future,/v7\/finance\/spark/,'Fruehindikator-Kurse muessen gebuendelt geladen werden');

assert.match(quota,/ACTIVE_STATUS_TTL_MS=55_000/,'Dashboard muss waehrend Handel fast eine Minute cachen');
assert.match(quota,/SLEEP_STATUS_TTL_MS=10\*60\*1000/,'Dashboard muss nachts 10 Minuten cachen');
assert.match(quota,/future-watch-ui\.js/,'Fruehindikator-UI muss geladen werden');

// Europe/Berlin DST-safe session checks.
let g=gettexSessionState(new Date('2026-08-18T05:24:00Z'));assert.equal(g.phase,'CLOSED');
g=gettexSessionState(new Date('2026-08-18T05:25:00Z'));assert.equal(g.phase,'PREOPEN');assert.equal(g.prepareNow,true);
g=gettexSessionState(new Date('2026-08-18T05:30:00Z'));assert.equal(g.phase,'OPEN');
g=gettexSessionState(new Date('2026-08-18T20:59:00Z'));assert.equal(g.phase,'OPEN');
g=gettexSessionState(new Date('2026-08-18T21:00:00Z'));assert.equal(g.phase,'CLOSED');
// Winter: CET is UTC+1.
g=gettexSessionState(new Date('2026-01-02T06:25:00Z'));assert.equal(g.phase,'PREOPEN');
g=gettexSessionState(new Date('2026-01-02T06:30:00Z'));assert.equal(g.phase,'OPEN');
// Official 2026 gettex holiday and weekend.
g=gettexSessionState(new Date('2026-05-01T08:00:00Z'));assert.equal(g.phase,'NON_TRADING_DAY');
g=gettexSessionState(new Date('2026-08-22T10:00:00Z'));assert.equal(g.phase,'NON_TRADING_DAY');

const marketScansPerTradingDay=(23*60)-(7*60+30); // 07:30..22:59
assert.equal(marketScansPerTradingDay,930);
const preopenRunsPerTradingDay=1;
const leaderRefreshesPerTradingDay=1+Math.ceil(marketScansPerTradingDay/5); // 07:25 plus open window
assert.equal(leaderRefreshesPerTradingDay,187);
const maxLeaderPageFetchesPerTradingDay=leaderRefreshesPerTradingDay*4;
assert.equal(maxLeaderPageFetchesPerTradingDay,748);
const cronEnvelopeInvocationsPerWeekday=(22-5+1)*60;
assert.equal(cronEnvelopeInvocationsPerWeekday,1080);

console.log(JSON.stringify({ok:true,cloudflarePlan:'FREE',gettex:'07:25 PREOPEN; 07:30-23:00 OPEN; sonst SLEEP',marketScansPerTradingDay,preopenRunsPerTradingDay,cronEnvelopeInvocationsPerWeekday,dynamicExternalLeaderTarget:25,leaderRefreshMinutes:5,persistentLeaderCache:true,leaderSources:4,maxLeaderPageFetchesPerTradingDay,deepFinalists:2,externalFetchSoftCapPerScan:36,preopenFetchSoftCap:24,aiNeuronSoftCapPerUtcDay:8000,aiPlanOutputTokensMax:400,aiNewsOutputTokensMax:120,nightNews:false,nightMarketScans:false,nightStatusCacheMinutes:10,heldStocksAlwaysAdded:true},null,2));
