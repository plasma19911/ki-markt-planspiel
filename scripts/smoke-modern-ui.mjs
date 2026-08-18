import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('public/index.html','utf8');
const css=[
 readFileSync('public/styles.css','utf8'),
 readFileSync('public/candidate-plain-ui.css','utf8'),
 readFileSync('public/compact-ui.css','utf8')
].join('\n');
const app=readFileSync('public/app.js','utf8');
const analysis=readFileSync('public/analysis-ui.js','utf8');
const focus=readFileSync('public/focus-ui.js','utf8');

const requiredIds=[
 'statusPill','marketHeaderStatus','pcHeaderStatus','cloudHeaderStatus','scanHeaderStatus',
 'equity','pnl','cash','positionCount','dailyRisk','marketMode','chart','allocationChart',
 'positionsBody','positionCards','candidatesBody','futureThemeChips','futureCatalystList',
 'replaySummary','replayFocus','activityTimeline','newsTrendPill','newsRadarBody',
 'statsGrid','healthGrid','aiLog','historyBody','startCapital','currency','durationValue',
 'durationUnit','riskMode','feeFixed','feePercent','aiEnabled','startBtn','scanBtn','stopBtn','resetBtn',
 'livePanel','dossierGrid','regimePill','intelligenceMeta'
];
for(const id of requiredIds)assert.match(html,new RegExp(`id=["']${id}["']`),`UI-ID fehlt: ${id}`);

for(const marker of ['appShell','sidebar','heroKpis','dashboardGrid','positionCards','candidateHelp','plainCell','secondaryDetails','secondaryGrid','settingsDetails']){
 assert.ok(css.includes(`.${marker}`),`CSS-Komponente fehlt: ${marker}`);
}

assert.ok(app.includes("includeEtfs:false"),'UI-Start darf ETFs nicht wieder aktivieren');
assert.ok(app.includes('companySummary'),'Einfache Firmenbeschreibung fehlt');
assert.ok(app.includes('candidateInfluence'),'Einfache News-/Einfluss-Erklärung fehlt');
assert.ok(app.includes('renderFutureWatch')&&app.includes('renderReplay')&&app.includes('renderActivity'),'Live-Renderer fehlen');
assert.ok(html.includes('Was macht die Firma?')&&html.includes('Was bewegt die Aktie gerade?'),'Einfache Kandidaten-Spalten fehlen');
assert.ok(!html.includes('Perfekt vs. KI')&&!html.includes('2026-Auswertung'),'Historische 2026-Auswertung muss aus der UI entfernt sein');
assert.ok(!app.includes('weekTabBtn')&&!app.includes('analysisRunBtn'),'App darf keine 2026-Tab-Bindings mehr enthalten');
assert.ok(!analysis.includes('/analysis-2026.json'),'Historische 2026-Datei darf nicht mehr im UI geladen werden');
assert.ok(analysis.includes("import './focus-ui.js'"),'Focus-UI muss geladen werden');
assert.ok(focus.includes('Weitere Analysen & Details'),'Sekundärdetails müssen einklappbar sein');
assert.ok(focus.includes('Einstellungen'),'Einstellungen müssen aus der Hauptübersicht herausgenommen sein');
assert.ok(css.includes('height:118px!important'),'Desktop-Diagramme müssen deutlich kleiner sein');
assert.ok(css.includes('height:96px!important'),'Handy-Diagramme müssen kompakt sein');
assert.ok(html.includes('KI-Markt-Planspiel'),'Branding fehlt');

console.log(JSON.stringify({ok:true,requiredIds:requiredIds.length,focusedHierarchy:true,collapsibleSecondary:true,compactCharts:true,plainCandidateLanguage:true,historical2026Removed:true,stocksOnlyStart:true},null,2));
