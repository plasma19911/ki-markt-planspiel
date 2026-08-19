import assert from 'node:assert/strict';
import {adaptivePlanCooldownMs,aiCadenceContext} from '../src/adaptive-ai-cadence.js';

const prompt=(cash,candidates,held=[])=>`Paper-Depot · Cash ${cash} · Kandidaten=${JSON.stringify(candidates)} Gehalten=${JSON.stringify(held)}`;
const strong={symbol:'DIP.DE',score:5.4,confidence:.75,day_change:-2.1,eventRisk:'NONE',momentumSellSignal:'NONE'};
const highChase={symbol:'CHASE',score:7,confidence:.9,day_change:12,eventRisk:'NONE',momentumSellSignal:'NONE'};

const highCash=prompt(8400,[strong],[{symbol:'OLD',invested:1300}]);
assert.equal(adaptivePlanCooldownMs(highCash,600000),180000,'86% Cash + starker kontrollierter Kandidat muss Voll-KI nach 3 Minuten erneut zulassen');
assert.ok(aiCadenceContext(highCash).cashShare>.8);

const mediumCash=prompt(4000,[strong],[{symbol:'OLD',invested:6000}]);
assert.equal(adaptivePlanCooldownMs(mediumCash,600000),300000,'40% Cash + starker Kandidat soll 5-Minuten-Kadenz nutzen');

const lowCash=prompt(1500,[strong],[{symbol:'OLD',invested:8500}]);
assert.equal(adaptivePlanCooldownMs(lowCash,600000),600000,'Bei bereits gut investiertem Depot bleibt 10-Minuten-Basisfenster');

const chaseOnly=prompt(9000,[highChase],[{symbol:'OLD',invested:1000}]);
assert.equal(adaptivePlanCooldownMs(chaseOnly,600000),600000,'Hoher Cash-Anteil darf High-Chase nicht als Grund fuer mehr Voll-KI-Aufrufe verwenden');

const hardEvent=prompt(9000,[{...strong,eventRisk:'HIGH'}],[{symbol:'OLD',invested:1000}]);
assert.equal(adaptivePlanCooldownMs(hardEvent,600000),600000,'HIGH Event-Risk darf die adaptive KI-Kadenz nicht beschleunigen');

console.log(JSON.stringify({ok:true,highCashMinutes:3,mediumCashMinutes:5,normalMinutes:10,noForcedBuy:true,highChaseDoesNotAccelerate:true},null,2));
