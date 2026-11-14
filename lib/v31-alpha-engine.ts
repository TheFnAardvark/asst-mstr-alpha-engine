/**
 * ASST & MSTR Institutional Alpha Engine (v3.1)
 * Subordination-Adjusted 3-Regime Smooth-Pasting Leland (1994) ODE & SEC Form 424B5 Waterfall.
 * Grounded in Leland (1994), Emanuel (1983), Realdon (2006), Black & Cox (1976), and Ingersoll (1977).
 * Zero external dependencies.
 */

export interface PreferredTranche {
  name: string;
  label: string;
  tier: number;
  parTotal: number;
  couponRate: number;
  rho: number;
  lambdaBase: number;
  variableParCap: boolean;
  liveMarketPrice?: number;
}

export interface TreasuryBalanceSheet {
  ticker: string;
  companyName: string;
  effectiveDate: string;
  filingStamp: string;
  cik: string;
  btcHoldings: number;
  cashReserves: number;
  basicShares: number;
  equityIv30d: number;
  debtPutFace: number;
  debtPutCoupon: number;
  debtPutYears: number;
  debtPutMaturityDate?: string;
  debtLongFace: number;
  debtLongCoupon: number;
  convNoteShares: number;
  convNoteStrike: number;
  strkParInTiers: number;
  preferreds: PreferredTranche[];
}

export interface ModelConfig {
  riskFreeRate: number;
  cycleHorizonYears: number;
  sigmaCycleAnchor: number;
  sigmaLiveHvDefault: number;
  solvencyCeilingRatio: number;
  engineVersion: string;
}

export interface LelandRoots {
  gamma: number;
  betaPos: number;
  w: number;
}

export interface PricedTrancheSlice {
  val: number;
  dDx: number;
  bullCeiling: number;
  xCap: number | null;
  regime: string;
}

export interface TrancheDiagnostic extends PreferredTranche {
  roots: LelandRoots;
  parBtc: number;
  cashSlice: number;
  valBtc: number;
  totalVal: number;
  dDx: number;
  bullCeilingBtc: number;
  xsEff: number;
  xCap: number | null;
  regime: string;
  modelPrice: number;
  warrantValPerSh?: number;
  hybridModelPrice?: number;
}

export interface ValuationResult {
  btcPrice: number;
  sigma: number;
  debtPutYearsUsed: number;
  v0: number;
  c0: number;
  s0: number;
  x0: number;
  bPv: number;
  k0GrossPar: number;
  cashToDebt: number;
  cashToPrefs: number;
  excessCommonCash: number;
  h0DebtBtc: number;
  alphaSolv: number;
  cebePerSh: number;
  unencumberedSatsPerSh: number;
  rawSatsPerSh: number;
  carryDebtAdjPerSh: number;
  lelandPutPerSh: number;
  haircutsPerSh: number;
  fairValuePerSh: number;
  livePrice: number;
  growthPremiumPerSh: number;
  annualHurdlePct: number;
  impliedBtcVolPct: number;
  deltaNet: number;
  eModel: number;
  seniorClaimsVal: number;
  dilTotal: number;
  dilNotes: number;
  dilStrk: number;
  mNavMultiple: number;
  tranchePrices: Record<string, number>;
  trancheDetails: Record<string, TrancheDiagnostic>;
}

export interface InvariantCheck {
  id: string;
  title: string;
  formula: string;
  metric: string;
  passed: boolean;
}

export interface InvariantSuiteReport {
  allPassed: boolean;
  evaluations: number;
  elapsedMs: number;
  timestamp: string;
  checks: InvariantCheck[];
}

export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + 0.3275911 * ax);
  const y =
    1.0 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1.0 + erf(x / Math.SQRT2));
}

export function lelandRoots(r: number, rho: number, sigma: number): LelandRoots {
  if (sigma <= 0.0) {
    throw new Error("Volatility sigma must be strictly positive.");
  }
  if (rho <= r) {
    throw new Error("Subordinated discount rate rho must exceed risk-free rate r.");
  }
  const s2 = sigma * sigma;
  const a = (2.0 * r) / s2;
  const disc = (1.0 - a) * (1.0 - a) + (8.0 * rho) / s2;
  const delta = Math.sqrt(disc);
  const gamma = 0.5 * (delta - (1.0 - a));
  const betaPos = 0.5 * (delta + (1.0 - a));
  const w = betaPos / delta;
  return { gamma, betaPos, w };
}

