import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

const session=read('src/gettex-session.js');
const broker=read('src/zero-broker.js');
const fee=read('src/zero-fee-model.js');
const venue=read('src/target-venue-ai-guard.js');
const dashboard=read('src/index-v20.js');
const ui=read('public/v287-live-ui.js');
const legacyBrokerUi=read('public/zero-ui.js');
const onepager=read('public/onepager.html');
const production=read('src/compact-portfolio-v11.js');
const profit=read('src/profit-exit-v297.js');

assert.match(session,/tradeRepublicSessionState/);assert.match(session,/broker:'Trade Republic'/);assert.match(session,/07:30/);assert.match(session,/23:00/);
assert.match(broker,/id:'TRADE_REPUBLIC'/);assert.match(broker,/name:'Trade Republic'/);assert.match(broker,/Bestpreis/);assert.match(broker,/stocksOnly:true/);assert.match(broker,/regularOrderFeeEur/);
assert.match(fee,/broker:'Trade Republic'/);assert.match(fee,/standardOrderFeeEur:1/);assert.match(fee,/TRADE_REPUBLIC_STOCKS_ONLY/);
assert.match(venue,/TARGET-BROKER-SANITY/);assert.match(venue,/offiziellen Trade-Republic Trading Universe/);assert.match(venue,/brokerVerified/);

assert.match(dashboard,/exactBrokerCatalog!==true/,'agent universe must fail closed when broker catalog is not verified');
assert.match(dashboard,/brokerVerified:true/);assert.match(dashboard,/targetBroker:'Trade Republic · Bestpreis'/);assert.match(dashboard,/x-broker-target':'trade-republic-bestpreis/);assert.match(dashboard,/decision-score-56-immediate-buy/);

assert.match(ui,/Trade Republic · Bestpreis/);assert.match(ui,/56\+ SOFORT BUY/);assert.match(ui,/immediateBuyFrom56:true/);assert.doesNotMatch(ui,/gettex/i);assert.doesNotMatch(ui,/62–67 regulärer Kauf/);
assert.match(legacyBrokerUi,/Zieldepot · Trade Republic/);assert.match(legacyBrokerUi,/1 € Abwicklungspauschale/);assert.doesNotMatch(legacyBrokerUi,/finanzen\.net ZERO/i);assert.doesNotMatch(legacyBrokerUi,/gettex/i);assert.doesNotMatch(legacyBrokerUi,/500 € = 0/);
assert.match(onepager,/Trade Republic · Bestpreis/);assert.match(onepager,/nur Aktien/);assert.match(onepager,/1 € Abwicklung/);assert.doesNotMatch(onepager,/finanzen\.net ZERO/i);assert.doesNotMatch(onepager,/gettex/i);assert.doesNotMatch(onepager,/UCITS/i);assert.doesNotMatch(onepager,/normale ETFs/i);

assert.match(production,/compact-portfolio-v297-profit-exit\.js/);assert.match(profit,/minProfitPct:\.8/);assert.match(profit,/profitLockPct:5\.0/);
assert.match(profit,/profit_5_strong_rise/);assert.match(profit,/REENTRY_KEY/);assert.match(profit,/scoreExitKind:'MINUS_15'/);

console.log('V29.8 Trade Republic broker/UI/live-audit regressions: OK');
