import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreAllV287,enforceV287} from '../src/calibrated-action-score-v287.js';
import {buildBroadLeaderPool,applyRotatingBreadth} from '../src/scanner-breadth-v287.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const compat=read('public/ui-v283-fix.js');
const ui=read('public/v287-live-ui.js');
const pcFallback=read('public/pc-candidate-fallback-v292.js');
const changelog292=read('public/changelog-v292.js');
const entry=read('src/index-v19.js');
const prod=read('src/compact-portfolio-v11.js');
const profit=read('src/compact-portfolio-v297-profit-exit.js');
const directional=read('src/compact-portfolio-v296-directional-position.js');
const dashboard=read('src/index-v20.js');
const wrangler=read('wrangler.jsonc');
assert.match(compat,/compatibilityOnly:true/);assert.match(compat,/scoreRenderer:false/);assert.match(compat,/V29\.1/);
assert.match(ui,/Kaufscore 0–100 · V29\.1 Regeln \/ V29\.2 Pipeline/);assert.match(ui,/50–52 beobachten/);assert.match(ui,/53–55 Scout/);assert.match(ui,/56–57 Mikro-Starter/);assert.match(ui,/58–61 früher Einstieg/);assert.match(ui,/62–67 regulärer Kauf/);assert.match(ui,/62\+ stark halten/);assert.match(ui,/46–49 Verkauf beobachten/);assert.match(ui,/≤45 nur bestätigt verkaufen/);assert.match(ui,/≤32 dringender Score-Exit/);assert.match(ui,/Haltescore/);assert.match(ui,/Verkaufsscore/);assert.match(ui,/Mo–Fr 07:30–23:00/);assert.match(ui,/singleScoreRenderer:true/);assert.match(ui,/canonicalScoreBands:true/);
assert.match(ui,/topPcCandidates/);assert.match(ui,/pcDeepScore/);assert.match(ui,/pcFallback:true/);assert.match(ui,/positionFallback:true/);assert.match(ui,/Deep-Score · Research folgt/);assert.match(ui,/pc-candidate-fallback-v292\.js/);assert.match(ui,/changelog-v292\.js/);assert.match(ui,/version:29\.2/);
assert.match(pcFallback,/PC-Finalisten/);assert.match(pcFallback,/PC-Vollscan aktiv/);assert.match(pcFallback,/Deep-Score/);assert.match(pcFallback,/Research\/Safety entscheidet erst danach/);
assert.match(changelog292,/V29\.2 · Score-Pipeline repariert/);assert.match(changelog292,/ersten 1\.000/);assert.match(changelog292,/Deep 240/);
assert.match(entry,/v287-live-ui\.js/);
assert.match(prod,/compact-portfolio-v303-system-validation\.js/,'production compatibility entry must route through V30.3 system wrapper');
assert.match(prod,/compact-portfolio-v297-profit-exit\.js/,'production comments must document the preserved V29.7 profit stack');
assert.match(profit,/compact-portfolio-v296-directional-position\.js/,'V29.7 must preserve V29.6 directional held-score behavior underneath');
assert.match(directional,/compact-portfolio-v296-score-coherence\.js/,'directional V29.6 wrapper must preserve the coherent score stack underneath');

// V30.3 regression: the lightweight dashboard status is also used by UI and
// production verification. It must not strip the current runtime/daytrade policies.
for(const field of ['runtimeVersion','liveDecisionVersion','systemValidationPolicy','daytradeLiveFeedbackPolicy','daytradeEntryPolicy','daytradeDipPolicy','daytradeLargeCapPolicy','profitExitPolicy','canonicalScorePolicy','finalDecisionPolicy']){
 assert.match(dashboard,new RegExp(`['"]${field}['"]`),`Dashboard projection must expose ${field}`);
}
assert.match(dashboard,/x-planspiel-ui':'v30\.3/,'Dashboard response header must identify V30.3');
assert.match(dashboard,/decision-score-56-v30\.3-system/,'Dashboard must advertise the current authoritative BUY-56 score stack');
assert.match(dashboard,/v30\.2-live-feedback\+v30\.1-fresh-tape\+v30\.0-dips/,'Dashboard must expose the current daytrade entry stack');
assert.match(dashboard,/PC_FIRST_FULL_MASTER_STAGED/);
assert.match(wrangler,/"main"\s*:\s*"src\/index-v20\.js"/);

const now=Date.parse('2026-08-20T17:40:00Z');
function storage(seed={}){const m=new Map(Object.entries(seed));return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))},_m:m}}
{
 const s=storage(),state={candidates:[
  {symbol:'MARA.MX',price:20,score:6.45,confidence:.63,day_change:13.3},
  {symbol:'GOOD',price:100,score:6.2,confidence:.75,day_change:3,momentum20:.45,momentum5:.18,volumeRatio:1.6,newsScore:.4},
  {symbol:'CHASE',price:50,score:7,confidence:.85,day_change:15,momentum20:1.2,momentum5:1,momentumAcceleration5:.3,volumeRatio:4.5,newsScore:.6,rsi:85}
 ],positions:[]};
 const r=scoreAllV287(state,s,now,false);assert.equal(r.candidateCount,3);assert.equal(r.allDecisionCandidatesScored,true);assert.ok(r.ranking.find(x=>x.symbol==='GOOD').buyScore>75);assert.ok(r.ranking.find(x=>x.symbol==='CHASE').buyScore<78);assert.ok(r.ranking.find(x=>x.symbol==='MARA.MX').buyScore<70);
}
{
 const seed={'state/calibrated-action-score-v287':{version:1,snapshots:{GOOD:{at:now-60_000,score:82}},recent:[],lastRotationAt:0,stats:{}}};const s=storage(seed),state={config:{cash:6000},candidates:[{symbol:'GOOD',price:100,score:6.2,confidence:.75,day_change:3,momentum20:.45,momentum5:.18,volumeRatio:1.6,newsScore:.4}],positions:[]};const p={summary:'x',actions:[{symbol:'GOOD',action:'HOLD',reason:'wait'}]};const r=enforceV287(p,state,s,now);assert.equal(r.plan.actions[0].action,'BUY');
}
{
 const master=Array.from({length:80},(_,i)=>({symbol:`S${i+1}`,marketCapUSD:1_000_000_000})),entries=[];for(let i=0;i<70;i++){entries.push({symbol:`S${i+1}`,market:'GLOBAL',source:'A',rank:i+1});if(i<30)entries.push({symbol:`S${i+1}`,market:'GLOBAL',source:'B',rank:i+1})};const b=buildBroadLeaderPool(entries,master);assert.equal(b.pool.length,60);const base={equities:[...b.pool.slice(0,25),{...master[70],forwardWatch:true}]};const a=applyRotatingBreadth(base,b,{config:{scan_count:1},positions:[]}),c=applyRotatingBreadth(base,b,{config:{scan_count:2},positions:[]});assert.ok(a.breadthRotationApplied);assert.notDeepEqual(a.equities.map(x=>x.symbol),c.equities.map(x=>x.symbol));
}
console.log('V30.3 dashboard-policy exposure + score-pipeline UI regression tests: OK');
