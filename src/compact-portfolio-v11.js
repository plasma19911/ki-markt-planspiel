// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.4 keeps V29.3 immediate BUY >=56 and fixes held-position score continuity.
// The score at purchase is retained as the position baseline. A held symbol may no longer
// jump onto a partial/legacy score scale when it leaves the candidate list after purchase.
// Position score movement is anchored to real chart movement: a nearly flat chart permits
// only a small score change. Partial chart data freezes the held score instead of collapsing it.
// Exit rule: +10 DecisionScore points from purchase => SELL; -15 points => SELL.
// V29.3 remains underneath for the stabilized candidate DecisionScore and immediate BUY >=56.
// V29.2 PC-first breadth remains underneath: full master -> pre-score -> deep score -> finalists.
// Compatibility chain: compact-portfolio-v294-score-entry-exit.js -> compact-portfolio-v293-immediate-buy.js ->
// compact-portfolio-v290-entry-profit.js -> compact-portfolio-v289-score-hysteresis.js ->
// compact-portfolio-v288-pc-first.js -> compact-portfolio-v287-calibrated-breadth.js ->
// compact-portfolio-v286-comprehensive-opportunity.js -> compact-portfolio-v282-relative-opportunity.js ->
// compact-portfolio-v281-research-signal-fusion.js -> compact-portfolio-v280-trade-maturity.js ->
// compact-portfolio-v279-opportunity-learning.js -> compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v294-score-entry-exit.js';