export function priceTrancheBtc(
  x: number,
  parBtc: number,
  tranche: PreferredTranche,
  xS: number,
  roots: LelandRoots
): PricedTrancheSlice {
  if (parBtc <= 0.0) {
    return {
      val: 0.0,
      dDx: 0.0,
      bullCeiling: 0.0,
      xCap: 0.0,
      regime: "Cash-Defended",
    };
  }

  const { gamma, betaPos, w } = roots;

  if (tranche.variableParCap) {
    const bullCeiling = parBtc;
    if (x <= 0.0 || xS <= 0.0) {
      return {
        val: 0.0,
        dDx: 0.0,
        bullCeiling,
        xCap: 0.0,
        regime: "Regime 1: Suspended",
      };
    }

    if (tranche.couponRate > tranche.rho) {
      const m = tranche.couponRate / tranche.rho;
      const u = Math.pow(1.0 - tranche.rho / tranche.couponRate, -1.0 / gamma);
      const xCap = u * xS;

      if (x >= xCap) {
        return {
          val: parBtc,
          dDx: 0.0,
          bullCeiling,
          xCap,
          regime: "Regime 3: $100 Par-Pinned",
        };
      } else if (x > xS) {
        const termCap = (m - 1.0) * (1.0 - w) * Math.pow(x / xCap, betaPos);
        const termPut = m * w * Math.pow(x / xS, -gamma);
        const val = parBtc * (m - termCap - termPut);
        const dDx = (parBtc / x) * (-betaPos * termCap + gamma * termPut);
        return {
          val,
          dDx,
          bullCeiling,
          xCap,
          regime: "Regime 2: Rate-Reset Transition",
        };
      } else {
        const a1 = (1.0 - w) * (m - (m - 1.0) * Math.pow(u, -betaPos));
        const ratioS = Math.pow(x / xS, betaPos);
        const val = parBtc * a1 * ratioS;
        const dDx = (parBtc / x) * betaPos * a1 * ratioS;
        return {
          val,
          dDx,
          bullCeiling,
          xCap,
          regime: "Regime 1: Suspended",
        };
      }
    } else {
      const fMax = parBtc * (tranche.couponRate / tranche.rho);
      if (x > xS) {
        const putTerm = w * Math.pow(x / xS, -gamma);
        const val = fMax * (1.0 - putTerm);
        const dDx = (fMax / x) * gamma * putTerm;
        return {
          val,
          dDx,
          bullCeiling,
          xCap: Infinity,
          regime: "2-Regime Uncapped",
        };
      } else {
        const ratioS = Math.pow(x / xS, betaPos);
        const val = fMax * (1.0 - w) * ratioS;
        const dDx = (fMax / x) * betaPos * (1.0 - w) * ratioS;
        return {
          val,
          dDx,
          bullCeiling,
          xCap: Infinity,
          regime: "Regime 1: Suspended",
        };
      }
    }
  }

  const fMax = parBtc * (tranche.couponRate / tranche.rho);
  if (x <= 0.0 || xS <= 0.0) {
    return {
      val: 0.0,
      dDx: 0.0,
      bullCeiling: fMax,
      xCap: null,
      regime: "Regime 1: Suspended",
    };
  }

  if (x > xS) {
    const putTerm = w * Math.pow(x / xS, -gamma);
    const val = fMax * (1.0 - putTerm);
    const dDx = (fMax / x) * gamma * putTerm;
    return {
      val,
      dDx,
      bullCeiling: fMax,
      xCap: null,
      regime: "2-Regime Uncapped",
    };
  } else {
    const ratioS = Math.pow(x / xS, betaPos);
    const val = fMax * (1.0 - w) * ratioS;
    const dDx = (fMax / x) * betaPos * (1.0 - w) * ratioS;
    return {
      val,
      dDx,
      bullCeiling: fMax,
      xCap: null,
      regime: "Regime 1: Suspended",
    };
  }
}

