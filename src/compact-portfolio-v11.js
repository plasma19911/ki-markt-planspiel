// Production compatibility entry for the PAPER-TRADING planspiel.
// V31.0 runs outermost: expectancy authority for loss containment, trailing winners,
// anti-churn re-entry discipline and economically useful position sizing.
// V30.9 remains underneath for high-score capital deployment; V30.8 for final SELL authority;
// V30.7 dashboard BUY/SELL controls and dynamic allocation; V30.6 anti-churn; V30.5/V30.4 rotation/cash.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v310-expectancy.js';
