import type { ModelConfig, TreasuryBalanceSheet } from "./v31-alpha-engine";

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  riskFreeRate: 0.045,
  cycleHorizonYears: 4.0,
  sigmaCycleAnchor: 0.5,
  sigmaLiveHvDefault: 0.423,
  solvencyCeilingRatio: 0.95,
  engineVersion: "3.1",
};

export const INITIAL_ASST_BS: TreasuryBalanceSheet = {
  ticker: "ASST",
  companyName: "Strive",
  effectiveDate: "2026-11-12",
  filingStamp: "Nov 9 & Nov 12, 2026 Form 8-Ks + SATA/SATS 424B5s",
  cik: "0001920406",
  btcHoldings: 43153.0,
  cashReserves: 538.0,
  basicShares: 127.331109,
  equityIv30d: 0.905,
  debtPutFace: 0.0,
  debtPutCoupon: 0.0,
  debtPutYears: 0.0,
  debtPutMaturityDate: "",
  debtLongFace: 0.0,
  debtLongCoupon: 0.0,
  convNoteShares: 0.0,
  convNoteStrike: 0.0,
  strkParInTiers: 0.0,
  preferreds: [
    {
      name: "SATA",
      label: "SATA (Variable Rate Perpetual)",
      tier: 1,
      parTotal: 1403.0176,
      couponRate: 0.1325,
      rho: 0.09,
      lambdaBase: 0.7,
      variableParCap: true,
      liveMarketPrice: 97.95,
    },
    {
      name: "SATS",
      label: "SATS (15.0% Fixed Cumulative)",
      tier: 2,
      parTotal: 703.6559,
      couponRate: 0.15,
      rho: 0.105,
      lambdaBase: 0.85,
      variableParCap: false,
      liveMarketPrice: 96.39,
    },
  ],
};

export const INITIAL_MSTR_BS: TreasuryBalanceSheet = {
  ticker: "MSTR",
  companyName: "Strategy",
  effectiveDate: "2026-11-09",
  filingStamp: "Nov 9, 2026 Form 8-K + Q3 2026 10-Q + Preferred 424B5s",
  cik: "0001050446",
  btcHoldings: 850364.0,
  cashReserves: 4916.2,
  basicShares: 425.5845,
  equityIv30d: 0.746,
  debtPutFace: 1005.91,
  debtPutCoupon: 6.29,
  debtPutYears: 305.0 / 365.0,
  debtPutMaturityDate: "2027-09-15",
  debtLongFace: 5709.49,
  debtLongCoupon: 35.71,
  convNoteShares: 24.2,
  convNoteStrike: 277.5,
  strkParInTiers: 1789.0,
  preferreds: [
    {
      name: "STRF_STRE",
      label: "STRF / STRE (10% Senior Penalty-Cum)",
      tier: 1,
      parTotal: 1743.8,
      couponRate: 0.1,
      rho: 0.09,
      lambdaBase: 0.7,
      variableParCap: false,
      liveMarketPrice: 101.81,
    },
    {
      name: "STRC",
      label: "STRC (12% Variable Rate Par-Targeted)",
      tier: 2,
      parTotal: 8700.0,
      couponRate: 0.12,
      rho: 0.105,
      lambdaBase: 0.7,
      variableParCap: true,
      liveMarketPrice: 99.99,
    },
    {
      name: "STRK",
      label: "STRK (8% Cum + 0.1sh @ $1,000 Warrant)",
      tier: 2,
      parTotal: 1789.0,
      couponRate: 0.08,
      rho: 0.105,
      lambdaBase: 0.85,
      variableParCap: false,
      liveMarketPrice: 67.15,
    },
    {
      name: "STRD",
      label: "STRD (10% Junior Non-Cumulative)",
      tier: 3,
      parTotal: 1185.0,
      couponRate: 0.1,
      rho: 0.115,
      lambdaBase: 1.0,
      variableParCap: false,
      liveMarketPrice: 67.5,
    },
  ],
};

export const INITIAL_MARKET_PRICES = {
  btc: 66638.66,
  btcChange24h: 0.0,
  asst: 21.36,
  mstr: 111.62,
  preferredQuotes: {
    SATA: 97.95,
    SATS: 96.39,
    STRF_STRE: 101.81,
    STRC: 99.99,
    STRK: 67.15,
    STRD: 67.5,
  } as Record<string, number>,
};

export interface HistoricalSeedPoint {
  date: string;
  btc: number;
  asst: number;
  mstr: number;
}

export const HISTORICAL_SEED: HistoricalSeedPoint[] = [
  { date: "2026-11-02", btc: 78287.79, asst: 20.8, mstr: 130.76 },
  { date: "2026-11-03", btc: 76847.19, asst: 20.66, mstr: 135.63 },
  { date: "2026-11-04", btc: 77263.81, asst: 22.92, mstr: 142.54 },
  { date: "2026-11-05", btc: 80426.04, asst: 20.59, mstr: 129.3 },
  { date: "2026-11-06", btc: 75659.12, asst: 21.45, mstr: 128.93 },
  { date: "2026-11-09", btc: 74724.8, asst: 21.46, mstr: 125.59 },
  { date: "2026-11-10", btc: 74683.33, asst: 21.55, mstr: 121.07 },
  { date: "2026-11-11", btc: 73633.28, asst: 23.2, mstr: 122.35 },
  { date: "2026-11-12", btc: 71350.81, asst: 22.25, mstr: 114.41 },
  { date: "2026-11-13", btc: 68238.21, asst: 21.36, mstr: 111.62 },
];
