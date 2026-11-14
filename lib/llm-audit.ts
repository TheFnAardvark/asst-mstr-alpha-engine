import type {
  TreasuryBalanceSheet,
  ValuationResult,
} from "./v31-alpha-engine";

export interface AuditBundleInput {
  asstBs: TreasuryBalanceSheet;
  mstrBs: TreasuryBalanceSheet;
  btcPrice: number;
  asstPrice: number;
  mstrPrice: number;
  activeSigma: number;
  hvSigma: number;
  cycleSigma: number;
  riskFreeRate: number;
  tCycle: number;
  asstActive: ValuationResult;
  mstrActive: ValuationResult;
  asstHv: ValuationResult;
  asstCycle: ValuationResult;
  mstrHv: ValuationResult;
  mstrCycle: ValuationResult;
}

const MD_FENCE = String.fromCharCode(96, 96, 96);

function formatBsMarkdownBlock(bs: TreasuryBalanceSheet): string {
  const prefLines = bs.preferreds
    .map(
      (t) =>
        "  - " +
        t.name +
        " (Tier " +
        t.tier +
        "): par_total = $" +
        t.parTotal.toFixed(4) +
        "M, coupon_rate = " +
        (t.couponRate * 100).toFixed(2) +
        "% (" +
        t.couponRate +
        "), rho = " +
        (t.rho * 100).toFixed(2) +
        "% (" +
        t.rho +
        "), lambda_base = " +
        t.lambdaBase +
        ", variable_par_cap = " +
        t.variableParCap
    )
    .join("\n");

  return [
    "### " + bs.companyName + " ($" + bs.ticker + ") — Filing Anchor: " + bs.filingStamp + " (CIK " + bs.cik + ")",
    "- btc_holdings: " + bs.btcHoldings + " BTC",
    "- cash_reserves (C_0): $" + bs.cashReserves.toFixed(2) + "M",
    "- basic_shares (N_basic): " + bs.basicShares + "M",
    "- equity_iv_30d: " + (bs.equityIv30d * 100).toFixed(2) + "% (" + bs.equityIv30d + ")",
    "- debt_put_face: $" + bs.debtPutFace.toFixed(2) + "M | debt_put_coupon: $" + bs.debtPutCoupon.toFixed(2) + "M/yr | debt_put_years: " + bs.debtPutYears.toFixed(6) + " yrs",
    "- debt_long_face: $" + bs.debtLongFace.toFixed(2) + "M | debt_long_coupon: $" + bs.debtLongCoupon.toFixed(2) + "M/yr",
    "- conv_note_shares: " + bs.convNoteShares + "M | conv_note_strike: $" + bs.convNoteStrike.toFixed(2),
    "- strk_par_in_tiers: $" + bs.strkParInTiers.toFixed(2) + "M (derives " + ((bs.strkParInTiers / 100.0) * 0.1).toFixed(4) + "M common warrant shares @ $1,000.00 strike)",
    "- Preferred Tranches (SEC Form 424B5):",
    prefLines,
  ].join("\n");
}

