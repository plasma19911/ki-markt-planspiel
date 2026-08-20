// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.1 makes one canonical score scale authoritative over older V28.x soft thresholds.
// Entry: 50-52 watch, 53-55 scout, 56-57 micro, 58-61 early, 62+ regular.
// Position: 62+ strong hold, 58-61 hold, 53-57 hold/watch, 50-52 caution,
// 46-49 sell-watch, <=45 confirmed exit, <=32 urgent score exit after minimum age.
// Dynamic profit locking remains separate and can realize winners at still-high hold scores
// when peak giveback, score direction and momentum jointly confirm exhaustion.
// Compatibility chain: compact-portfolio-v290-entry-profit.js -> compact-portfolio-v289-score-hysteresis.js ->
// compact-portfolio-v288-pc-first.js -> compact-portfolio-v287-calibrated-breadth.js ->
// compact-portfolio-v286-comprehensive-opportunity.js -> compact-portfolio-v282-relative-opportunity.js ->
// compact-portfolio-v281-research-signal-fusion.js -> compact-portfolio-v280-trade-maturity.js ->
// compact-portfolio-v279-opportunity-learning.js -> compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v290-entry-profit.js';
