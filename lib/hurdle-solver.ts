
import {
  evaluateBalanceSheet,
  type PreferredTranche,
  type TreasuryBalanceSheet,
  type ValuationResult,
} from "@/lib/v31-alpha-engine";

export interface HurdleMetrics {
  /** Exact debt-free BTC the company must add (at today's BTC price) to bring Model Fair Value up to today's stock price */
  unencumberedBtcNeeded: number;
  /** Exact debt-free sats per basic share needed to close the Growth Premium at flat BTC */
  unencumberedSatsNeededPerSh: number;
  /** Cumulative % growth needed on the ENTIRE gross BTC vault */
  totalBtcHurdleCumPct: number;
  /** Annualized % growth needed on the ENTIRE gross BTC vault (over tCycle) */
  totalBtcHurdleAnnualPct: number;
  /** Cumulative % growth needed on today's DEBT-FREE (unencumbered) sats/sh (null if underwater / 0 CEBE) */
  unencumberedBtcHurdleCumPct: number | null;
  /** Annualized % growth needed on today's DEBT-FREE sats/sh (null if underwater / 0 CEBE) */
  unencumberedBtcHurdleAnnualPct: number | null;
  /** Exact BTC price where Model Fair Value equals today's stock price with ZERO issuance ("Drink a Beer" break-even) */
  drinkABeerUsdBtc: number | null;
  /** Exact BTC price where Model Fair Value beats buying spot BTC today with ZERO issuance (null if waiting alone can't beat spot) */
  beatSpotBtc: number | null;
  /** True when the stock is already trading at or below Model Fair Value */
  alreadyAtDiscount: boolean;
}

export interface BreakEvenSimInput {
  bs: TreasuryBalanceSheet;
  btcPrice0: number;
  liveStockPrice: number;
  sigma: number;
  r: number;
  tCycle: number;
  solvencyCap: number;
  /** Lever 1: Simulated future Bitcoin price ($) */
  futureBtcPrice: number;
  /** Lever 2: Common stock ATM proceeds raised ($M) to buy BTC at btcPrice0 */
  atmDollarsM: number;
  /** Lever 3: ATM issuance premium (% above today's Model Fair Value). At 0%, ATM cannot raise Fair Value. */
  atmPremiumPct: number;
  /** Lever 4: Preferred stock proceeds raised ($M) to buy BTC at btcPrice0 (added to primary variable-cap tranche) */
  prefDollarsM: number;
}

export interface BreakEvenSimResult {
  baseRes: ValuationResult;
  simRes: ValuationResult;
  simBs: TreasuryBalanceSheet;
  /** Target preferred tranche name used for new preferred issuance (e.g., SATA or STRC) */
  primaryPrefName: string;
  /** Modeled issue price per $100 par used for new preferred issuance (capped at $100) */
  prefIssuePriceUsed: number;
  /** Total new preferred face value ($M) created */
  prefParCreatedM: number;
  /** New common shares issued via ATM (millions) */
  newCommonSharesM: number;
  /** Effective ATM share sale price ($/sh) */
  atmSharePrice: number;
  /** Total new BTC bought by ATM + Preferred raises combined */
  btcBoughtTotal: number;
  /** Exact BTC bought by ATM alone */
  btcBoughtByAtm: number;
  /** Exact BTC bought by Preferreds alone */
  btcBoughtByPref: number;
  /** Dollar gain/loss per share if ending premium collapses to $0 */
  usdPnlPerSh: number;
  /** Percentage gain/loss if ending premium collapses to $0 */
  usdReturnPct: number;
  /** Value of putting the same liveStockPrice into spot BTC at btcPrice0 */
  spotEquivValuePerSh: number;
  /** Spot BTC percentage return from btcPrice0 to futureBtcPrice */
  spotReturnPct: number;
  /** Outperformance (or underperformance) vs. buying spot BTC */
  alphaVsSpotPct: number;
  /** Whether Model Fair Value >= today's stock price (Dollar break-even cleared) */
  clearedDollarBreakEven: boolean;
  /** Whether Model Fair Value >= equivalent spot BTC investment */
  beatsSpotBtc: boolean;
  /** Progress toward clearing the dollar break-even gap (can exceed 100%) */
  hurdleProgressPct: number;
  /** Updated "Drink a Beer" BTC price needed given the current ATM + Preferred sliders */
  simDollarBreakEvenBtc: number | null;
  /** Updated BTC price needed to beat spot BTC given the current ATM + Preferred sliders */
  simBeatSpotBtc: number | null;
}

