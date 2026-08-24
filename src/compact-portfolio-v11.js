// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.3 remains the system/runtime validation baseline.
// V30.4 relative rotation runs on top: weak held positions may be replaced by a
// clearly stronger, exactly Trade-Republic-verified candidate, and four qualified
// fresh BUYs target 98% deployment while retaining the 25% single-position cap.
// Underneath remain V30.2 live feedback, V30.1 fresh-tape timing, V30.0 dip/reclaim,
// V29.9 large-cap preference, V29.7 adaptive profit exits and V29.6 held-score coherence.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v304-relative-rotation.js';
