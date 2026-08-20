// Production compatibility entry for the PAPER-TRADING planspiel.
// V28.7 recalibrates buy/hold/sell scoring and rotates a broader Top-60 leader pool
// through the same expensive per-minute deep slice, so breadth improves without
// multiplying Cloudflare fetch load.
// Compatibility chain: compact-portfolio-v287-calibrated-breadth.js ->
// compact-portfolio-v286-comprehensive-opportunity.js -> compact-portfolio-v282-relative-opportunity.js ->
// compact-portfolio-v281-research-signal-fusion.js -> compact-portfolio-v280-trade-maturity.js ->
// compact-portfolio-v279-opportunity-learning.js -> compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v287-calibrated-breadth.js';
