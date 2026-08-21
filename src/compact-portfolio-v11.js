// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.9 keeps V29.7 adaptive profit exits and the V29.6 coherent held score.
// BUY threshold remains DecisionScore >=56, but company size is now an input to
// that authoritative candidate score: Large-/Mega-Caps are preferred for
// daytrading while Small-/Micro-Caps need stronger intraday signals.
// The PC-first finalist pool is re-ranked toward larger companies and the depot
// is sorted visually from strongest current chance to weakest.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v299-daytrade-largecap.js';
