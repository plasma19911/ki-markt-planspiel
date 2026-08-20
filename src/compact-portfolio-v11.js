// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.0 adds earlier staged entries and dynamic profit locking on top of V28.9/V28.8:
// 60-64 scout only on exceptional score acceleration, 65-67 micro, 68-71 early,
// 72+ regular entry; profitable winners may exit at still-high hold scores when peak,
// score direction and momentum jointly confirm exhaustion.
// Compatibility chain: compact-portfolio-v290-entry-profit.js -> compact-portfolio-v289-score-hysteresis.js ->
// compact-portfolio-v288-pc-first.js -> compact-portfolio-v287-calibrated-breadth.js ->
// compact-portfolio-v286-comprehensive-opportunity.js -> compact-portfolio-v282-relative-opportunity.js ->
// compact-portfolio-v281-research-signal-fusion.js -> compact-portfolio-v280-trade-maturity.js ->
// compact-portfolio-v279-opportunity-learning.js -> compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v290-entry-profit.js';
