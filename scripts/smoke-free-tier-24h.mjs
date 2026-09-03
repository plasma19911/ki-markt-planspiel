import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gettexSessionState} from '../src/gettex-session.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const wrangler=read('wrangler.jsonc');
const index=read('src/index.js');
const indexCore=read('src/index-core.js');
const index20=read('src/index-v20.js');
const index21=read('src/index-v21.js');
const compact=read('src/compact-portfolio.js');
const constants=read('src/constants.js');
const v8=read('src/compact-portfolio-v8.js');
const v9=read('src/compact-portfolio-v9.js');
const v10=read('src/compact-portfolio-v10.js');
const v11=read('src/compact-portfolio-v11.js');
const v31712=read('src/compact-portfolio-v31712-learning-status.js');
const v31710=read('src/compact-portfolio-v31710-news-catalyst.js');
const v22=read('src/compact-portfolio-v22-active-learning.js');
const v21Budget=read('src/compact-portfolio-v21-source-budget.js');
const v287=read('src/compact-portfolio-v287-calibrated-breadth.js');
const v288=read('src/compact-portfolio-v288-pc-first.js');
const score287=read('src/calibrated-action-score-v287.js');
const requestBudget=read('src/request-fetch-budget.js');
const quota=read('public/quota-guard.js');
const pcAgent=read('pc-agent/pc-agent-v288.ps1');
const pcScanner=read('pc-agent/pc-first-scanner.ps1');
const pcInstall=read('pc-agent/install.ps1');

assert.match(wrangler,/"crons"\s*:\s*\["\* 5-22 \* \* 1-5"\]/,'Cloudflare-Cron muss minütlich nur als Gap-Wächter feuern');
assert.match(index20,/age>95_000/,'Cloudflare darf nur bei echter >95s Scan-Lücke übernehmen');
assert.match(wrangler,/"head_sampling_rate"\s*:\s*0\.1/,'Observability-Sampling muss fuer Free reduziert sein');
assert.match(wrangler,/"main"\s*:\s*"src\/index-v21\.js"/,'Produktionsentry muss die V31.7.12 Chart/News-Schicht verwenden');
assert.match(index21,/from '\.\/index-v20\.js'/,'V31.7.12 muss an die Dashboard/Gap-Fill-Schicht index-v20.js delegieren');
assert.match(index21,/positionChartHistoryData/,'V31.7.12 muss universelle Charts am Produktionsentry bereitstellen');
assert.match(index21,/buildLiveNewsFeed/,'V31.7.12 muss den klickbaren Live-News-Feed am Produktionsentry bereitstellen');
assert.match(index,/index-core\.js/,'API-Wrapper muss an den aktuellen Produktions-Kompatibilitätspfad index-core.js delegieren');
assert.match(indexCore,/compact-portfolio-v11\.js/,'index-core.js muss den Produktions-Kompatibilitätsportfolio-Pfad verwenden');
assert.match(v11,/compact-portfolio-v31712-learning-status\.js/,'V11 muss V31.7.12 Lernstatus-Recovery aktivieren');
assert.match(v31712,/compact-portfolio-v31710-news-catalyst\.js/,'V31.7.12 muss die Fresh-News-/Start-Persistenz-Schicht behalten');
assert.match(v31710,/compact-portfolio-v310-agent-recovery\.js/,'V31.7.10 muss Unified Decision + PC-Agent-Recovery darunter behalten');
assert.match(v288,/compact-portfolio-v287-calibrated-breadth\.js/,'V28.8 muss V28.7 als sicheren Fallback behalten');
assert.match(v22,/FinalDecisionController/,'Finaler Entscheidungscontroller muss aktiv bleiben');

assert.match(index,/\/api\/agent\/universe/,'PC-Agent braucht den deduplizierten Aktien-Master vom Server');
assert.match(index,/PC_AGENT_TOKEN/,'PC-Agent-Endpunkte muessen per Secret geschützt sein');
assert.match(index,/\/api\/agent\/prefetch/,'PC-Agent muss verdichtete Kandidaten hochladen können');
assert.match(index,/\/api\/agent\/scan/,'PC-Agent muss den finalen Minuten-Scan auslösen können');
assert.match(index20,/PC_FIRST_FULL_MASTER_STAGED/,'Universe-Profil muss PC-FIRST Staging beschreiben');
assert.match(index20,/stage2Target:400/);assert.match(index20,/deepTarget:240/);assert.match(index20,/finalistTarget:60/);assert.match(index20,/cloudflareValidationTarget:18/);

