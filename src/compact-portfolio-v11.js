// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.0 keeps the full behavior chain underneath, including
// compact-portfolio-v297-profit-exit.js, V29.6 coherent held scores and V29.9
// large-cap preference.
// New entries are now concentrated on better intraday dips/reclaims instead of
// chasing highs. PC-FIRST momentum5Pct/momentum20Pct/acceleration5Pct are used
// directly. BUY eligibility remains DecisionScore >=56, but the book is capped
// at four simultaneous positions and uses materially more free cash per entry.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v300-daytrade-dips.js';
