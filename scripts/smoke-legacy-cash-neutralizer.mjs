import assert from 'node:assert/strict';
import {neutralizeLegacyCashResponse} from '../src/legacy-cash-neutralizer.js';

const forced={response:JSON.stringify({summary:'alt',actions:[{symbol:'BAD.DE',action:'BUY',confidence:.7,allocation_pct:100,reason:'OUTER-FULL-CASH-BEST: bester aktueller Aktienkandidat'}]})};
const forcedPlan=JSON.parse(neutralizeLegacyCashResponse(forced).response);
assert.equal(forcedPlan.actions[0].action,'HOLD','Historischer Best-Available-Zwangskauf muss blockiert werden');
assert.equal(forcedPlan.actions[0].allocation_pct,0);
assert.match(forcedPlan.actions[0].reason,/LEGACY-CASH-BLOCK/);

const inflated={response:JSON.stringify({summary:'alt',actions:[{symbol:'GOOD.DE',action:'BUY',confidence:.8,allocation_pct:100,reason:'echtes Signal · OUTER-FULL-CASH 100.00%'}]})};
const inflatedPlan=JSON.parse(neutralizeLegacyCashResponse(inflated).response);
assert.equal(inflatedPlan.actions[0].action,'BUY');
assert.equal(inflatedPlan.actions[0].allocation_pct,35,'Legacy-Aufblähung darf höchstens 35% überleben, bis der Profit-Optimizer final sized');

const normal={response:JSON.stringify({summary:'neu',actions:[{symbol:'GOOD.DE',action:'BUY',confidence:.8,allocation_pct:22,reason:'PROFIT-OPTIMIZER'}]})};
const normalPlan=JSON.parse(neutralizeLegacyCashResponse(normal).response);
assert.equal(normalPlan.actions[0].allocation_pct,22,'Moderne Positionsgröße darf nicht verändert werden');

console.log(JSON.stringify({ok:true,forcedBlocked:true,legacyCapped:true,modernSizingPreserved:true},null,2));
