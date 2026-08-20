// Production compatibility entry for the PAPER-TRADING planspiel.
// V27.9 keeps the full audited safety/learning/AGM/V27.8 discipline stack and adds
// fresh-news opportunity awareness plus missed-opportunity learning.
// Compatibility chain: compact-portfolio-v279-opportunity-learning.js ->
// compact-portfolio-v278-trading-behavior.js -> compact-portfolio-v276-daily-agm.js ->
// compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v279-opportunity-learning.js';