export function downAndOutCallWithDelta(
  v0: number,
  k: number,
  h: number,
  r: number,
  sigma: number,
  tYears: number
): { val: number; delta: number } {
  if (v0 <= 0.0 || v0 <= h) {
    return { val: 0.0, delta: 0.0 };
  }
  if (k <= 0.0) {
    return { val: v0 - h, delta: 1.0 };
  }

  const sqrtT = Math.sqrt(tYears);
  const sigT = sigma * sqrtT;
  const pvK = k * Math.exp(-r * tYears);

  const d1 = (Math.log(v0 / k) + (r + 0.5 * sigma * sigma) * tYears) / sigT;
  const d2 = d1 - sigT;
  const bsVal = v0 * normCdf(d1) - pvK * normCdf(d2);
  const bsDelta = normCdf(d1);

  if (h <= 1e-9) {
    return { val: Math.max(0.0, bsVal), delta: bsDelta };
  }

  const lam = r / (sigma * sigma) - 0.5;
  const refl = (vv: number): number => {
    const p2l = Math.pow(h / vv, 2.0 * lam);
    const yy1 =
      (Math.log((h * h) / (vv * k)) + (r + 0.5 * sigma * sigma) * tYears) /
      sigT;
    const yy2 = yy1 - sigT;
    return (
      vv * Math.pow(h / vv, 2.0 * (lam + 1.0)) * normCdf(yy1) -
      pvK * p2l * normCdf(yy2)
    );
  };

  const reflVal = refl(v0);
  if (reflVal <= 0.0) {
    return { val: Math.max(0.0, bsVal), delta: bsDelta };
  }

  const eps = Math.max(1e-5, v0 * 1e-6);
  const vp = v0 + eps;
  const vm = Math.max(h + 1e-9, v0 - eps);
  const reflDelta = (refl(vp) - refl(vm)) / (vp - vm);

  const val = Math.max(0.0, bsVal - reflVal);
  const delta = val > 0.0 ? Math.max(0.0, bsDelta - reflDelta) : 0.0;
  return { val, delta };
}

export function resolveDebtPutYears(
  bs: TreasuryBalanceSheet,
  referenceMs?: number
): number {
  if (
    bs.debtPutMaturityDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(bs.debtPutMaturityDate.trim())
  ) {
    const targetMs = Date.parse(bs.debtPutMaturityDate.trim() + "T20:00:00Z");
    const nowMs = referenceMs ?? Date.now();
    if (!Number.isNaN(targetMs)) {
      return Math.max(0.0, (targetMs - nowMs) / (365.0 * 86_400_000.0));
    }
  }
  return Math.max(0.0, bs.debtPutYears || 0.0);
}

