// Production compatibility entry for the PAPER-TRADING planspiel.
// V31.0 uses ONE outer decision authority for expectancy exits, high-score entries,
// sizing and decision audit. V31.0.1 adds fail-soft PC-agent scan transport recovery:
// heartbeat/prefetch stay alive even if one internal scan fails, and the concrete
// scan exception becomes visible in /api/status instead of collapsing the full agent minute.
// V30.7 remains as the execution/manual-control base so dashboard trading and anti-churn
// stay available while the outer decision architecture is simplified.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v310-agent-recovery.js';
