// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.8 runs outermost: final SELL authority and immediate severe-weakness exits.
// V30.7 remains underneath: dashboard BUY/SELL controls plus dynamic allocation up to 100%.
// V30.6 blocks rapid SELL -> BUY churn; V30.5/V30.4 handle opportunity rotation and cash deployment.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v308-sell-authority.js';
