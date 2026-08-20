// Production compatibility entry for the PAPER-TRADING planspiel.
// V28.1 keeps V28.0 trade maturity and adds research-backed weighted signal fusion
// so strong stock opportunities are not blocked by too many soft rules.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v281-research-signal-fusion.js';