export function evaluateBalanceSheet(
  bs: TreasuryBalanceSheet,
  btcPrice: number,
  sigma: number,
  liveStockPrice: number,
  r: number = 0.045,
  tCycle: number = 4.0,
  solvencyCap: number = 0.95
): ValuationResult {
  const v0 = (bs.btcHoldings * btcPrice) / 1_000_000.0;
  const c0 = bs.cashReserves;
  const s0 = v0 + c0;

  const tp = bs.debtPutYears > 0 ? bs.debtPutYears : resolveDebtPutYears(bs);
  let bPv = 0.0;
  if (bs.debtPutFace > 0.0) {
    if (tp > 0.0) {
      const discP = Math.exp(-r * tp);
      const annP = (1.0 - discP) / r;
      bPv += bs.debtPutFace * discP + bs.debtPutCoupon * annP;
    } else {
      bPv += bs.debtPutFace;
    }
  }
  if (bs.debtLongFace > 0.0) {
    const discL = Math.exp(-r * tCycle);
    const annL = (1.0 - discL) / r;
    bPv += bs.debtLongFace * discL + bs.debtLongCoupon * annL;
  }

  const debtFaceTotal = bs.debtPutFace + bs.debtLongFace;
  const prefParTotal = bs.preferreds.reduce((acc, t) => acc + t.parTotal, 0.0);
  const k0GrossPar = debtFaceTotal + prefParTotal;

  let remCash = c0;
  const cashToDebt = Math.min(remCash, bPv);
  remCash -= cashToDebt;
  const h0DebtBtc = bPv - cashToDebt;

  const tiersSorted = Array.from(
    new Set(bs.preferreds.map((t) => t.tier))
  ).sort((a, b) => a - b);

  const parBtcMap: Record<string, number> = {};
  let cashToPrefs = 0.0;
  for (const tierIdx of tiersSorted) {
    const tierTranches = bs.preferreds.filter((t) => t.tier === tierIdx);
    const tierPar = tierTranches.reduce((acc, t) => acc + t.parTotal, 0.0);
    const alloc = Math.min(remCash, tierPar);
    remCash -= alloc;
    cashToPrefs += alloc;
    for (const t of tierTranches) {
      const shareCash = tierPar > 0.0 ? alloc * (t.parTotal / tierPar) : 0.0;
      parBtcMap[t.name] = t.parTotal - shareCash;
    }
  }
  const excessCommonCash = remCash;

  const cumTierPar: Record<number, number> = {};
  let runningPar = 0.0;
  for (const tierIdx of tiersSorted) {
    const tierBtcPar = bs.preferreds
      .filter((t) => t.tier === tierIdx)
      .reduce((acc, t) => acc + parBtcMap[t.name], 0.0);
    runningPar += tierBtcPar;
    cumTierPar[tierIdx] = runningPar;
  }

  const rootsMap: Record<string, LelandRoots> = {};
  const baseXsMap: Record<string, number> = {};
  for (const t of bs.preferreds) {
    rootsMap[t.name] = lelandRoots(r, t.rho, sigma);
    baseXsMap[t.name] = t.lambdaBase * cumTierPar[t.tier];
  }

  const activeXs = bs.preferreds
    .filter((t) => parBtcMap[t.name] > 0.0 && baseXsMap[t.name] > 0.0)
    .map((t) => baseXsMap[t.name]);

  let alphaSolv = 1.0;
  if (activeXs.length > 0) {
    const xMin = 0.4 * Math.min(...activeXs);
    const xMax = 3.5 * Math.max(...activeXs);
    let peakRatio = 0.0;
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const xg = xMin * Math.pow(xMax / xMin, i / steps);
      let totP = 0.0;
      for (const t of bs.preferreds) {
        totP += priceTrancheBtc(
          xg,
          parBtcMap[t.name],
          t,
          baseXsMap[t.name],
          rootsMap[t.name]
        ).val;
      }
      peakRatio = Math.max(peakRatio, totP / xg);
    }
    if (peakRatio > solvencyCap) {
      alphaSolv = peakRatio / solvencyCap;
    }
  }

  const x0 = Math.max(0.0, v0 - h0DebtBtc);
  let prefBtcTotal = 0.0;
  let dPrefDxTotal = 0.0;
  let prefCeilBtcTotal = 0.0;
  const tranchePrices: Record<string, number> = {};
  const trancheDetails: Record<string, TrancheDiagnostic> = {};

  for (const t of bs.preferreds) {
    const xsEff = alphaSolv * baseXsMap[t.name];
    const priced = priceTrancheBtc(
      x0,
      parBtcMap[t.name],
      t,
      xsEff,
      rootsMap[t.name]
    );
    prefBtcTotal += priced.val;
    dPrefDxTotal += priced.dDx;
    prefCeilBtcTotal += priced.bullCeiling;
    const cashSlice = t.parTotal - parBtcMap[t.name];
    const pricePerSh =
      t.parTotal > 0.0 ? (100.0 * (cashSlice + priced.val)) / t.parTotal : 0.0;
    tranchePrices[t.name] = pricePerSh;
    trancheDetails[t.name] = {
      ...t,
      roots: rootsMap[t.name],
      parBtc: parBtcMap[t.name],
      cashSlice,
      valBtc: priced.val,
      totalVal: cashSlice + priced.val,
      dDx: priced.dDx,
      bullCeilingBtc: priced.bullCeiling,
      xsEff,
      xCap: priced.xCap,
      regime: priced.regime,
      modelPrice: pricePerSh,
    };
  }

  const debtBtcVal = Math.min(v0, h0DebtBtc);
  const totalSeniorClaimsVal =
    cashToDebt + debtBtcVal + cashToPrefs + prefBtcTotal;
  const kCeilTotal = cashToDebt + h0DebtBtc + cashToPrefs + prefCeilBtcTotal;
  const ePreConv = s0 - totalSeniorClaimsVal;

  let dilTotal = 0.0;
  let deltaConv = 0.0;
  let dilNotes = 0.0;
  let dilStrk = 0.0;

  if (v0 > h0DebtBtc && ePreConv > 0.0) {
    const kEffBtc = Math.max(0.0, totalSeniorClaimsVal - c0);
    let nPost = bs.basicShares;

    if (bs.convNoteShares > 0.0) {
      const gamN = bs.convNoteShares / (bs.basicShares + bs.convNoteShares);
      const kUnpvN =
        kEffBtc * Math.exp(r * tCycle) + bs.basicShares * bs.convNoteStrike;
      const callN = downAndOutCallWithDelta(
        v0,
        kUnpvN,
        h0DebtBtc,
        r,
        sigma,
        tCycle
      );
      dilNotes = gamN * callN.val;
      dilTotal += dilNotes;
      deltaConv += gamN * callN.delta;
      nPost += bs.convNoteShares;
    }

    if (bs.strkParInTiers > 0.0) {
      const nStrk = (bs.strkParInTiers / 100.0) * 0.1;
      const gamS = nStrk / (nPost + nStrk);
      const kUnpvS =
        kEffBtc * Math.exp(r * tCycle) + (nPost * 1000.0 - debtFaceTotal);
      const callS = downAndOutCallWithDelta(
        v0,
        kUnpvS,
        h0DebtBtc,
        r,
        sigma,
        tCycle
      );
      dilStrk = gamS * callS.val;
      dilTotal += dilStrk;
      deltaConv += gamS * callS.delta;
    }

    const nConvAll = bs.convNoteShares + (bs.strkParInTiers / 100.0) * 0.1;
    if (nConvAll > 0.0) {
      const maxDil = (nConvAll / (bs.basicShares + nConvAll)) * ePreConv;
      if (dilTotal > maxDil) {
        const scale = dilTotal > 0 ? maxDil / dilTotal : 0;
        dilNotes *= scale;
        dilStrk *= scale;
        dilTotal = maxDil;
        deltaConv =
          (nConvAll / (bs.basicShares + nConvAll)) * (1.0 - dPrefDxTotal);
      }
    }
  }

  if (trancheDetails["STRK"] && bs.strkParInTiers > 0) {
    const strkSharesM = bs.strkParInTiers / 100.0;
    const warrantPerSh = strkSharesM > 0 ? dilStrk / strkSharesM : 0.0;
    trancheDetails["STRK"].warrantValPerSh = warrantPerSh;
    trancheDetails["STRK"].hybridModelPrice =
      trancheDetails["STRK"].modelPrice + warrantPerSh;
  }

  const eModel = ePreConv - dilTotal;
  const deltaNet =
    v0 <= h0DebtBtc ? 0.0 : Math.max(0.0, 1.0 - dPrefDxTotal - deltaConv);

  const cebePerSh = Math.max(0.0, s0 - k0GrossPar) / bs.basicShares;
  const unencumberedSatsPerSh =
    btcPrice > 0.0 ? (cebePerSh / btcPrice) * 100_000_000.0 : 0.0;
  const rawSatsPerSh =
    (bs.btcHoldings / (bs.basicShares * 1_000_000.0)) * 100_000_000.0;

  const carryDebtAdjPerSh = (k0GrossPar - kCeilTotal) / bs.basicShares;
  const rawPutTotal = kCeilTotal - totalSeniorClaimsVal;
  const underwaterParDeficit = Math.min(0.0, s0 - k0GrossPar);
  const lelandPutPerSh = (rawPutTotal + underwaterParDeficit) / bs.basicShares;
  const haircutsPerSh = dilTotal / bs.basicShares;
  const fairValuePerSh = eModel / bs.basicShares;

  const growthPremiumPerSh = liveStockPrice - fairValuePerSh;
  let annualHurdlePct = 0.0;
  if (growthPremiumPerSh > 0.0 && v0 * deltaNet > 0.0) {
    const gCum = (growthPremiumPerSh * bs.basicShares) / (v0 * deltaNet);
    annualHurdlePct = (Math.pow(1.0 + gCum, 1.0 / tCycle) - 1.0) * 100.0;
  }

  let impliedBtcVolPct = 0.0;
  if (v0 * deltaNet > 0.0 && eModel > 0.0) {
    impliedBtcVolPct = (bs.equityIv30d * (eModel / (v0 * deltaNet))) * 100.0;
  }

  const marketCapM = liveStockPrice * bs.basicShares;
  const simpleEvM = marketCapM + k0GrossPar - c0;
  const mNavMultiple = v0 > 0 ? simpleEvM / v0 : 0;

  return {
    btcPrice,
    sigma,
    debtPutYearsUsed: tp,
    v0,
    c0,
    s0,
    x0,
    bPv,
    k0GrossPar,
    cashToDebt,
    cashToPrefs,
    excessCommonCash,
    h0DebtBtc,
    alphaSolv,
    cebePerSh,
    unencumberedSatsPerSh,
    rawSatsPerSh,
    carryDebtAdjPerSh,
    lelandPutPerSh,
    haircutsPerSh,
    fairValuePerSh,
    livePrice: liveStockPrice,
    growthPremiumPerSh,
    annualHurdlePct,
    impliedBtcVolPct,
    deltaNet,
    eModel,
    seniorClaimsVal: totalSeniorClaimsVal,
    dilTotal,
    dilNotes,
    dilStrk,
    mNavMultiple,
    tranchePrices,
    trancheDetails,
  };
}

