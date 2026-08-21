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

// Legacy compatibility modules may stay, but they must not be the active score renderer.
assert.match(compat,/compatibilityOnly:true/);assert.match(compat,/scoreRenderer:false/);

// Current visible semantics: Trade Republic Bestpreis + authoritative V29.7 rules.
assert.match(ui,/DecisionScore · V29\.7/);
assert.match(ui,/0–49 kein Kauf/);assert.match(ui,/50–55 beobachten/);assert.match(ui,/56\+ SOFORT BUY/);
assert.match(ui,/Trade Republic · Bestpreis · Mo–Fr 07:30–23:00/);
assert.match(ui,/Schwäche: −15 Scorepunkte \+ negativer Chart/);
assert.match(ui,/Gewinn: ab \+0,8 % gestaffelt/);assert.match(ui,/ab \+5 % Gewinn sichern/);
assert.match(ui,/immediateBuyFrom56:true/);assert.match(ui,/softGatesAbove56:false/);assert.match(ui,/negativeExitDelta:-15/);assert.match(ui,/adaptiveProfitExitV297:true/);assert.match(ui,/version:29\.8/);
assert.doesNotMatch(ui,/gettex/i,'active UI must not show gettex anymore');
assert.doesNotMatch(ui,/62–67 regulärer Kauf/,'obsolete 62+ visible buy gate must not return');
assert.doesNotMatch(ui,/56–57 Mikro-Starter/,'obsolete micro band must not be presented as current policy');

// PC fallback remains a pre-score only; Research/Safety creates the final DecisionScore.
assert.match(ui,/pcDeepScore/);assert.match(ui,/pcFallback:true/);assert.match(ui,/PC-Deep-Score/);assert.match(ui,/pc-candidate-fallback-v292\.js/);assert.match(ui,/changelog-v292\.js/);
assert.match(pcFallback,/PC-Finalisten/);assert.match(pcFallback,/PC-Vollscan aktiv/);assert.match(pcFallback,/Deep-Score/);assert.match(pcFallback,/Research\/Safety entscheidet erst danach/);
assert.match(changelog292,/V29\.2 · Score-Pipeline repariert/);assert.match(changelog292,/ersten 1\.000/);assert.match(changelog292,/Deep 240/);

assert.match(entry,/v287-live-ui\.js\?v=20260821-1025/,'worker-first bootstrap must cache-bust current UI');
assert.match(prod,/compact-portfolio-v297-profit-exit\.js/,'production must route through V29.7 outer controller');
assert.match(profit,/compact-portfolio-v296-directional-position\.js/,'V29.7 must preserve V29.6 directional score behavior');
assert.match(directional,/compact-portfolio-v296-score-coherence\.js/,'V29.6 directional wrapper must preserve coherent score stack');
assert.match(dashboard,/tradeRepublicSessionState/);assert.match(dashboard,/decision-score-56-immediate-buy/);assert.match(dashboard,/adaptive-profit-ladder-v29\.7/);assert.match(dashboard,/trade-republic-bestpreis/);assert.match(dashboard,/exactBrokerCatalog!==true/);assert.match(dashboard,/PC_FIRST_FULL_MASTER_STAGED/);
assert.match(wrangler,/"main"\s*:\s*"src\/index-v20\.js"/);

// Keep the underlying V28.7 calibrated-score regression coverage: older scoring parts
// remain inputs, while the outer V29.7 controller defines final trading semantics.
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
 const master=Array.from({length:80},(_,i)=>({symbol:`S${i+1}`,marketCapUSD:1_000_000_000})),entries=[];for(let i=0;i<70;i++){entries.push({symbol:`S${i+1}`,market:'GLOBAL',source:'A',rank:i+1});if(i<30)entries.push({symbol:`S${i+1}`,market:'GLOBAL',source:'B',rank:i+1})};const b=buildBroadLeaderPool(entries,master);assert.equal(b.pool.length,60);const seed={equities:[...b.pool.slice(0,25),{...master[70],forwardWatch:true}]};const a=applyRotatingBreadth(seed,b,{config:{scan_count:1},positions:[]}),c=applyRotatingBreadth(seed,b,{config:{scan_count:2},positions:[]});assert.ok(a.breadthRotationApplied);assert.notDeepEqual(a.equities.map(x=>x.symbol),c.equities.map(x=>x.symbol));
}
console.log('Trade Republic V29.7/V29.8 UI + production wiring regression tests: OK');
