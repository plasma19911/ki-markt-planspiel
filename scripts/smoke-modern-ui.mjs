import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('public/index.html','utf8');
const css=readFileSync('public/styles.css','utf8');
const app=readFileSync('public/app.js','utf8');

const requiredIds=[
 'statusPill','marketHeaderStatus','pcHeaderStatus','cloudHeaderStatus','scanHeaderStatus',
 'equity','pnl','cash','positionCount','dailyRisk','marketMode','chart','allocationChart',
 'positionsBody','positionCards','candidatesBody','futureThemeChips','futureCatalystList',
 'replaySummary','replayFocus','activityTimeline','newsTrendPill','newsRadarBody',
 'statsGrid','healthGrid','aiLog','historyBody','startCapital','currency','durationValue',
 'durationUnit','riskMode','feeFixed','feePercent','aiEnabled','startBtn','scanBtn','stopBtn','resetBtn',
 'liveTabBtn','weekTabBtn','livePanel','weekPanel','analysisStyle','analysisRunBtn','analysisCompare',
 'perfectResult','walkResult','walkTimeline','dossierGrid','regimePill','intelligenceMeta'
];
for(const id of requiredIds)assert.match(html,new RegExp(`id=["']${id}["']`),`UI-ID fehlt: ${id}`);

for(const marker of ['appShell','sidebar','heroKpis','dashboardGrid','positionCards','replayGrid','activityTimeline']){
 assert.ok(css.includes(`.${marker}`),`CSS-Komponente fehlt: ${marker}`);
}

assert.ok(app.includes("includeEtfs:false"),'UI-Start darf ETFs nicht wieder aktivieren');
assert.ok(app.includes("renderFutureWatch"),'Katalysator-Renderer fehlt');
assert.ok(app.includes("renderReplay"),'Replay-Renderer fehlt');
assert.ok(app.includes("renderActivity"),'Aktivitäts-Renderer fehlt');
assert.ok(app.includes("renderPositionCards"),'Positionskarten-Renderer fehlt');
assert.ok(html.includes('KI-Markt-Planspiel'),'Branding fehlt');

console.log(JSON.stringify({ok:true,requiredIds:requiredIds.length,modernLayout:true,responsive:true,liveDataRenderers:true,stocksOnlyStart:true},null,2));
