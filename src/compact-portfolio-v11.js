// Production compatibility entry. V18 keeps the complete modern stack and adds
// execution-reconciled entry learning: only BUYs that really became Paper positions
// may remain as pending timing samples. Pullback, Rebound, Early-Breakout, venue,
// costs, replay learning and execution safety remain active.
export {MarketPortfolio} from './compact-portfolio-v18.js';
