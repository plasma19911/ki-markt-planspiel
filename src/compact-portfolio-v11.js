// Production compatibility entry for the PAPER-TRADING planspiel.
// V22 keeps the complete V21 safety/learning/opportunity stack and adds the
// outer active-learning cash layer so soft HOLDs do not starve replay learning.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v22-active-learning.js';
