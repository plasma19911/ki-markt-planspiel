// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.7 keeps the V29.6 score-stability and DATAPATTNS directional-position repairs.
// Entry remains simple: DecisionScore >=56 => immediate BUY.
// Profit exits are now adaptive to real chart profit:
// - below +0.8% => HOLD on the normal profit side.
// - from +0.8% => SELL after +10 score points (less if the entry score is already very high).
// - from +2.0% => SELL after +7 score points.
// - from +3.5% => SELL after +4 score points.
// - from +5.0% => secure profit unless score and chart are still rising strongly together.
// High entry scores use an attainable target up to score 99 instead of an impossible fixed +10.
// The V29.6 directional -15 weakness exit remains separate and requires a genuinely negative chart.
// Per-symbol held-score/profit audit remains available for diagnosis.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v297-profit-exit.js';