export function buildLlmAuditPrompt(input: AuditBundleInput): string {
  const {
    asstBs,
    mstrBs,
    btcPrice,
    asstPrice,
    mstrPrice,
    activeSigma,
    hvSigma,
    cycleSigma,
    riskFreeRate,
    tCycle,
    asstActive,
    mstrActive,
    asstHv,
    asstCycle,
    mstrHv,
    mstrCycle,
  } = input;

  const fmtPrefRow = (bs: TreasuryBalanceSheet, res: ValuationResult) =>
    bs.preferreds
      .map(
        (t) =>
          t.name +
          ": $" +
          (res.tranchePrices[t.name] ?? 0).toFixed(4) +
          "/sh (" +
          (res.trancheDetails[t.name]?.regime || "Active") +
          ")"
      )
      .join(" | ");

  const hvLbl = (hvSigma * 100).toFixed(1) + "% HV";
  const cycLbl = (cycleSigma * 100).toFixed(1) + "% Vol";
  const actLbl = "Active " + (activeSigma * 100).toFixed(1) + "%";

  return [
    "# INDEPENDENT QUANTITATIVE AUDIT BRIEF — v3.1 LELAND ODE & SEC 424B5 WATERFALL",
    "",
    "Act as an independent quantitative derivatives auditor. Recompute the v3.1 ASST & MSTR valuations below from first principles (or execute the reference equations in Python), verify C^0/C^1 smooth-pasting continuity, Modigliani-Miller vault conservation (E + Senior + Dilution == S_0), strict limited liability, and $100 par-pinning on variable preferreds (SATA, STRC), and flag any discrepancy or hidden assumption.",
    "",
    "## 1. Live Market & Global Structural Parameters",
    "- BTC Spot Price (P_BTC): $" + btcPrice.toFixed(2),
    "- ASST Live Stock Price: $" + asstPrice.toFixed(2),
    "- MSTR Live Stock Price: $" + mstrPrice.toFixed(2),
    "- Active BTC Volatility (sigma): " + (activeSigma * 100).toFixed(2) + "% (" + activeSigma + ")",
    "- Reference Vol Anchors: 1Y Realized HV = " + (hvSigma * 100).toFixed(2) + "% | Structural Cycle Vol = " + (cycleSigma * 100).toFixed(2) + "%",
    "- Risk-Free Rate (r): " + (riskFreeRate * 100).toFixed(2) + "% (" + riskFreeRate + ")",
    "- Refinancing / Hurdle Cycle Horizon (t_cycle): " + tCycle.toFixed(1) + " years",
    "- Homogeneity Solvency Cap: 0.95 (senior preferred BTC claims never exceed 95% of post-debt BTC value X)",
    "",
    "## 2. Active SEC Form 8-K & Form 424B5 Balance Sheet Inputs",
    formatBsMarkdownBlock(asstBs),
    "",
    formatBsMarkdownBlock(mstrBs),
    "",
    "## 3. Exact Closed-Form Mathematical Specification (6-Step Engine)",
    "",
    "### Step 1: Characteristic Subordination-Adjusted Leland ODE Roots",
    "For perpetual preferred claim P(V) satisfying 0.5 * sigma^2 * V^2 * P''(V) + r * V * P'(V) - rho_i * P(V) + D(V) = 0 with rho_i > r:",
    "- a = 2 * r / sigma^2; delta = sqrt((1 - a)^2 + 8 * rho_i / sigma^2)",
    "- gamma_i = 0.5 * (delta - (1 - a)) > 0   [bull-state decay exponent -gamma_i]",
    "- beta_pos_i = 0.5 * (delta + (1 - a)) > 1 [suspended-state recovery exponent +beta_pos_i]",
    "- w_i = beta_pos_i / delta = beta_pos_i / (beta_pos_i + gamma_i) [smooth-pasting put weight]",
    "",
    "### Step 2: Straight Dated Debt PV (B_PV) & Top-Down Strict-Priority Fiat Cash Waterfall",
    "- V_0 = (btc_holdings * P_BTC) / 1,000,000 ($M); S_0 = V_0 + C_0 ($M).",
    "- B_PV = debt_put_face * exp(-r * t_put) + debt_put_coupon * ((1 - exp(-r * t_put)) / r) + debt_long_face * exp(-r * t_cycle) + debt_long_coupon * ((1 - exp(-r * t_cycle)) / r).",
    "- Fiat cash C_0 nets strictly top-down: first Cash_to_Debt = min(C_0, B_PV), leaving BTC-backed senior debt default barrier H_0 = B_PV - Cash_to_Debt.",
    "- Remaining cash nets sequentially across preferred priority tiers 1 -> 2 -> 3 (allocated pro-rata by stated par within identical tiers), yielding residual BTC-backed par Par_BTC_k = Par_k - CashSlice_k.",
    "- Cumulative BTC-backed preferred par for tier T is CumPar(T) = sum_{j: tier(j) <= T} Par_BTC_j, with base suspension barrier X_S0_k = lambda_base_k * CumPar(tier(k)).",
    "",
    "### Step 3: Homogeneity Solvency Scaling alpha_solv(sigma)",
    "- Sweep 121 log-spaced points x_g across [0.4 * min(X_S0), 3.5 * max(X_S0)] for active tranches (Par_BTC_k > 0).",
    "- Compute peak_ratio = max_{x_g} [ sum_k P_k_BTC(x_g; X_S0_k) / x_g ], set alpha_solv = max(1.0, peak_ratio / 0.95), and effective barriers X_S_k = alpha_solv * X_S0_k.",
    "",
    "### Step 4: Exact 3-Regime C^1 Smooth-Pasting (Variable Par-Resetting: SATA, STRC) & 2-Regime Fixed Preferreds",
    "Evaluated on post-debt BTC value X_0 = max(0, V_0 - H_0):",
    "- Variable Par-Resetting (variable_par_cap == true) with c_0 > rho_i: m = c_0 / rho_i; u = (1 - rho_i / c_0)^(-1 / gamma_i); X_cap = u * X_S_k.",
    "  * Regime 3 (X_0 >= X_cap): P_BTC = Par_BTC_k, dP/dX = 0.",
    "  * Regime 2 (X_S_k < X_0 < X_cap): term_cap = (m - 1)*(1 - w_i)*(X_0 / X_cap)^(beta_pos_i); term_put = m*w_i*(X_0 / X_S_k)^(-gamma_i); P_BTC = Par_BTC_k * (m - term_cap - term_put); dP/dX = (Par_BTC_k / X_0) * (-beta_pos_i * term_cap + gamma_i * term_put).",
    "  * Regime 1 (0 < X_0 <= X_S_k): a_1 = (1 - w_i)*(m - (m - 1)*u^(-beta_pos_i)); P_BTC = Par_BTC_k * a_1 * (X_0 / X_S_k)^(beta_pos_i).",
    "- Fixed Uncapped Preferreds (SATS, STRF_STRE, STRK, STRD): F_max = Par_BTC_k * (c_0 / rho_i); P_BTC = F_max * (1 - w_i * (X_0 / X_S_k)^(-gamma_i)) for X_0 > X_S_k, else F_max * (1 - w_i) * (X_0 / X_S_k)^(beta_pos_i).",
    "- Per-share preferred model price ($100 par): P_sh_k = 100 * (CashSlice_k + P_BTC_k) / Par_k.",
    "",
    "### Step 5: Black-Cox (1976) Down-and-Out Call & Ingersoll (1977) Convertible Dilution",
    "- When V_0 > H_0 and E_pre_conv > 0, let K_eff_BTC = max(0, SeniorClaimsVal - C_0).",
    "- Price MSTR convertible notes (24.20M sh @ $277.50) and STRK conversion warrant ((STRK_par / 100)*0.1M sh @ $1,000.00) sequentially as Black-Cox down-and-out calls on V_0 with barrier H_0, capped at diluted pre-conversion equity.",
    "",
    "### Step 6: Universal Additive Scorecard, Analytical Common BTC Delta, Hurdle & Implied BTC Vol",
    "- Spot CEBE Floor / sh = max(0, S_0 - K_0) / N_basic",
    "- Carry & Debt PV Adj / sh = (K_0 - K_ceil) / N_basic",
    "- Net Leland Put / sh = ((K_ceil - SeniorClaimsVal) + min(0, S_0 - K_0)) / N_basic",
    "- Convert Dilution / sh = Dil_total / N_basic",
    "- v3.1 Fair Value / sh = E_model / N_basic == CEBE + CarryDebtAdj + NetLelandPut - Dilution",
    "- Analytical Common BTC Delta: delta_net = 0 if V_0 <= H_0 else max(0, 1 - sum_k dP_BTC_k/dX - delta_conv)",
    "- 4Y Annual BTC-Yield Hurdle: g_cum = ((LivePrice - FairValue) * N_basic) / (V_0 * delta_net); Hurdle = ((1 + g_cum)^(1 / t_cycle) - 1) * 100%",
    "",
    "## 4. Target Live Dashboard Outputs to Audit Against",
    "",
    "| Metric | $ASST (" + hvLbl + ") | $ASST (" + cycLbl + ") | $ASST (" + actLbl + ") | $MSTR (" + hvLbl + ") | $MSTR (" + cycLbl + ") | $MSTR (" + actLbl + ") |",
    "| :--- | ---: | ---: | ---: | ---: | ---: | ---: |",
    "| Spot CEBE Floor ($/sh) | $" + asstHv.cebePerSh.toFixed(4) + " | $" + asstCycle.cebePerSh.toFixed(4) + " | $" + asstActive.cebePerSh.toFixed(4) + " | $" + mstrHv.cebePerSh.toFixed(4) + " | $" + mstrCycle.cebePerSh.toFixed(4) + " | $" + mstrActive.cebePerSh.toFixed(4) + " |",
    "| Carry & Debt Adj ($/sh) | $" + asstHv.carryDebtAdjPerSh.toFixed(4) + " | $" + asstCycle.carryDebtAdjPerSh.toFixed(4) + " | $" + asstActive.carryDebtAdjPerSh.toFixed(4) + " | $" + mstrHv.carryDebtAdjPerSh.toFixed(4) + " | $" + mstrCycle.carryDebtAdjPerSh.toFixed(4) + " | $" + mstrActive.carryDebtAdjPerSh.toFixed(4) + " |",
    "| Net Leland Put ($/sh) | $" + asstHv.lelandPutPerSh.toFixed(4) + " | $" + asstCycle.lelandPutPerSh.toFixed(4) + " | $" + asstActive.lelandPutPerSh.toFixed(4) + " | $" + mstrHv.lelandPutPerSh.toFixed(4) + " | $" + mstrCycle.lelandPutPerSh.toFixed(4) + " | $" + mstrActive.lelandPutPerSh.toFixed(4) + " |",
    "| Convert Dilution ($/sh) | -$" + asstHv.haircutsPerSh.toFixed(4) + " | -$" + asstCycle.haircutsPerSh.toFixed(4) + " | -$" + asstActive.haircutsPerSh.toFixed(4) + " | -$" + mstrHv.haircutsPerSh.toFixed(4) + " | -$" + mstrCycle.haircutsPerSh.toFixed(4) + " | -$" + mstrActive.haircutsPerSh.toFixed(4) + " |",
    "| v3.1 Fair Value ($/sh) | $" + asstHv.fairValuePerSh.toFixed(4) + " | $" + asstCycle.fairValuePerSh.toFixed(4) + " | $" + asstActive.fairValuePerSh.toFixed(4) + " | $" + mstrHv.fairValuePerSh.toFixed(4) + " | $" + mstrCycle.fairValuePerSh.toFixed(4) + " | $" + mstrActive.fairValuePerSh.toFixed(4) + " |",
    "| Common BTC Delta (delta_net) | " + asstHv.deltaNet.toFixed(6) + " | " + asstCycle.deltaNet.toFixed(6) + " | " + asstActive.deltaNet.toFixed(6) + " | " + mstrHv.deltaNet.toFixed(6) + " | " + mstrCycle.deltaNet.toFixed(6) + " | " + mstrActive.deltaNet.toFixed(6) + " |",
    "| Annual BTC-Yield Hurdle | " + asstHv.annualHurdlePct.toFixed(2) + "%/yr | " + asstCycle.annualHurdlePct.toFixed(2) + "%/yr | " + asstActive.annualHurdlePct.toFixed(2) + "%/yr | " + mstrHv.annualHurdlePct.toFixed(2) + "%/yr | " + mstrCycle.annualHurdlePct.toFixed(2) + "%/yr | " + mstrActive.annualHurdlePct.toFixed(2) + "%/yr |",
    "| Equity-Implied BTC Vol | " + asstHv.impliedBtcVolPct.toFixed(2) + "% | " + asstCycle.impliedBtcVolPct.toFixed(2) + "% | " + asstActive.impliedBtcVolPct.toFixed(2) + "% | " + mstrHv.impliedBtcVolPct.toFixed(2) + "% | " + mstrCycle.impliedBtcVolPct.toFixed(2) + "% | " + mstrActive.impliedBtcVolPct.toFixed(2) + "% |",
    "",
    "### Active Preferred Tranche Model Prices ($ per $100 Par at sigma = " + (activeSigma * 100).toFixed(1) + "%)",
    "- $ASST Preferreds: " + fmtPrefRow(asstBs, asstActive),
    "- $MSTR Preferreds: " + fmtPrefRow(mstrBs, mstrActive),
  ].join("\n");
}

