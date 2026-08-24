// Production compatibility entry for the PAPER-TRADING planspiel.
// V30.6 runs last and blocks rapid SELL -> BUY churn of the same symbol.
// V30.5 profit-opportunity remains directly underneath; hard safety stays fail-closed.
// Underneath remain V30.4 relative rotation/cash deployment, V30.3 system validation,
// V30.2 live feedback, V30.1 fresh-tape timing and earlier safety/learning layers.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v306-anti-churn.js';
