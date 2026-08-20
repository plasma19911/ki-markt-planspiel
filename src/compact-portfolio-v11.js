// Production compatibility entry for the PAPER-TRADING planspiel.
// V22 keeps the complete safety/learning/opportunity stack. The small V27.6
// daily-AGM wrapper only exposes the correct once-daily calendar policy in status.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v276-daily-agm.js';