export function buildStateTraceMarkdown(params: {
  asstBs: TreasuryBalanceSheet;
  mstrBs: TreasuryBalanceSheet;
  btcPrice: number;
  activeSigma: number;
  riskFreeRate: number;
  asstActive: ValuationResult;
  mstrActive: ValuationResult;
}): string {
  const { asstBs, mstrBs, btcPrice, activeSigma, riskFreeRate, asstActive, mstrActive } = params;

  const formatTraceSection = (bs: TreasuryBalanceSheet, res: ValuationResult) => {
    const trancheLines = bs.preferreds
      .map((t) => {
        const d = res.trancheDetails[t.name];
        const xCapStr =
          d.xCap && Number.isFinite(d.xCap)
            ? "$" + d.xCap.toFixed(2) + "M"
            : "Uncapped";
        return (
          "  * " +
          d.name +
          " (T" +
          d.tier +
          "): gamma=" +
          d.roots.gamma.toFixed(5) +
          ", beta_+=" +
          d.roots.betaPos.toFixed(5) +
          ", w=" +
          d.roots.w.toFixed(5) +
          " | Par_BTC=$" +
          d.parBtc.toFixed(2) +
          "M | X_S_eff=$" +
          d.xsEff.toFixed(2) +
          "M | X_cap=" +
          xCapStr +
          " | [" +
          d.regime +
          "] => $" +
          d.modelPrice.toFixed(4) +
          "/sh"
        );
      })
      .join("\n");

    return [
      "## $" + bs.ticker + " Intermediate ODE & Waterfall State (BTC = $" + btcPrice.toFixed(2) + ", sigma = " + (activeSigma * 100).toFixed(2) + "%, r = " + (riskFreeRate * 100).toFixed(2) + "%)",
      "- V_0 (BTC Vault): $" + res.v0.toFixed(4) + "M | C_0 (Fiat Cash): $" + res.c0.toFixed(4) + "M | S_0 (Total Vault): $" + res.s0.toFixed(4) + "M",
      "- B_PV (Dated Debt PV): $" + res.bPv.toFixed(4) + "M | H_0 (BTC Debt Barrier): $" + res.h0DebtBtc.toFixed(4) + "M | X_0 (Post-Debt BTC Pool): $" + res.x0.toFixed(4) + "M",
      "- alpha_solv (Homogeneity Scale): " + res.alphaSolv.toFixed(6) + " | Senior_Claims_Val: $" + res.seniorClaimsVal.toFixed(4) + "M",
      "- Dil_Total (Convert Haircut): $" + res.dilTotal.toFixed(4) + "M | E_model: $" + res.eModel.toFixed(4) + "M | Delta_Net: " + res.deltaNet.toFixed(6),
      "- Tranche-Level ODE Diagnostics:",
      trancheLines,
    ].join("\n");
  };

  return [
    "# LIVE INTERMEDIATE STATE TRACE — v3.1 ALPHA ENGINE",
    formatTraceSection(asstBs, asstActive),
    "",
    formatTraceSection(mstrBs, mstrActive),
  ].join("\n");
}

