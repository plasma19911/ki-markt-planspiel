import assert from 'node:assert/strict';
import {decideCandidateBehaviorV289,decidePositionBehaviorV289,SCORE_BEHAVIOR_V289} from '../src/score-hysteresis-v289.js';

const now=Date.parse('2026-08-20T19:00:00Z');
const h=(score,min=1)=>[{at:now-min*60_000,score}];

let x=decideCandidateBehaviorV289({buyScore:85,coverage:.9,hardBlocked:false,overextended:false},[],now);
assert.equal(x.action,'BUY','außergewöhnlich hoher sauberer Score darf ohne unnötige Verzögerung kaufen');

x=decideCandidateBehaviorV289({buyScore:77,coverage:.9,hardBlocked:false,overextended:false},h(75),now);
assert.equal(x.action,'BUY','76+ über mehrere Scans bestätigt ist kaufbereit');

x=decideCandidateBehaviorV289({buyScore:72,coverage:.9,hardBlocked:false,overextended:false},h(65),now);
assert.equal(x.action,'BUY_EARLY','stark steigender Score darf ab 72 einen kleinen frühen Einstieg auslösen');

x=decideCandidateBehaviorV289({buyScore:72,coverage:.9,hardBlocked:false,overextended:false},[],now);
assert.equal(x.action,'WAIT','72 ohne Richtung/Bestätigung darf nicht blind gekauft werden');

x=decideCandidateBehaviorV289({buyScore:88,coverage:.9,hardBlocked:false,overextended:true,reclaim:false},h(84),now);
assert.equal(x.action,'WAIT','Überdehnung muss trotz hohem Score auf Reclaim/Abkühlung warten');

x=decideCandidateBehaviorV289({buyScore:90,coverage:.9,hardBlocked:true,overextended:false},h(85),now);
assert.equal(x.action,'AVOID','Hard-Block darf niemals vom Score überstimmt werden');

let p=decidePositionBehaviorV289({holdScore:48,coverage:.9,partial:false},h(46),{opened_at:'2026-08-20T18:20:00Z'},now);
assert.equal(p.action,'HOLD','mittlerer Score mit Erholung bleibt HOLD');

p=decidePositionBehaviorV289({holdScore:42,coverage:.9,partial:false},h(48),{opened_at:'2026-08-20T18:20:00Z'},now);
assert.equal(p.action,'SELL','42 oder tiefer plus starker Fall nach Reifezeit soll verkaufen');

p=decidePositionBehaviorV289({holdScore:28,coverage:.9,partial:false},h(20),{opened_at:'2026-08-20T18:20:00Z'},now);
assert.equal(p.action,'HOLD','sehr niedriger Score mit starker Erholung darf nicht am Boden verkauft werden');

p=decidePositionBehaviorV289({holdScore:20,coverage:.34,partial:true},h(25),{opened_at:'2026-08-20T18:00:00Z'},now);
assert.equal(p.action,'HOLD','Teilscore allein darf niemals automatisch verkaufen');

p=decidePositionBehaviorV289({holdScore:47,coverage:.9,partial:false},h(54),{opened_at:'2026-08-20T18:15:00Z'},now);
assert.equal(p.action,'SELL_WATCH','43–47 ohne bestätigten Bruch bleibt Verkauf-Watch statt vorschnellem SELL');

assert.ok(SCORE_BEHAVIOR_V289.candidate.confirmedBuy>SCORE_BEHAVIOR_V289.position.hold,'Einstiegsschwelle muss deutlich über Halteschwelle liegen');
assert.ok(SCORE_BEHAVIOR_V289.position.caution>SCORE_BEHAVIOR_V289.position.confirmedExit,'zwischen Halten und Verkaufen braucht es eine Hysteresezone');

console.log('V28.9 score hysteresis regression tests: OK');
