// Production compatibility entry for the PAPER-TRADING planspiel.
// V21 keeps the complete V20 safety/learning/opportunity stack and rotates only
// expensive Cloudflare 1m confirmation waves so all information sources stay alive.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v21-source-budget.js';
