// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.3 makes one stabilized 0-100 DecisionScore authoritative for both UI and trading.
// New positions: DecisionScore >=56 => immediate BUY. No additional soft buy blocker
// (momentum/news/FOMO/coverage/trend/multi-scan) may veto a score that already reached 56.
// Large raw-score discontinuities are damped so a source/tick change cannot normally make
// a visible 72 -> 36 jump in one decision. Raw score remains available for diagnostics.
// V29.2 PC-first breadth remains underneath: full master -> pre-score -> deep score -> finalists.
// Existing position/profit logic remains underneath V29.3 and still manages held positions.
// Compatibility chain: compact-portfolio-v293-immediate-buy.js -> compact-portfolio-v290-entry-profit.js ->
// compact-portfolio-v289-score-hysteresis.js -> compact-portfolio-v288-pc-first.js ->
// compact-portfolio-v287-calibrated-breadth.js -> compact-portfolio-v286-comprehensive-opportunity.js ->
// compact-portfolio-v282-relative-opportunity.js -> compact-portfolio-v281-research-signal-fusion.js ->
// compact-portfolio-v280-trade-maturity.js -> compact-portfolio-v279-opportunity-learning.js ->
// compact-portfolio-v278-trading-behavior.js -> compact-portfolio-v276-daily-agm.js ->
// compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v293-immediate-buy.js';