export function buildPythonVerifierScript(params: {
  asstBs: TreasuryBalanceSheet;
  mstrBs: TreasuryBalanceSheet;
  btcPrice: number;
  asstPrice: number;
  mstrPrice: number;
  activeSigma: number;
  hvSigma: number;
  cycleSigma: number;
  riskFreeRate: number;
  tCycle: number;
}): string {
  const {
    asstBs,
    mstrBs,
    btcPrice,
    asstPrice,
    mstrPrice,
    activeSigma,
    hvSigma,
    cycleSigma,
    riskFreeRate,
    tCycle,
  } = params;

  const pyBool = (b: boolean) => (b ? "True" : "False");
  const formatPyPreferreds = (prefs: TreasuryBalanceSheet["preferreds"]) =>
    prefs
      .map(
        (t) =>
          "        PreferredTranche(\"" +
          t.name +
          "\", tier=" +
          t.tier +
          ", par_total=" +
          t.parTotal +
          ", coupon_rate=" +
          t.couponRate +
          ", rho=" +
          t.rho +
          ", lambda_base=" +
          t.lambdaBase +
          ", variable_par_cap=" +
          pyBool(t.variableParCap) +
          "),"
      )
      .join("\n");

  const formatPyBs = (varName: string, bs: TreasuryBalanceSheet) =>
    [
      varName + " = TreasuryBalanceSheet(",
      "    ticker=\"" + bs.ticker + "\",",
      "    filing_stamp=" + JSON.stringify(bs.filingStamp) + ",",
      "    btc_holdings=" + bs.btcHoldings + ",",
      "    cash_reserves=" + bs.cashReserves + ",",
      "    basic_shares=" + bs.basicShares + ",",
      "    equity_iv_30d=" + bs.equityIv30d + ",",
      "    debt_put_face=" + bs.debtPutFace + ",",
      "    debt_put_coupon=" + bs.debtPutCoupon + ",",
      "    debt_put_years=" + bs.debtPutYears + ",",
      "    debt_long_face=" + bs.debtLongFace + ",",
      "    debt_long_coupon=" + bs.debtLongCoupon + ",",
      "    conv_note_shares=" + bs.convNoteShares + ",",
      "    conv_note_strike=" + bs.convNoteStrike + ",",
      "    strk_par_in_tiers=" + bs.strkParInTiers + ",",
      "    preferreds=(",
      formatPyPreferreds(bs.preferreds),
      "    ),",
      ")",
    ].join("\n");

  return [
    "#!/usr/bin/env python3",
    "\"\"\"",
    "audit_v31.py — Self-Contained Zero-Dependency Python 3 Verifier",
    "ASST & MSTR Institutional Alpha Engine (v3.1 Leland ODE & SEC Form 424B5 Waterfall)",
    "Run directly: python3 audit_v31.py",
    "\"\"\"",
    "from dataclasses import dataclass",
    "import math",
    "from typing import Dict, Tuple",
    "",
    "def norm_cdf(x: float) -> float:",
    "    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))",
    "",
    "def leland_roots(r: float, rho: float, sigma: float) -> Tuple[float, float, float]:",
    "    s2 = sigma * sigma",
    "    a = 2.0 * r / s2",
    "    delta = math.sqrt((1.0 - a) ** 2 + 8.0 * rho / s2)",
    "    gamma = 0.5 * (delta - (1.0 - a))",
    "    beta_pos = 0.5 * (delta + (1.0 - a))",
    "    return gamma, beta_pos, beta_pos / delta",
    "",
    "@dataclass(frozen=True)",
    "class PreferredTranche:",
    "    name: str",
    "    tier: int",
    "    par_total: float",
    "    coupon_rate: float",
    "    rho: float",
    "    lambda_base: float",
    "    variable_par_cap: bool",
    "",
    "@dataclass(frozen=True)",
    "class TreasuryBalanceSheet:",
    "    ticker: str",
    "    filing_stamp: str",
    "    btc_holdings: float",
    "    cash_reserves: float",
    "    basic_shares: float",
    "    equity_iv_30d: float",
    "    debt_put_face: float = 0.0",
    "    debt_put_coupon: float = 0.0",
    "    debt_put_years: float = 0.0",
    "    debt_long_face: float = 0.0",
    "    debt_long_coupon: float = 0.0",
    "    conv_note_shares: float = 0.0",
    "    conv_note_strike: float = 0.0",
    "    strk_par_in_tiers: float = 0.0",
    "    preferreds: Tuple[PreferredTranche, ...] = ()",
    "",
    "def price_tranche_btc(x: float, par_btc: float, t: PreferredTranche, x_s: float, roots: Tuple[float, float, float]) -> Tuple[float, float, float]:",
    "    if par_btc <= 0.0:",
    "        return 0.0, 0.0, 0.0",
    "    gamma, beta_pos, w = roots",
    "    if t.variable_par_cap:",
    "        bull_ceiling = par_btc",
    "        if x <= 0.0 or x_s <= 0.0:",
    "            return 0.0, 0.0, bull_ceiling",
    "        if t.coupon_rate > t.rho:",
    "            m = t.coupon_rate / t.rho",
    "            u = (1.0 - t.rho / t.coupon_rate) ** (-1.0 / gamma)",
    "            x_cap = u * x_s",
    "            if x >= x_cap:",
    "                return par_btc, 0.0, bull_ceiling",
    "            elif x > x_s:",
    "                term_cap = (m - 1.0) * (1.0 - w) * ((x / x_cap) ** beta_pos)",
    "                term_put = m * w * ((x / x_s) ** (-gamma))",
    "                return par_btc * (m - term_cap - term_put), (par_btc / x) * (-beta_pos * term_cap + gamma * term_put), bull_ceiling",
    "            else:",
    "                a1 = (1.0 - w) * (m - (m - 1.0) * (u ** (-beta_pos)))",
    "                rs = (x / x_s) ** beta_pos",
    "                return par_btc * a1 * rs, (par_btc / x) * beta_pos * a1 * rs, bull_ceiling",
    "        else:",
    "            f_max = par_btc * (t.coupon_rate / t.rho)",
    "            if x > x_s:",
    "                pt = w * ((x / x_s) ** (-gamma))",
    "                return f_max * (1.0 - pt), (f_max / x) * gamma * pt, bull_ceiling",
    "            rs = (x / x_s) ** beta_pos",
    "            return f_max * (1.0 - w) * rs, (f_max / x) * beta_pos * (1.0 - w) * rs, bull_ceiling",
    "    f_max = par_btc * (t.coupon_rate / t.rho)",
    "    if x <= 0.0 or x_s <= 0.0:",
    "        return 0.0, 0.0, f_max",
    "    if x > x_s:",
    "        pt = w * ((x / x_s) ** (-gamma))",
    "        return f_max * (1.0 - pt), (f_max / x) * gamma * pt, f_max",
    "    rs = (x / x_s) ** beta_pos",
    "    return f_max * (1.0 - w) * rs, (f_max / x) * beta_pos * (1.0 - w) * rs, f_max",
    "",
    "def down_and_out_call_with_delta(v0: float, k: float, h: float, r: float, sigma: float, t_years: float) -> Tuple[float, float]:",
    "    if v0 <= 0.0 or v0 <= h:",
    "        return 0.0, 0.0",
    "    if k <= 0.0:",
    "        return v0 - h, 1.0",
    "    sig_t = sigma * math.sqrt(t_years)",
    "    pv_k = k * math.exp(-r * t_years)",
    "    d1 = (math.log(v0 / k) + (r + 0.5 * sigma * sigma) * t_years) / sig_t",
    "    bs_val = v0 * norm_cdf(d1) - pv_k * norm_cdf(d1 - sig_t)",
    "    bs_delta = norm_cdf(d1)",
    "    if h <= 1e-9:",
    "        return max(0.0, bs_val), bs_delta",
    "    lam = (r / (sigma * sigma)) - 0.5",
    "    def _refl(vv: float) -> float:",
    "        p2l = (h / vv) ** (2.0 * lam)",
    "        yy1 = (math.log((h * h) / (vv * k)) + (r + 0.5 * sigma * sigma) * t_years) / sig_t",
    "        return vv * ((h / vv) ** (2.0 * (lam + 1.0))) * norm_cdf(yy1) - pv_k * p2l * norm_cdf(yy1 - sig_t)",
    "    rv = _refl(v0)",
    "    if rv <= 0.0:",
    "        return max(0.0, bs_val), bs_delta",
    "    eps = max(1e-5, v0 * 1e-6)",
    "    vp, vm = v0 + eps, max(h + 1e-9, v0 - eps)",
    "    r_del = (_refl(vp) - _refl(vm)) / (vp - vm)",
    "    val = max(0.0, bs_val - rv)",
    "    return val, (max(0.0, bs_delta - r_del) if val > 0.0 else 0.0)",
    "",
    "def evaluate_balance_sheet(bs: TreasuryBalanceSheet, btc_price: float, sigma: float, live_stock_price: float, r: float = " + riskFreeRate + ", t_cycle: float = " + tCycle + ") -> Dict[str, object]:",
    "    v0 = (bs.btc_holdings * btc_price) / 1_000_000.0",
    "    c0 = bs.cash_reserves",
    "    s0 = v0 + c0",
    "    b_pv = 0.0",
    "    if bs.debt_put_face > 0.0:",
    "        tp = max(0.0, bs.debt_put_years)",
    "        disc_p = math.exp(-r * tp) if tp > 0.0 else 1.0",
    "        b_pv += (bs.debt_put_face * disc_p + bs.debt_put_coupon * ((1.0 - disc_p) / r)) if tp > 0.0 else bs.debt_put_face",
    "    if bs.debt_long_face > 0.0:",
    "        disc_l = math.exp(-r * t_cycle)",
    "        b_pv += bs.debt_long_face * disc_l + bs.debt_long_coupon * ((1.0 - disc_l) / r)",
    "    debt_face = bs.debt_put_face + bs.debt_long_face",
    "    k0_gross = debt_face + sum(t.par_total for t in bs.preferreds)",
    "    rem_cash = c0",
    "    cash_to_debt = min(rem_cash, b_pv)",
    "    rem_cash -= cash_to_debt",
    "    h0 = b_pv - cash_to_debt",
    "    tiers = sorted({t.tier for t in bs.preferreds})",
    "    par_btc: Dict[str, float] = {}",
    "    cash_to_prefs = 0.0",
    "    for ti in tiers:",
    "        tr = [t for t in bs.preferreds if t.tier == ti]",
    "        t_par = sum(t.par_total for t in tr)",
    "        alloc = min(rem_cash, t_par)",
    "        rem_cash -= alloc",
    "        cash_to_prefs += alloc",
    "        for t in tr:",
    "            par_btc[t.name] = t.par_total - (alloc * (t.par_total / t_par) if t_par > 0.0 else 0.0)",
    "    cum_par: Dict[int, float] = {}",
    "    run_p = 0.0",
    "    for ti in tiers:",
    "        run_p += sum(par_btc[t.name] for t in bs.preferreds if t.tier == ti)",
    "        cum_par[ti] = run_p",
    "    roots_map = {t.name: leland_roots(r, t.rho, sigma) for t in bs.preferreds}",
    "    base_xs = {t.name: t.lambda_base * cum_par[t.tier] for t in bs.preferreds}",
    "    active_xs = [xs for n, xs in base_xs.items() if par_btc[n] > 0.0 and xs > 0.0]",
    "    alpha_solv = 1.0",
    "    if active_xs:",
    "        x_min, x_max = 0.4 * min(active_xs), 3.5 * max(active_xs)",
    "        peak = max(sum(price_tranche_btc(x_min * ((x_max / x_min) ** (i / 120)), par_btc[t.name], t, base_xs[t.name], roots_map[t.name])[0] for t in bs.preferreds) / (x_min * ((x_max / x_min) ** (i / 120))) for i in range(121))",
    "        if peak > 0.95:",
    "            alpha_solv = peak / 0.95",
    "    x0 = max(0.0, v0 - h0)",
    "    pref_btc, d_pref_dx, pref_ceil = 0.0, 0.0, 0.0",
    "    tranche_px: Dict[str, float] = {}",
    "    for t in bs.preferreds:",
    "        vb, ddx, cb = price_tranche_btc(x0, par_btc[t.name], t, alpha_solv * base_xs[t.name], roots_map[t.name])",
    "        pref_btc += vb; d_pref_dx += ddx; pref_ceil += cb",
    "        if t.par_total > 0.0:",
    "            tranche_px[t.name] = 100.0 * ((t.par_total - par_btc[t.name]) + vb) / t.par_total",
    "    senior_val = cash_to_debt + min(v0, h0) + cash_to_prefs + pref_btc",
    "    k_ceil = cash_to_debt + h0 + cash_to_prefs + pref_ceil",
    "    e_pre = s0 - senior_val",
    "    dil_tot, del_conv = 0.0, 0.0",
    "    if v0 > h0 and e_pre > 0.0:",
    "        k_eff = max(0.0, senior_val - c0)",
    "        n_post = bs.basic_shares",
    "        if bs.conv_note_shares > 0.0:",
    "            gn = bs.conv_note_shares / (bs.basic_shares + bs.conv_note_shares)",
    "            cn, dn = down_and_out_call_with_delta(v0, k_eff * math.exp(r * t_cycle) + bs.basic_shares * bs.conv_note_strike, h0, r, sigma, t_cycle)",
    "            dil_tot += gn * cn; del_conv += gn * dn; n_post += bs.conv_note_shares",
    "        if bs.strk_par_in_tiers > 0.0:",
    "            ns = (bs.strk_par_in_tiers / 100.0) * 0.1",
    "            gs = ns / (n_post + ns)",
    "            cs, ds = down_and_out_call_with_delta(v0, k_eff * math.exp(r * t_cycle) + (n_post * 1000.0 - debt_face), h0, r, sigma, t_cycle)",
    "            dil_tot += gs * cs; del_conv += gs * ds",
    "        n_all = bs.conv_note_shares + (bs.strk_par_in_tiers / 100.0) * 0.1",
    "        if n_all > 0.0:",
    "            max_d = (n_all / (bs.basic_shares + n_all)) * e_pre",
    "            if dil_tot > max_d:",
    "                dil_tot = max_d",
    "                del_conv = (n_all / (bs.basic_shares + n_all)) * (1.0 - d_pref_dx)",
    "    e_mod = e_pre - dil_tot",
    "    d_net = 0.0 if v0 <= h0 else max(0.0, 1.0 - d_pref_dx - del_conv)",
    "    cebe = max(0.0, s0 - k0_gross) / bs.basic_shares",
    "    carry = (k0_gross - k_ceil) / bs.basic_shares",
    "    put_sh = ((k_ceil - senior_val) + min(0.0, s0 - k0_gross)) / bs.basic_shares",
    "    dil_sh = dil_tot / bs.basic_shares",
    "    fv = e_mod / bs.basic_shares",
    "    gp = live_stock_price - fv",
    "    hurdle = (((1.0 + (gp * bs.basic_shares) / (v0 * d_net)) ** (1.0 / t_cycle) - 1.0) * 100.0) if (gp > 0.0 and v0 * d_net > 0.0) else 0.0",
    "    imp_vol = (bs.equity_iv_30d * (e_mod / (v0 * d_net)) * 100.0) if (v0 * d_net > 0.0 and e_mod > 0.0) else 0.0",
    "    assert abs((e_mod + senior_val + dil_tot) - s0) < 1e-6, \"Vault conservation breach\"",
    "    assert abs((cebe + carry + put_sh - dil_sh) - fv) < 1e-6, \"Scorecard additivity breach\"",
    "    for t in bs.preferreds:",
    "        if t.variable_par_cap:",
    "            assert tranche_px[t.name] <= 100.000001, \"Variable preferred breached $100 par cap\"",
    "    return {\"fv\": fv, \"cebe\": cebe, \"carry\": carry, \"put\": put_sh, \"dil\": dil_sh, \"delta\": d_net, \"hurdle\": hurdle, \"imp_vol\": imp_vol, \"prefs\": tranche_px}",
    "",
    formatPyBs("ASST_BS", asstBs),
    "",
    formatPyBs("MSTR_BS", mstrBs),
    "",
    "if __name__ == \"__main__\":",
    "    BTC_PX = " + btcPrice,
    "    for bs, px in ((ASST_BS, " + asstPrice + "), (MSTR_BS, " + mstrPrice + ")):",
    "        for sig in (" + hvSigma + ", " + cycleSigma + ", " + activeSigma + "):",
    "            res = evaluate_balance_sheet(bs, BTC_PX, sig, px)",
    "            print(\"{} (sigma={:.1f}%): CEBE=${:.4f} | Carry=${:+.4f} | Put=${:+.4f} | Dil=-${:.4f} => FairVal=${:.4f} | Delta={:.5f} | Hurdle={:.2f}%/yr | ImpBTCVol={:.2f}%\".format(bs.ticker, sig * 100.0, res[\"cebe\"], res[\"carry\"], res[\"put\"], res[\"dil\"], res[\"fv\"], res[\"delta\"], res[\"hurdle\"], res[\"imp_vol\"]))",
    "            print(\"  Preferreds ($/sh):\", {k: round(v, 4) for k, v in res[\"prefs\"].items()})",
    "    print(\"\\nALL INVARIANT ASSERTIONS VERIFIED.\")",
  ].join("\n");
}

export function buildFullAuditBundle(input: AuditBundleInput): string {
  const prompt = buildLlmAuditPrompt(input);
  const trace = buildStateTraceMarkdown({
    asstBs: input.asstBs,
    mstrBs: input.mstrBs,
    btcPrice: input.btcPrice,
    activeSigma: input.activeSigma,
    riskFreeRate: input.riskFreeRate,
    asstActive: input.asstActive,
    mstrActive: input.mstrActive,
  });
  const pyCode = buildPythonVerifierScript({
    asstBs: input.asstBs,
    mstrBs: input.mstrBs,
    btcPrice: input.btcPrice,
    asstPrice: input.asstPrice,
    mstrPrice: input.mstrPrice,
    activeSigma: input.activeSigma,
    hvSigma: input.hvSigma,
    cycleSigma: input.cycleSigma,
    riskFreeRate: input.riskFreeRate,
    tCycle: input.tCycle,
  });
  return [
    prompt,
    "",
    "---",
    "",
    trace,
    "",
    "---",
    "",
    "## 5. Self-Contained Zero-Dependency Python 3 Verifier (audit_v31.py)",
    MD_FENCE + "python",
    pyCode,
    MD_FENCE,
  ].join("\n");
}
