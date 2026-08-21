// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.2 keeps V30.1 fresh-tape timing, V30.0 concentrated dip/reclaim entries,
// V29.9 large-cap preference, V29.7 adaptive profit exits and V29.6 coherent held scores.
// Underlying behavior chain still includes compact-portfolio-v297-profit-exit.js.
// Live Paper-Trade feedback now adds an extra HIGH_CHASE score penalty, caps each
// new position at 25% of scan-start cash, keeps max four positions, and repairs
// the held entry baseline to the final DecisionScore that actually triggered BUY.
// BUY eligibility remains one authoritative threshold: DecisionScore >=56.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v302-live-feedback.js';
