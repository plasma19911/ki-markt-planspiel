import assert from 'node:assert/strict';
import {FinalDecisionController} from '../src/final-decision-controller.js';
import {sanitizeBugContaminatedLearning,isKnownBugHistoryRow} from '../src/learning-quarantine.js';

const planInput=(candidates=[],held=[])=>({messages:[{role:'user',content:`PAPER-TRADING ONLY. JSON-only. Kandidaten=${JSON.stringify(candidates)} Gehalten=${JSON.stringify(held)}`}]});
const baseWith=actions=>({async run(){return{response:JSON.stringify({summary:'inner',actions})}}});
const run=async({candidates=[],held=[],actions=[],history=[],cash=5000})=>{
 const state={config:{cash,start_capital:10000,currency:'EUR'},positions:held,candidates,history};
 const c=new FinalDecisionController(baseWith(actions),{getState:()=>state,getLearning:()=>({buckets:[]})});
 return JSON.parse((await c.run('fake',planInput(candidates,held))).response);
};
const candidate=(symbol,extra={})=>({symbol,liveScore:5.55,liveConfidence:.63,day:2.1,intraday5m:.46,intraday20m:2.57,momentumAcceleration5:.26,intradayRsi:65,drawdownFrom20mHighPct:-.7,news:.1,eventRisk:'NONE',eventText:'',momentumState:'NORMAL',momentumSellSignal:'NONE',volumeRatio:1.25,...extra});

{
 const symbol='GUBRA.CO',c=candidate(symbol,{momentumState:'REVERSAL',intraday5m:-.12,intraday20m:-.24,momentumAcceleration5:-.04,sellerShare:58});
 const held=[{symbol,pnlPct:-.33,invested:1267,opened_at:new Date(Date.now()-18*60000).toISOString()}];
 const reason='ADAPTIVE EXIT-HOLD: Rückblick zeigt zuletzt zu frühe Verkäufe. Verkäuferstruktur ist noch nicht stark genug · Exit-Qualität 6.1/4.2 · Verkäufer-Vorsprung 8%/14%. Gewinner/Position weiter beobachten statt zu früh schließen.';
 const p=await run({candidates:[c],held,actions:[{symbol,action:'SELL',confidence:.84,allocation_pct:0,reason}]});
 const a=p.actions.find(x=>x.symbol===symbol);
 assert.equal(a?.action,'HOLD','explizites EXIT-HOLD darf nicht durch bloßes REVERSAL-Flag zum HARD EXIT werden');
 assert.match(a?.reason||'',/EXIT-HOLD V27\.1/);
}

{
 const symbol='GUBRA.CO',sellAt=new Date(Date.now()-10*60000).toISOString(),buyAt=new Date(Date.now()-28*60000).toISOString();
 const history=[
  {action:'KAUF',symbol,ts:buyAt,reason:'KI BUY 63%: FINAL-CONTROLLER V26.1 BUY EARLY_BREAKOUT'},
  {action:'VERKAUF',symbol,ts:sellAt,trade_pnl:-5.18,reason:'KI SELL 84%: FINAL-CONTROLLER HARD EXIT: strukturierter harter Risikoauslöser bestätigt · ADAPTIVE EXIT-HOLD: Verkäuferstruktur ist noch nicht stark genug · weiter beobachten statt zu früh schließen.'}
 ];
 const p=await run({candidates:[candidate(symbol)],history,actions:[]});
 assert.equal(p.actions.some(x=>x.symbol===symbol&&x.action==='BUY'),false,'10 Minuten nach Verlust-Sell darf derselbe EARLY_BREAKOUT nicht wieder gekauft werden');
 assert.match(p.summary,/Flip-Flop-Reentry\(s\) blockiert/);
}

{
 const symbol='RECLAIM.DE',sellAt=new Date(Date.now()-32*60000).toISOString(),buyAt=new Date(Date.now()-60*60000).toISOString();
 const history=[
  {action:'KAUF',symbol,ts:buyAt,reason:'normaler Kauf'},
  {action:'VERKAUF',symbol,ts:sellAt,trade_pnl:-12,reason:'THESIS-INVALIDATION EXIT: Verkäuferdominanz bestätigt'}
 ];
 const reclaim=candidate(symbol,{day:1.2,intraday5m:.09,intraday20m:.22,momentumAcceleration5:.06,intradayRsi:61,drawdownFrom20mHighPct:-.85});
 const p=await run({candidates:[reclaim],history,actions:[]});
 const buy=p.actions.find(x=>x.symbol===symbol&&x.action==='BUY');
 assert.ok(buy,'nach ausreichendem Abstand darf eine echte neue Pullback/Reclaim-These wieder kaufbar sein');
 assert.match(buy.reason,/PULLBACK_RECLAIM/);
 assert.match(buy.reason,/Reentry nach/);
}

{
 const badReason='KI SELL 84%: FINAL-CONTROLLER HARD EXIT: strukturierter harter Risikoauslöser bestätigt · ADAPTIVE EXIT-HOLD: Verkäuferstruktur ist noch nicht stark genug · weiter beobachten statt zu früh schließen.';
 assert.equal(isKnownBugHistoryRow({action:'VERKAUF',symbol:'GUBRA.CO',reason:badReason}),true,'widersprüchlicher GUBRA-artiger Sell muss als Codefehler quarantänisiert werden');
 const buy1=new Date(Date.now()-50*60000).toISOString(),sell=new Date(Date.now()-30*60000).toISOString(),buy2=new Date(Date.now()-20*60000).toISOString();
 const data=new Map([
  ['state/trade-decision-learning-v1',{seen:{},samples:[{id:'first',kind:'TRADE',symbol:'GUBRA.CO',buyAt:buy1,sellAt:sell},{id:'second',kind:'TRADE',symbol:'GUBRA.CO',buyAt:buy2,sellAt:null}]}],
  ['state/zero-live-signal-learning-v1',{learningEpoch:'V27_CLEAN_2026-08-20',timedCompleted:0,recentTiming:[],timingStats:{},open:{'GUBRA.CO':{openedAt:Date.parse(buy2)}},pending:{}}]
 ]);
 const storage={kv:{get:k=>data.get(k),put:(k,v)=>data.set(k,v)}};
 const history=[
  {action:'KAUF',symbol:'GUBRA.CO',ts:buy1,reason:'normaler erster Kauf'},
  {action:'VERKAUF',symbol:'GUBRA.CO',ts:sell,trade_pnl:-5.18,reason:badReason},
  {action:'KAUF',symbol:'GUBRA.CO',ts:buy2,reason:'sofortiger Wiederkauf'}
 ];
 const q=sanitizeBugContaminatedLearning(storage,history);
 assert.ok(q.knownBugTradeWindows>=2,'Bug-Sell und direkter Reentry müssen beide als kontaminierte Fenster erkannt werden');
 assert.equal(data.get('state/trade-decision-learning-v1').samples.length,0,'beide GUBRA-Lernproben müssen aus der aktiven Lernbasis entfernt werden');
 assert.equal(Boolean(data.get('state/zero-live-signal-learning-v1').open['GUBRA.CO']),false,'direkter Reentry nach Bug-Sell darf nicht als aktives Live-Lernsample bleiben');
}

console.log('V27.1 anti-flip-flop regression tests: OK');
