// Production compatibility entry for the PAPER-TRADING planspiel.
// V27.8 keeps the full audited safety/learning/AGM stack and adds adaptive
// entry confirmation, held-BUY prompt suppression and repeated soft-SELL confirmation.
// Compatibility chain: compact-portfolio-v278-trading-behavior.js ->
// compact-portfolio-v276-daily-agm.js -> compact-portfolio-v22-active-learning.js.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v278-trading-behavior.js';
