// Production compatibility entry for the PAPER-TRADING planspiel.
// V31.7 keeps ONE outer decision authority for entries/exits/sizing/audit.
// V31.7.10 adds a fresh-news catalyst proposal layer INSIDE that authority:
// news can enrich/guard a proposal, but cannot bypass broker, quote, cost,
// canonical-score, learning, re-entry or execution safety.
// PC-agent fail-soft recovery and paper exploration reconciliation stay active.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v31710-news-catalyst.js';
