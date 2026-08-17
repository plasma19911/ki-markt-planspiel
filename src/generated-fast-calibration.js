// Automatisch ueberschreibbare, konservativ begrenzte Schwellen fuer den Fast-Decision-Layer.
// scripts/calibrate_fast_signals.py kann diese Datei aus historischen Daten neu erzeugen.
export const FAST_CALIBRATION={
  version:'safe-default-v1',
  generatedAt:null,
  sampleCount:0,
  validated:false,
  buyThreshold:4.2,
  sellThreshold:4.0,
  maxSpreadPct:0.80,
  minAdxBuy:18,
  strongAdx:22,
  maxAtrPctBuy:2.50,
  minRelativeVolume:1.10,
  trailing:{activatePnlPct:2.0,minGivebackPct:0.8,maxGivebackPct:2.2,givebackShare:0.34}
};
