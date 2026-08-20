// Production compatibility entry for the PAPER-TRADING planspiel.
// V28.8 moves the broad master scan to the Windows PC: rolling full-master pre-scan,
// Top 400, Deep 120, Final 60. Cloudflare keeps final validation, safety, costs and
// paper execution; V28.7 remains the automatic fallback when PC data is stale/offline.
// Compatibility chain: compact-portfolio-v288-pc-first.js -> compact-portfolio-v287-calibrated-breadth.js ->
// compact-portfolio-v286-comprehensive-opportunity.js -> compact-portfolio-v282-relative-opportunity.js ->
// compact-portfolio-v281-research-signal-fusion.js -> compact-portfolio-v280-trade-maturity.js ->
// compact-portfolio-v279-opportunity-learning.js -> compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v288-pc-first.js';
