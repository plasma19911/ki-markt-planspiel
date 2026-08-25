// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.7 runs outermost: dashboard BUY/SELL nudges plus dynamic allocation up to 100%.
// V30.6 remains directly underneath and blocks rapid SELL -> BUY churn of the same symbol.
// V30.5 profit-opportunity and V30.4 rotation/cash deployment remain active below it.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v307-manual-control.js';
