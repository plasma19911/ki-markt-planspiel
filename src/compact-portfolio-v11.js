// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.6 keeps the fixed strategy rules but repairs score mechanics:
// - DecisionScore >=56 => immediate BUY.
// - +10 points from purchase => SELL only when the chart since purchase is positive.
// - -15 points from purchase => SELL.
// - Score smoothing is time-aware instead of scan-count dependent.
// - Incomplete/stale data is damped inside the score rather than added as a separate soft block.
// - After a score exit the same symbol must reset below 56 once before a new >=56 can re-enter,
//   preventing deterministic SELL -> immediate BUY fee churn.
// V29.5 remains underneath as the normal SELL authority, now with structured V29.4 authorization.
// V29.4 keeps purchase-score continuity and chart anchoring for held positions.
// V29.2 PC-first breadth remains underneath: full master -> pre-score -> deep score -> finalists.
// Compatibility chain: compact-portfolio-v296-score-coherence.js -> compact-portfolio-v295-score-exit-authority.js ->
// compact-portfolio-v294-score-entry-exit.js -> compact-portfolio-v293-immediate-buy.js ->
// compact-portfolio-v290-entry-profit.js -> compact-portfolio-v289-score-hysteresis.js ->
// compact-portfolio-v288-pc-first.js -> compact-portfolio-v287-calibrated-breadth.js ->
// compact-portfolio-v286-comprehensive-opportunity.js -> compact-portfolio-v282-relative-opportunity.js ->
// compact-portfolio-v281-research-signal-fusion.js -> compact-portfolio-v280-trade-maturity.js ->
// compact-portfolio-v279-opportunity-learning.js -> compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v296-score-coherence.js';
