// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.3 keeps the complete V30.2 live-feedback daytrade strategy underneath:
// V30.1 fresh-tape timing, V30.0 dip/reclaim entries, V29.9 large-cap preference,
// V29.7 adaptive profit exits and V29.6 coherent held scores.
// Underlying behavior chain still includes compact-portfolio-v297-profit-exit.js.
// V30.3 adds the corrected Trade-Republic holiday calendar and makes the critical
// stocks-only accounting, target-venue and free-tier checks merge-blocking.
// BUY eligibility remains one authoritative threshold: DecisionScore >=56.
// Max four positions, max 25% new-position sizing and V30.2 HIGH_CHASE protection remain active.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v303-system-validation.js';
