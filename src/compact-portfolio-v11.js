// Production compatibility entry for the PAPER-TRADING planspiel.
// V28.2 keeps V28.1 research fusion and adds pairwise opportunity-cost learning.
// Compatibility chain: compact-portfolio-v282-relative-opportunity.js ->
// compact-portfolio-v281-research-signal-fusion.js -> compact-portfolio-v280-trade-maturity.js ->
// compact-portfolio-v279-opportunity-learning.js -> compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v282-relative-opportunity.js';
