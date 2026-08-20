// Production compatibility entry for the PAPER-TRADING planspiel.
// V28.9 adds directional score hysteresis on top of V28.8 PC-first scanning:
// early small entries for clean fast-rising scores, confirmed normal entries,
// wider HOLD zone and confirmed score-based exits instead of flip-flop thresholds.
// Compatibility chain: compact-portfolio-v289-score-hysteresis.js -> compact-portfolio-v288-pc-first.js ->
// compact-portfolio-v287-calibrated-breadth.js -> compact-portfolio-v286-comprehensive-opportunity.js ->
// compact-portfolio-v282-relative-opportunity.js -> compact-portfolio-v281-research-signal-fusion.js ->
// compact-portfolio-v280-trade-maturity.js -> compact-portfolio-v279-opportunity-learning.js ->
// compact-portfolio-v278-trading-behavior.js -> compact-portfolio-v276-daily-agm.js ->
// compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v289-score-hysteresis.js';