assert.match(pcAgent,/PC_FIRST_FULL_UNIVERSE_V288/,'Windows-Agent muss PC-FIRST als Betriebsmodus melden');
assert.match(pcAgent,/Invoke-PcFirstPipeline/,'Windows-Agent muss den Voll-Master-Pipeline-Schritt vor dem finalen Cloudflare-Scan ausführen');
assert.match(pcAgent,/pcFirstScan=\$pc\.summary/,'PC muss seine Stufen-/Abdeckungsdaten an Cloudflare senden');
assert.match(pcScanner,/PcFirstShardCount=4/,'PowerShell-Fallback muss vier rollierende Shards unterstützen');
assert.match(pcScanner,/Select-Object -First 400/,'Stufe 2 muss bis zu 400 Werte behalten');
assert.match(pcScanner,/Select-Object -First 240/,'PowerShell-Deep-Stufe muss bis zu 240 Werte prüfen');
assert.match(pcScanner,/Select-Object -First 60/,'Finalistenpool muss 60 Werte liefern');
assert.match(pcScanner,/Split-PcFirstChunks \$symbols 80/,'Voll-Master muss gebündelt statt mit Einzelrequests abgefragt werden');
assert.match(v288,/CF_VALIDATION_TARGET=18/,'Cloudflare soll bei frischen PC-Daten nur einen kleinen Final-Slice validieren');
assert.match(v288,/cloudflareFallbackActive/,'Status muss PC-Ausfall/Fallback sichtbar machen');
assert.match(v288,/PC_FIRST_FULL_MASTER_TOP60/,'PC-Ranking muss den V28.7-Broad-Pool direkt füllen');

assert.match(score287,/let score=50/);assert.match(score287,/reliability=\.68\+\.32\*coverage/);assert.match(score287,/day>=12/);assert.match(score287,/overextended/);assert.match(score287,/partial:true/);assert.match(score287,/buyScore>=75/);
assert.match(v287,/calibratedActionScoreV287:true/);

assert.match(v8,/FREE_SCAN_INTERVAL_MS=60\*1000/);assert.match(v8,/LEADER_TARGET=25/);assert.match(v8,/EXTERNAL_FETCH_SOFT_CAP=36/);assert.match(v8,/free-tier-subrequest-soft-cap/);assert.match(requestBudget,/AsyncLocalStorage/);
assert.match(constants,/DEEP_LIMIT = 6/);assert.match(constants,/NEWS_RADAR_BATCH = 2/);assert.match(constants,/ZERO_ETF_MASTER = \[\]/);assert.match(constants,/LEVERAGED_ETFS = \[\]/);
assert.match(v21Budget,/earlyDipPrioritySlots:1/);
assert.match(v9,/gettex-closed-sleep/);assert.match(v9,/PREOPEN_FETCH_SOFT_CAP=24/);assert.match(v9,/preOpenPrepare/);assert.match(v9,/noTrades:true/);
assert.match(v10,/AGENT_ONLINE_MS=150\*1000/);
assert.match(compact,/AI_DAILY_NEURON_SOFT_CAP=8_000/);assert.match(compact,/AI_PLAN_OUTPUT_CAP=400/);assert.match(compact,/AI_NEWS_OUTPUT_CAP=120/);
assert.match(quota,/ACTIVE_STATUS_TTL_MS=25_000/);assert.match(quota,/SLEEP_STATUS_TTL_MS=10\*60\*1000/);assert.match(quota,/statusTtl\(\)/);
assert.match(pcInstall,/pc-agent-v288\.ps1/);assert.match(pcInstall,/pc-first-scanner\.ps1/);assert.match(pcInstall,/pcFirstShardCount=4/);assert.match(pcInstall,/maxStorageGb=2\.0/);assert.match(pcInstall,/trimToGb=1\.6/);assert.match(pcInstall,/CurrentVersion\\Run/);

let g=gettexSessionState(new Date('2026-08-18T05:24:00Z'));assert.equal(g.phase,'CLOSED');
g=gettexSessionState(new Date('2026-08-18T05:25:00Z'));assert.equal(g.phase,'PREOPEN');assert.equal(g.prepareNow,true);
g=gettexSessionState(new Date('2026-08-18T05:30:00Z'));assert.equal(g.phase,'OPEN');
g=gettexSessionState(new Date('2026-08-18T20:59:00Z'));assert.equal(g.phase,'OPEN');
g=gettexSessionState(new Date('2026-08-18T21:00:00Z'));assert.equal(g.phase,'CLOSED');
g=gettexSessionState(new Date('2026-05-01T08:00:00Z'));assert.equal(g.phase,'NON_TRADING_DAY');assert.equal(g.isVenueHoliday,true);
g=gettexSessionState(new Date('2026-04-03T08:00:00Z'));assert.equal(g.phase,'NON_TRADING_DAY');assert.equal(g.isVenueHoliday,true);
g=gettexSessionState(new Date('2026-04-06T08:00:00Z'));assert.equal(g.phase,'NON_TRADING_DAY');assert.equal(g.isVenueHoliday,true);
g=gettexSessionState(new Date('2026-08-22T10:00:00Z'));assert.equal(g.phase,'NON_TRADING_DAY');

const marketMinutes=(23*60)-(7*60+30);assert.equal(marketMinutes,930);
const cronEnvelope=(22-5+1)*60;assert.equal(cronEnvelope,1080);
console.log(JSON.stringify({ok:true,cloudflarePlan:'FREE',mode:'V31.7.12 UNIFIED + CLICKABLE CHART/NEWS + PC-FIRST FULL MASTER',tradeRepublicHolidayCalendar:true,legacySessionTest:'historical gettex-session compatibility only',pcFullMasterCycleMinutes:4,stage2Target:400,deepTarget:240,finalistTarget:60,cloudflareValidationTarget:18,cloudflareGapFillAfterSeconds:95,cronWatchdogInvocationsPerWeekday:cronEnvelope,pcMarketMinutesPerTradingDay:marketMinutes,cloudflareExternalFetchSoftCapFallback:36,aiNeuronSoftCapPerUtcDay:8000},null,2));
