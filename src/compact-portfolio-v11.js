// Production compatibility entry. V18 keeps the complete modern stack and adds
// execution-reconciled entry learning plus the balanced-adaptive layer.
// The normal Yahoo Spark repair is installed by index.js first; this bounded chart
// fallback is the final rescue only when Spark still fails. It is deliberately small
// so the Windows PC agent remains the broad market scanner.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v18.js';