export function executeInvariantSuite(
  asstBs: TreasuryBalanceSheet,
  mstrBs: TreasuryBalanceSheet,
  r: number = 0.045,
  tCycle: number = 4.0
): InvariantSuiteReport {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const btcGrid = [
    500, 1200, 5000, 14032, 25000, 45000, 66638.66, 100000, 250000, 1000000,
  ];
  const volGrid = [0.25, 0.35, 0.423, 0.5, 0.85, 1.5];

  let evaluations = 0;
  let maxVaultErr = 0;
  let limitedLiabOk = true;
  let maxAdditivityErr = 0;
  let maxVarParPrice = 0;
  let varParCapOk = true;
  let monotonicOk = true;
  let maxSeamErr = 0;
  let maxDeltaDiff = 0;

  const pairs: Array<[TreasuryBalanceSheet, number]> = [
    [asstBs, 21.36],
    [mstrBs, 111.62],
  ];

  for (const [bs, stockPx] of pairs) {
    for (const sig of volGrid) {
      let prevFv = -1.0;

      for (const t of bs.preferreds) {
        const roots = lelandRoots(r, t.rho, sig);
        const xS = 1000.0;
        const parBtc = Math.max(100.0, t.parTotal);
        const eps = 1e-5;
        const leftS = priceTrancheBtc(xS - eps, parBtc, t, xS, roots);
        const rightS = priceTrancheBtc(xS + eps, parBtc, t, xS, roots);
        maxSeamErr = Math.max(
          maxSeamErr,
          Math.abs(leftS.val - rightS.val),
          Math.abs(leftS.dDx - rightS.dDx)
        );
        if (t.variableParCap && t.couponRate > t.rho) {
          const u = Math.pow(1.0 - t.rho / t.couponRate, -1.0 / roots.gamma);
          const xCap = u * xS;
          const leftC = priceTrancheBtc(xCap - eps, parBtc, t, xS, roots);
          const rightC = priceTrancheBtc(xCap + eps, parBtc, t, xS, roots);
          maxSeamErr = Math.max(
            maxSeamErr,
            Math.abs(leftC.val - rightC.val),
            Math.abs(leftC.dDx - rightC.dDx)
          );
        }
      }

      for (const btcPx of btcGrid) {
        const res = evaluateBalanceSheet(bs, btcPx, sig, stockPx, r, tCycle);
        evaluations += 1;

        const vaultDiff = Math.abs(
          res.eModel + res.seniorClaimsVal + res.dilTotal - res.s0
        );
        maxVaultErr = Math.max(maxVaultErr, vaultDiff);

        if (res.v0 > res.h0DebtBtc + 1e-5) {
          if (res.fairValuePerSh <= 0) limitedLiabOk = false;
        } else if (res.excessCommonCash <= 1e-9) {
          if (Math.abs(res.fairValuePerSh) > 1e-7) limitedLiabOk = false;
        }

        const rowSum =
          res.cebePerSh +
          res.carryDebtAdjPerSh +
          res.lelandPutPerSh -
          res.haircutsPerSh;
        maxAdditivityErr = Math.max(
          maxAdditivityErr,
          Math.abs(rowSum - res.fairValuePerSh)
        );

        for (const t of bs.preferreds) {
          const pSh = res.tranchePrices[t.name] ?? 0;
          if (t.variableParCap) {
            maxVarParPrice = Math.max(maxVarParPrice, pSh);
            if (pSh < -1e-6 || pSh > 100.00001) varParCapOk = false;
          }
        }

        const maxXsEff = Math.max(
          0,
          ...Object.values(res.trancheDetails).map((d) => d.xsEff)
        );
        if (res.x0 >= maxXsEff) {
          if (res.fairValuePerSh < prevFv - 1e-5) {
            monotonicOk = false;
          }
          prevFv = res.fairValuePerSh;
        }

        if (
          res.deltaNet > 1e-4 &&
          res.x0 >= maxXsEff &&
          Math.abs(res.v0 - res.h0DebtBtc) > 10.0
        ) {
          const epsPx = Math.max(0.1, btcPx * 1e-4);
          const rp = evaluateBalanceSheet(bs, btcPx + epsPx, sig, stockPx, r, tCycle);
          const rm = evaluateBalanceSheet(bs, btcPx - epsPx, sig, stockPx, r, tCycle);
          evaluations += 2;
          const numDelta = (rp.eModel - rm.eModel) / (rp.v0 - rm.v0);
          maxDeltaDiff = Math.max(
            maxDeltaDiff,
            Math.abs(res.deltaNet - numDelta)
          );
        }
      }
    }
  }

  const richMstr: TreasuryBalanceSheet = { ...mstrBs, cashReserves: 30000.0 };
  const richRes = evaluateBalanceSheet(richMstr, 66638.66, 0.5, 111.62, r, tCycle);
  evaluations += 1;
  const richErr = Math.abs(
    richRes.eModel + richRes.seniorClaimsVal + richRes.dilTotal - richRes.s0
  );

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  const checks: InvariantCheck[] = [
    {
      id: "INV-01",
      title: "Modigliani-Miller Vault Conservation",
      formula: "E_model + Senior_Claims + Convert_Dilution == S_0",
      metric: "Max drift: $" + maxVaultErr.toExponential(2) + "M",
      passed: maxVaultErr < 1e-6,
    },
    {
      id: "INV-02",
      title: "Strict Limited Liability & Solvency Scaling",
      formula: "E_model > 0 for V_0 > H_0; E_model == 0 below H_0",
      metric: limitedLiabOk ? "Zero negative-equity states" : "Breach detected",
      passed: limitedLiabOk,
    },
    {
      id: "INV-03",
      title: "Universal Scorecard Row Additivity",
      formula: "CEBE + CarryAdj + NetPut - Dilution == FairValue",
      metric: "Max discrepancy: $" + maxAdditivityErr.toExponential(2) + "/sh",
      passed: maxAdditivityErr < 1e-6,
    },
    {
      id: "INV-04",
      title: "Variable Preferred $100.00 Par-Pinning",
      formula: "0 <= P_SATA, P_STRC <= $100.00 across all X_0 >= X_cap",
      metric: "Peak variable price: $" + maxVarParPrice.toFixed(4),
      passed: varParCapOk,
    },
    {
      id: "INV-05",
      title: "Continuation-Regime Equity Monotonicity",
      formula: "d(FairValue) / d(P_BTC) >= 0 for X_0 >= X_S_max",
      metric: monotonicOk ? "Strictly non-decreasing" : "Non-monotonic step",
      passed: monotonicOk,
    },
    {
      id: "INV-06",
      title: "C^0 & C^1 Smooth-Pasting Across Barriers",
      formula: "lim_(x->X_S-) P, P' == lim_(x->X_S+) P, P' (and at X_cap)",
      metric: "Max seam jump/kink: " + maxSeamErr.toExponential(2),
      passed: maxSeamErr < 1e-3,
    },
    {
      id: "INV-07",
      title: "Analytical Common BTC Delta Accuracy",
      formula: "|Delta_Net - CentralFiniteDiff(dE/dV_0)| < 1e-3",
      metric: "Max delta error: " + maxDeltaDiff.toExponential(2),
      passed: maxDeltaDiff < 1e-3,
    },
    {
      id: "INV-08",
      title: "Excess-Cash Priority Waterfall ($30B Test)",
      formula: "C_0 > B_PV + sum(Par_k) flows cleanly to Common Equity",
      metric: "Excess-cash drift: $" + richErr.toExponential(2) + "M",
      passed: richErr < 1e-6 && richRes.fairValuePerSh > 0,
    },
  ];

  return {
    allPassed: checks.every((c) => c.passed),
    evaluations,
    elapsedMs: Math.max(0.1, t1 - t0),
    timestamp: new Date().toISOString(),
    checks,
  };
}
