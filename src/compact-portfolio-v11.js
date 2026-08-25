// Production compatibility entry for the PAPER-TRADING planspiel.
// V31.0 uses ONE outer decision authority for expectancy exits, high-score entries,
// sizing and decision audit. The previous separate V30.8 -> V30.9 -> V31.0 wrapper stack
// is no longer on the production path.
// V30.7 remains as the execution/manual-control base so dashboard trading and anti-churn
// stay available while the outer decision architecture is simplified.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v310-unified.js';
