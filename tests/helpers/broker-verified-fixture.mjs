export const BROKER_VERIFIED={
  brokerVerified:true,
  isin:'DE0007236101',
  assetClass:'EQUITY',
  brokerVerificationSource:'official Trade Republic Trading Universe PDF',
  brokerMatchMode:'EXACT_NORMALIZED_NAME',
  brokerTarget:'Trade Republic'
};

export const brokerVerified=(row={})=>({...BROKER_VERIFIED,...row});
