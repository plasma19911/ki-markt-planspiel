import assert from 'node:assert/strict';
import {FinalDecisionController} from '../src/final-decision-controller.js';
import {buildConfirmedScaleUpActions} from '../src/profit-optimizer-v2.js';

const planInput=(candidates=[],held=[])=>({messages:[{role:'user',content:`PAPER-TRADING ONLY. JSON-only. Kandidaten=${JSON.stringify(candidates)} Gehalten=${JSON.stringify(held)}`} ]});
const baseWith=actions=>({async run(){return{response:JSON.stringify({summary:'inner',actions})}}});
const run=async({candidates=[],held=[],actions=[],state={config:{cash:10000,start_capital:10000},positions:[],candidates:[]}})=>{
 const c=new FinalDecisionController(baseWith(actions),{getState:()=>state});
 const r=await c.run('fake',planInput(candidates,held));
 return JSON.parse(r.response);
};
const strong=symbol=>({symbol,liveScore:5.4,liveConfidence:.75,day:1.2,intraday5m:.12,intraday20m:.18,momentumAcceleration5:.05,intradayRsi:61,drawdownFrom20mHighPct:-.8,news:.2,eventRisk:'NONE',momentumState:'NORMAL',momentumSellSignal:'NONE'});

{
 const c=strong('ABC');
 const held=[{symbol:'ABC',pnlPct:1.2,invested:2500}];
 const p=await run({candidates:[c],held,actions:[{symbol:'ABC',action:'BUY',confidence:.8,allocation_pct:50,reason:'inner buy'}],state:{config:{cash:7500,start_capital:10000},positions:held,candidates:[]}});
 assert.equal(p.actions.filter(x=>x.symbol==='ABC'&&x.action==='BUY').length,0,'Bestandsposition darf nicht automatisch erneut BUY werden');
 assert.equal(p.actions.filter(x=>x.symbol==='ABC').length,1,'pro Symbol genau eine finale Aktion');
}

{
 const c=strong('SAFE');
 const p=await run({candidates:[c],actions:[{symbol:'SAFE',action:'HOLD',confidence:.8,allocation_pct:0,reason:'TARGET-VENUE-BLOCK: gettex nicht verifiziert'}]});
 assert.equal(p.actions.some(x=>x.symbol==='SAFE'&&x.action==='BUY'),false,'harte innere Safety-HOLDs müssen bindend bleiben');
}

{
 // OTKAR-artiger Fehlerfall: ca. 13 Minuten gehalten, leicht im Minus und mehrere
 // korrelierte Momentumwerte negativ. Allein das Alter darf KEIN SELL freigeben.
 const opened=new Date(Date.now()-13*60_000).toISOString();
 const c={...strong('OTKAR.IS'),intraday5m:-.18,intraday20m:-.22,momentumAcceleration5:-.04,day:-.25,drawdownFrom20mHighPct:-.75,buyerShare:-1,sellerShare:-1};
 const held=[{symbol:'OTKAR.IS',pnlPct:-.65,invested:2199,opened_at:opened}];
 const p=await run({candidates:[c],held,actions:[{symbol:'OTKAR.IS',action:'SELL',confidence:.73,allocation_pct:0,reason:'kurzfristiges Momentum schwach'}],state:{config:{cash:7800,start_capital:10000},positions:held,candidates:[]}});
 assert.equal(p.actions.find(x=>x.symbol==='OTKAR.IS')?.action,'HOLD','13 Minuten plus korrelierte Kurzfrist-Schwäche dürfen keinen Verlustverkauf auslösen');
}

{
 const opened=new Date(Date.now()-40*60_000).toISOString();
 const c={...strong('EXIT'),intraday5m:-.32,intraday20m:-.27,momentumAcceleration5:-.06,day:-1.3,drawdownFrom20mHighPct:-1.8,sellerShare:68};
 const held=[{symbol:'EXIT',pnlPct:-.9,invested:2000,opened_at:opened}];
 const p=await run({candidates:[c],held,actions:[{symbol:'EXIT',action:'SELL',confidence:.76,allocation_pct:0,reason:'SELLER DOMINANCE bestätigt'}],state:{config:{cash:8000,start_capital:10000},positions:held,candidates:[]}});
 assert.equal(p.actions.find(x=>x.symbol==='EXIT')?.action,'SELL','echter Strukturbruch plus Verkäuferdominanz darf Verlustposition schließen');
}

{
 const now=new Date().toISOString(),c={...strong('FRESH'),intraday5m:-.16,intraday20m:-.20,momentumAcceleration5:-.03,day:-.4,drawdownFrom20mHighPct:-.9};
 const held=[{symbol:'FRESH',pnlPct:-.45,invested:1800,opened_at:now}];
 const p=await run({candidates:[c],held,actions:[{symbol:'FRESH',action:'SELL',confidence:.75,allocation_pct:0,reason:'Momentum schwach; REVERSAL nicht bestätigt'}],state:{config:{cash:8200,start_capital:10000},positions:held,candidates:[]}});
 assert.equal(p.actions.find(x=>x.symbol==='FRESH')?.action,'HOLD','frische kleine Verlustposition darf nicht wegen negiertem Reversal-Text sofort verkauft werden');
}

{
 const now=new Date().toISOString(),c={...strong('HARD'),momentumState:'REVERSAL',intraday5m:-.4,intraday20m:-.35,momentumAcceleration5:-.08};
 const held=[{symbol:'HARD',pnlPct:-.3,invested:1500,opened_at:now}];
 const p=await run({candidates:[c],held,actions:[],state:{config:{cash:8500,start_capital:10000},positions:held,candidates:[]}});
 assert.equal(p.actions.find(x=>x.symbol==='HARD')?.action,'SELL','strukturierter echter REVERSAL darf auch frisch sofort als Hard-Exit raus');
}

{
 const c=strong('DUST');
 const p=await run({candidates:[c],actions:[],state:{config:{cash:.02,start_capital:10000},positions:[],candidates:[]}});
 assert.equal(p.actions.some(x=>x.action==='BUY'),false,'Restcent dürfen keinen BUY erzeugen');
}

{
 const c=strong('LOWVOL');
 const p=await run({candidates:[c],actions:[{symbol:'LOWVOL',action:'BUY',confidence:.8,allocation_pct:30,reason:'inner buy'}],state:{config:{cash:10000,start_capital:10000},positions:[],candidates:[{symbol:'LOWVOL',volume_ratio:.2}]}});
 assert.equal(p.actions.some(x=>x.symbol==='LOWVOL'&&x.action==='BUY'),false,'aktuelles Scanner-Volumen desselben Symbols muss die finale BUY-Prüfung erreichen');
}

{
 const scale=buildConfirmedScaleUpActions([{symbol:'ABC',invested:1000}],[strong('ABC')],{cash:5000});
 assert.deepEqual(scale,[],'automatische Aufstockung muss vollständig deaktiviert bleiben');
}

console.log('V26.3 final decision regression tests: OK');
