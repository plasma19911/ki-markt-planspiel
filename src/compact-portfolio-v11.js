// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.9 runs outermost: high-score capital deployment for underinvested portfolios.
// V30.8 remains underneath: final SELL authority with fresh-position/chart confirmation safeguards.
// V30.7 dashboard BUY/SELL controls plus dynamic allocation up to 100%.
// V30.6 blocks rapid SELL -> BUY churn; V30.5/V30.4 handle opportunity rotation and cash deployment.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v309-capital-deployment.js';
