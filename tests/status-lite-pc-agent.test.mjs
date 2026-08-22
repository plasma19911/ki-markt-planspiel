import assert from 'node:assert/strict';
import {agentStatusLite, shouldServeAgentLite} from '../src/status-lite.js';

const full={
  candidates:[{symbol:'AAA',score:61}],
  positions:[{symbol:'BBB',invested:1000}],
  history:[{symbol:'BBB',action:'KAUF'}],
  researchSignalFusionPolicy:'x'.repeat(5000),
  directionalPositionScorePolicy:'y'.repeat(5000),
  profitExitPolicy:'z'.repeat(5000),
  config:{running:true},
};
const lite=agentStatusLite(full);
assert.deepEqual(Object.keys(lite).sort(),['candidates','history','positions']);
assert.deepEqual(lite.candidates,full.candidates);
assert.deepEqual(lite.positions,full.positions);
assert.deepEqual(lite.history,full.history);
assert.equal('researchSignalFusionPolicy' in lite,false);
assert.equal('directionalPositionScorePolicy' in lite,false);
assert.equal('profitExitPolicy' in lite,false);

const req221={headers:new Headers({'user-agent':'Mozilla/5.0 KI-Markt-Agent/2.2.1'})};
const req220={headers:new Headers({'user-agent':'Mozilla/5.0 KI-Markt-Agent/2.2.0'})};
const browser={headers:new Headers({'user-agent':'Mozilla/5.0 Chrome/151'})};
assert.equal(shouldServeAgentLite(req221),true);
assert.equal(shouldServeAgentLite(req220),false);
assert.equal(shouldServeAgentLite(browser),false);

console.log('status-lite PC-agent regression: OK');
