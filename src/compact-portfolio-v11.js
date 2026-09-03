// Production compatibility entry for the PAPER-TRADING planspiel.
// V31.7 keeps ONE outer decision authority for entries/exits/sizing/audit.
// V31.7.10 adds fresh-news catalyst confirmation inside that authority.
// V31.7.11 keeps repeated start/reconnect calls from resetting the paper ledger.
// V31.7.12 restores the persistent outcome-learning view immediately after Worker restarts.
// PC-agent fail-soft recovery and paper exploration reconciliation stay active.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v31712-learning-status.js';
