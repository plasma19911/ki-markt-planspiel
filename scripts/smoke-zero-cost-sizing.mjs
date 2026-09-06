import assert from 'node:assert/strict';
import {applyExecutionCostDiscipline} from '../src/execution-cost-overlay.js';

const action={symbol:'TEST',action:'BUY',confidence:.8,allocation_pct:20,reason:'test'};
const fast={actions:[action],context:[]};

const thousand=applyExecutionCostDiscipline(fast,'Cash 1000 EUR; Slippage 0.10%. Kandidaten=[{"symbol":"TEST","type":"EQUITY"}] Gehalten=[]');
assert.equal(thousand.actions.length,1,'1000 EUR Cash / 20% Position darf nicht allein durch unrealistische Doppelgebuehr blockiert werden');
assert.ok(thousand.executionCost.bySymbol.TEST.estimatedRoundTripCostPct<2);
assert.equal(thousand.actions[0].allocation_pct,20,'Fixkosten-Warnung darf die Order nicht verkleinern und dadurch die Kostenquote verschlechtern');
assert.match(thousand.actions[0].reason,/Trade-Republic-Roundtrip-Kosten.*Kostenwarnung/);

const hundred=applyExecutionCostDiscipline(fast,'Cash 100 EUR; Slippage 0.10%. Kandidaten=[{"symbol":"TEST","type":"EQUITY"}] Gehalten=[]');
assert.equal(hundred.actions.length,0,'100 EUR Cash / 20% Position bleibt wegen hoher Kostenquote blockiert');

const idleFast={actions:[{...action,allocation_pct:16}],context:[],evidenceDiversity:{idlePortfolio:true}};
const idleSized=applyExecutionCostDiscipline(idleFast,'Cash 1000 EUR; Slippage 0.10%. Kandidaten=[{"symbol":"TEST","type":"EQUITY","price":100}] Gehalten=[]');
assert.equal(idleSized.actions.length,1,'Erster qualifizierter Kauf im leeren 1000-EUR-Depot soll nicht an einer zu kleinen Mischorder scheitern');
assert.ok(idleSized.actions[0].allocation_pct>=20&&idleSized.actions[0].allocation_pct<=20.2,'Einzelner Ersteinstieg wird nur bis zur naechsten kosten-effizienten Ganzaktiengroesse angehoben');
assert.ok(idleSized.executionCost.bySymbol.TEST.estimatedRoundTripCostPct<2,'Ganzaktien-Ersteinstieg muss inklusive 2 EUR Roundtrip-Gebuehren unter dem Hard-Cap liegen');
assert.equal(idleSized.executionCost.bySymbol.TEST.initialSizingFloorApplied,true);
assert.equal(idleSized.actions[0].costEfficientSizingV3174,true);

console.log(JSON.stringify({ok:true,thousand:thousand.executionCost.bySymbol.TEST,hundred:hundred.executionCost.bySymbol.TEST,idleSized:idleSized.executionCost.bySymbol.TEST},null,2));
