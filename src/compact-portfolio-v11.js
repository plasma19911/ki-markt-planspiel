// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.5 keeps V29.4 chart-anchored position scoring and makes the +10/-15 rule authoritative.
// For held positions, old nested profit/trend/rotation/position SELL decisions are overridden.
// A normal SELL is allowed only when V29.4 confirms +10 DecisionScore points from purchase
// or -15 DecisionScore points from purchase.
// V29.4 keeps the purchase score as the position baseline, freezes partial scores, and
// constrains score movement when the actual chart is nearly flat.
// V29.3 remains underneath for the stabilized candidate DecisionScore and immediate BUY >=56.
// V29.2 PC-first breadth remains underneath: full master -> pre-score -> deep score -> finalists.
// Compatibility chain: compact-portfolio-v295-score-exit-authority.js -> compact-portfolio-v294-score-entry-exit.js ->
// compact-portfolio-v293-immediate-buy.js -> compact-portfolio-v290-entry-profit.js ->
// compact-portfolio-v289-score-hysteresis.js -> compact-portfolio-v288-pc-first.js ->
// compact-portfolio-v287-calibrated-breadth.js -> compact-portfolio-v286-comprehensive-opportunity.js ->
// compact-portfolio-v282-relative-opportunity.js -> compact-portfolio-v281-research-signal-fusion.js ->
// compact-portfolio-v280-trade-maturity.js -> compact-portfolio-v279-opportunity-learning.js ->
// compact-portfolio-v278-trading-behavior.js -> compact-portfolio-v276-daily-agm.js ->
// compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v295-score-exit-authority.js';
