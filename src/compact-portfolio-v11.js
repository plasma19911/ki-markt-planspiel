// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.5 profit-opportunity controller runs last: hard safety remains fail-closed,
// while strong exactly Trade-Republic-verified opportunities can receive a small
// starter allocation and relative net-opportunity rotation can overcome stale HOLDs.
// Underneath remain V30.4 relative rotation/cash deployment, V30.3 system validation,
// V30.2 live feedback, V30.1 fresh-tape timing and earlier safety/learning layers.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v305-profit-opportunity.js';
