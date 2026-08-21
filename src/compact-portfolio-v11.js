// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.1 keeps the V30.0 concentrated dip/reclaim book, V29.9 large-cap preference,
// V29.7 adaptive profit exits and V29.6 coherent held scores underneath.
// Underlying behavior chain still includes compact-portfolio-v297-profit-exit.js via
// V30.0/V29.9; V30.1 only adds the outer fresh-tape new-entry timing layer.
// New entries now score quote freshness and the actual PC 1m/5m signal coverage,
// reward clean retests/early continuation and penalize stale, missing or weak tape.
// BUY eligibility remains one authoritative threshold: DecisionScore >=56.
// Max four simultaneous positions and concentrated cash deployment remain active.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v301-daytrade-entry.js';
