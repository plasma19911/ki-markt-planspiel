// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.6 keeps the fixed strategy rules but repairs score mechanics:
// - DecisionScore >=56 => immediate BUY.
// - +10 points from purchase => SELL only when the chart since purchase is positive.
// - -15 points from purchase => SELL only from the directional held-position score.
// - Near-flat score smoothing is time-aware instead of scan-count dependent.
// - Real aligned chart moves may accelerate score changes so genuine breaks are not hidden.
// - The held-position chart uses actual position last_price/entry_price before candidate feeds.
// - Flat/opposite-direction charts cannot open a large score corridor toward a false SELL.
// - Incomplete/stale data is damped inside the score rather than added as a separate soft block.
// - After +10 profit exit: 5-point score pullback before re-entry; after -15 weakness exit:
//   5-point score recovery and at least the normal 56 buy zone before re-entry.
// - Per-symbol held-score audit keeps score/price/limits for later diagnosis.
// V29.5 remains underneath as the normal SELL authority; V29.6 directional position scoring is final.
// V29.2 PC-first breadth remains underneath: full master -> pre-score -> deep score -> finalists.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v296-directional-position.js';
