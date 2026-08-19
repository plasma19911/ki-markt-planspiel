// Production compatibility entry for the PAPER-TRADING planspiel.
// V20 keeps the complete V19 safety/learning stack and adds the paper-only
// Opportunity/Continuation layer so confirmed good setups are not missed just
// because they are not perfect dips. No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v20-paper.js';