/**
 * Picks the primary variable par-capped preferred class for new Digital Credit issuance
 * (SATA for ASST, STRC for MSTR).
 */
export function getPrimaryPrefTranche(
  bs: TreasuryBalanceSheet
): PreferredTranche | null {
  if (!bs.preferreds || bs.preferreds.length === 0) return null;
  const preferredOrder = ["SATA", "STRC"];
  for (const name of preferredOrder) {
    const found = bs.preferreds.find((t) => t.name === name);
    if (found) return found;
  }
  const varCap = bs.preferreds.find((t) => t.variableParCap);
  return varCap ?? bs.preferreds[0];
}

/**
 * Solves for the exact BTC price where Model Fair Value equals targetStockPrice.
 */
export function solveDollarBreakEvenBtc(
  bs: TreasuryBalanceSheet,
  targetStockPrice: number,
  btcPriceRef: number,
  sigma: number,
  r: number,
  tCycle: number,
  solvencyCap: number
): number | null {
  if (targetStockPrice <= 0 || bs.btcHoldings <= 0 || bs.basicShares <= 0) {
    return null;
  }

  const evalFv = (px: number) =>
    evaluateBalanceSheet(
      bs,
      px,
      sigma,
      targetStockPrice,
      r,
      tCycle,
      solvencyCap
    ).fairValuePerSh;

  let lo = 100;
  if (evalFv(lo) >= targetStockPrice) {
    return lo;
  }

  let hi = Math.max(btcPriceRef * 2, 250_000);
  let expansions = 0;
  while (evalFv(hi) < targetStockPrice && expansions < 12) {
    lo = hi;
    hi *= 2;
    expansions += 1;
  }
  if (evalFv(hi) < targetStockPrice) {
    return null;
  }

  for (let i = 0; i < 28; i++) {
    const mid = 0.5 * (lo + hi);
    if (evalFv(mid) >= targetStockPrice) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

/**
 * Solves for the lowest BTC price (>= btcPrice0) where Model Fair Value beats
 * putting the exact same entryStockPrice into spot BTC at btcPrice0.
 * Returns null if waiting alone cannot beat spot BTC at 0% ending premium.
 */
export function solveBeatSpotBtc(
  bs: TreasuryBalanceSheet,
  entryStockPrice: number,
  btcPrice0: number,
  sigma: number,
  r: number,
  tCycle: number,
  solvencyCap: number
): number | null {
  if (
    entryStockPrice <= 0 ||
    btcPrice0 <= 0 ||
    bs.btcHoldings <= 0 ||
    bs.basicShares <= 0
  ) {
    return null;
  }

  const diffAt = (px: number) => {
    const fv = evaluateBalanceSheet(
      bs,
      px,
      sigma,
      entryStockPrice,
      r,
      tCycle,
      solvencyCap
    ).fairValuePerSh;
    const spotEquiv = entryStockPrice * (px / btcPrice0);
    return fv - spotEquiv;
  };

  // Already beats spot at today's BTC price (trading at/below Fair Value)
  if (diffAt(btcPrice0) >= -1e-6) {
    return btcPrice0;
  }

  // Coarse log-spaced scan from btcPrice0 up to $20M BTC to catch the exact crossing
  const maxScanPx = Math.max(btcPrice0 * 150, 15_000_000);
  const steps = 28;
  let prevPx = btcPrice0;
  for (let i = 1; i <= steps; i++) {
    const px = btcPrice0 * Math.pow(maxScanPx / btcPrice0, i / steps);
    if (diffAt(px) >= 0) {
      let lo = prevPx;
      let hi = px;
      for (let j = 0; j < 26; j++) {
        const mid = 0.5 * (lo + hi);
        if (diffAt(mid) >= 0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return hi;
    }
    prevPx = px;
  }

  return null;
}

/**
 * Solves for the exact number of debt-free (unencumbered) BTC the company must add
 * at today's flat BTC price so Model Fair Value catches up to liveStockPrice.
 */
export function solveExactUnencumberedBtcNeeded(
  bs: TreasuryBalanceSheet,
  baseRes: ValuationResult,
  sigma: number,
  r: number,
  tCycle: number,
  solvencyCap: number
): number {
  if (
    baseRes.growthPremiumPerSh <= 1e-6 ||
    baseRes.btcPrice <= 0 ||
    bs.basicShares <= 0
  ) {
    return 0;
  }

  const target = baseRes.livePrice;
  const evalWithExtraBtc = (extraBtc: number) =>
    evaluateBalanceSheet(
      { ...bs, btcHoldings: bs.btcHoldings + extraBtc },
      baseRes.btcPrice,
      sigma,
      target,
      r,
      tCycle,
      solvencyCap
    ).fairValuePerSh;

  // Smart upper-bound seed based on local delta
  const approxDollarsM =
    (baseRes.growthPremiumPerSh * bs.basicShares) /
    Math.max(0.15, baseRes.deltaNet);
  let lo = 0;
  let hi = Math.max(10, (approxDollarsM * 1_000_000) / baseRes.btcPrice) * 1.5;

  let expansions = 0;
  while (evalWithExtraBtc(hi) < target && expansions < 14) {
    lo = hi;
    hi *= 2;
    expansions += 1;
  }

  for (let i = 0; i < 28; i++) {
    const mid = 0.5 * (lo + hi);
    if (evalWithExtraBtc(mid) >= target) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

/**
 * Computes clean, non-mixed hurdle metrics (both Total Vault and Unencumbered Sats yardsticks)
 * plus the exact "Drink a Beer" break-even BTC prices.
 */
export function computeHurdleMetrics(
  bs: TreasuryBalanceSheet,
  baseRes: ValuationResult,
  sigma: number,
  r: number = 0.045,
  tCycle: number = 4.0,
  solvencyCap: number = 0.95
): HurdleMetrics {
  const alreadyAtDiscount = baseRes.growthPremiumPerSh <= 1e-6;
  const unencumberedBtcNeeded = alreadyAtDiscount
    ? 0
    : solveExactUnencumberedBtcNeeded(bs, baseRes, sigma, r, tCycle, solvencyCap);

  const unencumberedSatsNeededPerSh =
    bs.basicShares > 0
      ? (unencumberedBtcNeeded / (bs.basicShares * 1_000_000)) * 100_000_000
      : 0;

  const totalBtcHurdleCumPct =
    bs.btcHoldings > 0 ? (unencumberedBtcNeeded / bs.btcHoldings) * 100 : 0;
  const totalBtcHurdleAnnualPct =
    bs.btcHoldings > 0 && unencumberedBtcNeeded > 0
      ? (Math.pow(1 + unencumberedBtcNeeded / bs.btcHoldings, 1 / tCycle) - 1) *
        100
      : 0;

  const hasUnencFloor = baseRes.unencumberedSatsPerSh > 1e-6;
  const unencumberedBtcHurdleCumPct = hasUnencFloor
    ? (unencumberedSatsNeededPerSh / baseRes.unencumberedSatsPerSh) * 100
    : null;
  const unencumberedBtcHurdleAnnualPct =
    hasUnencFloor && unencumberedSatsNeededPerSh > 0
      ? (Math.pow(
          1 + unencumberedSatsNeededPerSh / baseRes.unencumberedSatsPerSh,
          1 / tCycle
        ) -
          1) *
        100
      : hasUnencFloor
      ? 0
      : null;

  const drinkABeerUsdBtc = solveDollarBreakEvenBtc(
    bs,
    baseRes.livePrice,
    baseRes.btcPrice,
    sigma,
    r,
    tCycle,
    solvencyCap
  );

  const beatSpotBtc = solveBeatSpotBtc(
    bs,
    baseRes.livePrice,
    baseRes.btcPrice,
    sigma,
    r,
    tCycle,
    solvencyCap
  );

  return {
    unencumberedBtcNeeded,
    unencumberedSatsNeededPerSh,
    totalBtcHurdleCumPct,
    totalBtcHurdleAnnualPct,
    unencumberedBtcHurdleCumPct,
    unencumberedBtcHurdleAnnualPct,
    drinkABeerUsdBtc,
    beatSpotBtc,
    alreadyAtDiscount,
  };
}

/**
 * Timeless 4-Lever Break-Even Simulator:
 * Evaluates what happens if the company pulls any mix of Common ATM (at a chosen premium),
 * Preferred Stock issuance, and Bitcoin price movement — assuming ending premium collapses to $0.
 */
export function simulateBreakEvenScenario(
  input: BreakEvenSimInput
): BreakEvenSimResult {
  const {
    bs,
    btcPrice0,
    liveStockPrice,
    sigma,
    r,
    tCycle,
    solvencyCap,
    futureBtcPrice,
    atmDollarsM,
    atmPremiumPct,
    prefDollarsM,
  } = input;

  const baseRes = evaluateBalanceSheet(
    bs,
    btcPrice0,
    sigma,
    liveStockPrice,
    r,
    tCycle,
    solvencyCap
  );

  // Lever 2 & 3: Common Stock ATM at chosen issuance premium above today's Model Fair Value
  const baseFvFloor = Math.max(0.01, baseRes.fairValuePerSh);
  const atmSharePrice = baseFvFloor * (1 + Math.max(0, atmPremiumPct) / 100);
  const cleanAtmM = Math.max(0, atmDollarsM);
  const newCommonSharesM =
    cleanAtmM > 0 && atmSharePrice > 0 ? cleanAtmM / atmSharePrice : 0;
  const btcBoughtByAtm =
    btcPrice0 > 0 ? (cleanAtmM * 1_000_000) / btcPrice0 : 0;

  // Lever 4: Preferred Stock issuance (added to SATA for ASST / STRC for MSTR)
  const primaryPref = getPrimaryPrefTranche(bs);
  const primaryPrefName = primaryPref ? primaryPref.name : "PREF";
  const prefModelPrice = primaryPref
    ? baseRes.tranchePrices[primaryPref.name] ?? 100
    : 100;
  // Honest issuance price: capped at $100 par, never assumes raising $100 cash on distressed preferreds
  const prefIssuePriceUsed = Math.min(100, Math.max(50, prefModelPrice));
  const cleanPrefM = Math.max(0, prefDollarsM);
  const prefParCreatedM =
    cleanPrefM > 0 ? cleanPrefM / (prefIssuePriceUsed / 100) : 0;
  const btcBoughtByPref =
    btcPrice0 > 0 ? (cleanPrefM * 1_000_000) / btcPrice0 : 0;

  const btcBoughtTotal = btcBoughtByAtm + btcBoughtByPref;

  const simBs: TreasuryBalanceSheet = {
    ...bs,
    btcHoldings: bs.btcHoldings + btcBoughtTotal,
    basicShares: bs.basicShares + newCommonSharesM,
    preferreds: bs.preferreds.map((t) =>
      primaryPref && t.name === primaryPref.name
        ? { ...t, parTotal: t.parTotal + prefParCreatedM }
        : t
    ),
  };

  // Lever 1: Evaluate modified balance sheet at Future BTC Price (with ending premium = $0)
  const simRes = evaluateBalanceSheet(
    simBs,
    futureBtcPrice,
    sigma,
    liveStockPrice,
    r,
    tCycle,
    solvencyCap
  );

  const usdPnlPerSh = simRes.fairValuePerSh - liveStockPrice;
  const usdReturnPct =
    liveStockPrice > 0 ? (simRes.fairValuePerSh / liveStockPrice - 1) * 100 : 0;

  const spotEquivValuePerSh =
    btcPrice0 > 0 ? liveStockPrice * (futureBtcPrice / btcPrice0) : 0;
  const spotReturnPct =
    btcPrice0 > 0 ? (futureBtcPrice / btcPrice0 - 1) * 100 : 0;
  const alphaVsSpotPct = usdReturnPct - spotReturnPct;

  const clearedDollarBreakEven = simRes.fairValuePerSh >= liveStockPrice - 1e-4;
  const beatsSpotBtc = simRes.fairValuePerSh >= spotEquivValuePerSh - 1e-4;

  const initialGap = liveStockPrice - baseRes.fairValuePerSh;
  let hurdleProgressPct = 100;
  if (initialGap > 1e-6) {
    hurdleProgressPct = Math.max(
      0,
      ((simRes.fairValuePerSh - baseRes.fairValuePerSh) / initialGap) * 100
    );
  }

  // Live Tug-of-War targets: given the ATM + Preferred sliders, what BTC price clears the hurdle now?
  const simDollarBreakEvenBtc = solveDollarBreakEvenBtc(
    simBs,
    liveStockPrice,
    btcPrice0,
    sigma,
    r,
    tCycle,
    solvencyCap
  );
  const simBeatSpotBtc = solveBeatSpotBtc(
    simBs,
    liveStockPrice,
    btcPrice0,
    sigma,
    r,
    tCycle,
    solvencyCap
  );

  return {
    baseRes,
    simRes,
    simBs,
    primaryPrefName,
    prefIssuePriceUsed,
    prefParCreatedM,
    newCommonSharesM,
    atmSharePrice,
    btcBoughtTotal,
    btcBoughtByAtm,
    btcBoughtByPref,
    usdPnlPerSh,
    usdReturnPct,
    spotEquivValuePerSh,
    spotReturnPct,
    alphaVsSpotPct,
    clearedDollarBreakEven,
    beatsSpotBtc,
    hurdleProgressPct,
    simDollarBreakEvenBtc,
    simBeatSpotBtc,
  };
}
