// Production compatibility entry for the PAPER-TRADING planspiel.
// V28.0 keeps V27.9 opportunity learning and adds faster setup recognition
// plus thesis maturity / recovery patience for open stock positions.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v280-trade-maturity.js';
