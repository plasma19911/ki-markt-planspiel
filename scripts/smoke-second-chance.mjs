import assert from 'node:assert/strict';
import {evaluateSecondChance,evaluateQualifiedBest} from '../src/profit-optimizer-v2.js';

const eslt={symbol:'ESLT',score:6.09,confidence:.77,day_change:.40,news_score:.04,eventRisk:'NONE',momentum5:.15,momentum20:.32,momentumAcceleration5:.04,drawdownFrom20mHighPct:-.05,rsi:62,volumeRatio:1.20,momentumBreakoutScore:1.1,momentumState:'BUILDING',momentumSellSignal:'NONE',pro:['EMA9 über EMA21','Kurs über EMA21'],contra:[]};
const good=evaluateSecondChance(eslt,null);
assert.equal(good.confirmed,true,'ESLT-artiges starkes Near-High-Setup soll eine bestaetigte zweite Chance bekommen');
assert.ok(good.expected>=6.2,'Gelockerte Second-Chance braucht weiterhin positiven Mindest-Erwartungswert');

const solid={symbol:'SOLID.DE',score:3.75,confidence:.72,day_change:1.1,news_score:.08,eventRisk:'NONE',momentum5:.08,momentum20:.22,momentumAcceleration5:.02,drawdownFrom20mHighPct:-.55,rsi:61,volumeRatio:1.05,momentumBreakoutScore:.5,momentumState:'BUILDING',momentumSellSignal:'NONE',pro:['EMA9 über EMA21','Kurs über EMA21'],contra:[]};
const qualified=evaluateQualifiedBest(solid,null);
assert.equal(qualified.confirmed,true,'Solides mehrfach bestaetigtes Setup soll jetzt als kleine BEST-QUALIFIED-Probe erlaubt sein');
assert.ok(qualified.expected>=5.35,'BEST-QUALIFIED braucht weiterhin Mindest-Erwartungswert');

assert.equal(evaluateSecondChance({...eslt,day_change:8.2,rsi:80},null).confirmed,false,'Spaete/ueberhitzte Gainer duerfen nicht durch Second-Chance gekauft werden');
assert.equal(evaluateSecondChance({...eslt,momentumState:'REVERSAL',momentumSellSignal:'STRONG'},null).confirmed,false,'Reversal bleibt blockiert');
assert.equal(evaluateSecondChance({...eslt,eventRisk:'HIGH'},null).confirmed,false,'HIGH-Eventrisiko bleibt blockiert');
assert.equal(evaluateSecondChance({...eslt,symbol:'BAD.V'},null).confirmed,false,'Venture-/OTC-artige Symbole bleiben blockiert');
assert.equal(evaluateQualifiedBest({...solid,momentum5:-.18,momentum20:-.35,momentumAcceleration5:-.12},null).confirmed,false,'Fallendes schwaches Tape darf nicht als bestes verfuegbares Setup erzwungen werden');
assert.equal(evaluateQualifiedBest({...solid,eventRisk:'HIGH'},null).confirmed,false,'BEST-QUALIFIED darf HIGH-Eventrisiko nicht umgehen');
assert.equal(evaluateQualifiedBest({...solid,symbol:'BAD.V'},null).confirmed,false,'BEST-QUALIFIED darf Zielboersen-Sperre nicht umgehen');

console.log(JSON.stringify({ok:true,eslt:good,qualifiedBest:qualified,lateChaseBlocked:true,reversalBlocked:true,eventBlocked:true,venueBlocked:true,weakTapeBlocked:true},null,2));
