// Production compatibility entry for the PAPER-TRADING planspiel.
// V29.8 keeps the V29.7 adaptive profit exits and V29.6 score stability.
// Entry remains simple: DecisionScore >=56 => immediate BUY.
// New in V29.8: free worldwide news intelligence is multilingual, freshness-weighted
// and deduplicated. News changes the news component of DecisionScore itself; it is not
// an additional soft BUY gate after score 56.
// Sources are free only: SEC/EDGAR primary filings, ASX primary announcements where
// applicable, and GDELT as a worldwide multilingual discovery layer.
// Profit exits remain V29.7; directional weakness exits remain V29.6.
// No real broker orders are created here.
import './yahoo-spark-chart-fallback.js';
export {MarketPortfolio} from './compact-portfolio-v298-global-news.js';
