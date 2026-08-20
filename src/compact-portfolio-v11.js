// Production compatibility entry for the PAPER-TRADING planspiel.
// V27.7 keeps the full audited safety/learning/AGM stack and adds the outer
// trading-behavior layer for confirmation, anti-FOMO and profit patience.
// Compatibility chain: compact-portfolio-v277-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v277-trading-behavior.js';
