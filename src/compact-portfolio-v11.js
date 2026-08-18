// Production compatibility entry. V17 keeps the complete modern stack and adds
// strong-candidate retention + fresh 1m second-chance rechecks. Nothing in this
// layer forces a trade; Rebound, Early-Breakout, target-venue, learning, costs
// and execution safety remain downstream requirements.
export {MarketPortfolio} from './compact-portfolio-v17.js';
