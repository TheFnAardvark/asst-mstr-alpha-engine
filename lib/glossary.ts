export interface GlossaryEntry {
  term: string;
  mathName: string;
  plainEnglish: string;
  whyItMatters: string;
  underTheHood: string;
}

export const GLOSSARY = {
  // --- Header & Volatility Controls ---
  vol_1y_hv: {
    term: "1-Year BTC Volatility",
    mathName: "1Y Historical Volatility (HV)",
    plainEnglish:
      "How wildly Bitcoin has actually swung over the past 12 months, expressed as an annualized percentage.",
    whyItMatters:
      "Higher volatility makes downside safety cushions and convertible stock options worth more—which directly shifts the model's Fair Value.",
    underTheHood:
      "Feeds sigma (σ) into the Leland preferred stock pricing equations and Black-Cox convertible option formulas.",
  },
  vol_cycle: {
    term: "Cycle Volatility",
    mathName: "Cycle Anchor Volatility (50% σ)",
    plainEnglish:
      "A steadier, long-term Bitcoin volatility benchmark meant to smooth out quiet or overly chaotic short-term market patches.",
    whyItMatters:
      "Lets you compare today's valuation against a normalized multi-year Bitcoin market instead of reacting to last month's chop.",
    underTheHood:
      "Sets σ to the configured cycle anchor (default 50.0%) across all preferred tranches and convertible dilution checks.",
  },
  vol_custom: {
    term: "Custom Volatility",
    mathName: "User-Defined Sigma (σ)",
    plainEnglish:
      "Your own assumption for how volatile Bitcoin will be going forward, controlled from the Stress-Test drawer.",
    whyItMatters:
      "Great for testing what happens to Fair Value and preferred stock prices if Bitcoin enters a sleepy bull grind or a chaotic crash.",
    underTheHood:
      "Overrides the default σ input locally in your browser without changing any saved server settings.",
  },
  risk_free_rate: {
    term: "Risk-Free Rate",
    mathName: "Discount Rate (r)",
    plainEnglish:
      "The baseline interest rate you could earn on safe U.S. Treasuries with virtually zero default risk.",
    whyItMatters:
      "Used to figure out what future debt payments and fixed cash flows are worth in today's dollars.",
    underTheHood:
      "Continuous discount rate r (default 4.50%) applied to debt present values, Leland ODE roots, and convertible call pricing.",
  },
  cycle_horizon: {
    term: "Cycle Horizon",
    mathName: "Evaluation Horizon (T)",
    plainEnglish:
      "The number of years (default 4 years) used to measure how fast a company needs to grow its Bitcoin per share.",
    whyItMatters:
      "Spreads any current stock market premium over a full Bitcoin market cycle so you can see the annual growth rate required to earn it back.",
    underTheHood:
      "Sets T (default 4.0 years) for long-term debt discounting, convertible option maturity, and annual BTC-yield hurdle compounding.",
  },

  // --- Hero Cards & Core Metrics ---
  simple_mnav: {
    term: "Simple mNAV",
    mathName: "Enterprise Value / BTC Reserve Multiple",
    plainEnglish:
      "A quick ballpark ratio showing how much the market is paying for the entire company (stock + debt + preferreds, minus cash) compared to the value of its Bitcoin stack.",
    whyItMatters:
      "At 1.00x, you are effectively paying face value for the Bitcoin vault. Above 1.00x means you're paying a premium; below 1.00x means a discount. Simple mNAV ignores nuances like cheap debt or dividend-pause safety valves—which is why this app calculates a deeper Model Fair Value.",
    underTheHood:
      "(Stock Market Cap + Debt Face Value + Preferred Face Value − Cash) ÷ Market Value of BTC Holdings.",
  },
  fair_value: {
    term: "Model Fair Value",
    mathName: "v3.1 Structural Fair Value",
    plainEnglish:
      "What one share of common stock is worth today based purely on the company's current Bitcoin, cash, debt terms, preferred stock rules, and convertible share dilution—assuming zero future Bitcoin-per-share growth.",
    whyItMatters:
      "Acts as your grounded valuation anchor. Comparing the live stock price against Model Fair Value shows how much future growth the market is already pricing in.",
    underTheHood:
      "Hard Floor (CEBE) + Debt & Dividend Rate Adj + Downside Safety Cushion − Convertible Dilution.",
  },
  cebe: {
    term: "Hard Liquidation Floor (CEBE)",
    mathName: "Spot Common Equity Bitcoin Equivalent (CEBE)",
    plainEnglish:
      "What each common share would be worth if the company sold all its Bitcoin today, combined it with cash on hand, and paid off every dollar of debt and preferred stock at full face value.",
    whyItMatters:
      "Shows the strictest, no-frills asset backing per share. If debt and preferred face value exceed total assets, this hard floor hits $0.00—even if the stock still has real survival option value.",
    underTheHood:
      "max(0, BTC Market Value + Cash − Total Debt Face − Total Preferred Par) ÷ Basic Common Shares.",
  },
  growth_premium: {
    term: "Growth Premium",
    mathName: "Market Price − Model Fair Value",
    plainEnglish:
      "The extra dollar amount per share the stock market is charging above the company's static Model Fair Value (or the discount if it's negative).",
    whyItMatters:
      "When positive, you are paying up front for management's ability to accretively grow Bitcoin per share. When negative, the market is pricing the stock at a discount to its structural value.",
    underTheHood: "Live Stock Price − Model Fair Value per basic share.",
  },
  amplification: {
    term: "Amplification Ratio",
    mathName: "Gross Leverage Amplification (K₀ / V₀)",
    plainEnglish:
      "Total debt and preferred stock face value measured as a percentage of the company's Bitcoin holdings. Think of it as how much extra capital is stacked on top of the vault to turbocharge common shareholder exposure.",
    whyItMatters:
      "Higher amplification gives common shareholders more upside leverage when Bitcoin rallies, but also creates heavier senior obligations if Bitcoin drops. Notice that when Bitcoin rises, this percentage naturally shrinks.",
    underTheHood:
      "((Total Debt Face + Total Preferred Stated Par) ÷ BTC Market Value) × 100% (Strive standard formula).",
  },
  net_amplification: {
    term: "Ex-Cash Amplification",
    mathName: "Net Leverage Amplification (max(0, K₀ − C₀) / V₀)",
    plainEnglish:
      "The same Amplification Ratio, except it subtracts the company's cash reserves first—showing only the debt and preferred obligations that actually rely on Bitcoin for backing.",
    whyItMatters:
      "Cash sitting on the balance sheet acts like a shock absorber. A company with lots of cash has far less real-world risk than its gross headline leverage makes it look.",
    underTheHood:
      "(max(0, Debt Face + Preferred Par − Cash Reserves) ÷ BTC Market Value) × 100%.",
  },
  btc_yield_hurdle: {
    term: "Required BTC Growth",
    mathName: "Annual Implied BTC-Yield Hurdle",
    plainEnglish:
      "The annual percentage rate at which the company must grow its Bitcoin per share over the 4-year cycle just to justify today's stock price.",
    whyItMatters:
      "Turns an abstract stock premium into a clear performance bar. If the hurdle is 0%, the stock is already priced at or below Fair Value. If it's 25%/yr, management has to hustle hard to earn that price tag.",
    underTheHood:
      "Solves ((1 + (Growth Premium × Basic Shares) ÷ (BTC Value × Net Delta))^(1/T) − 1) × 100%.",
  },
  unencumbered_sats: {
    term: "Unencumbered Sats / Share",
    mathName: "Net Common Satoshis per Basic Share",
    plainEnglish:
      "The number of debt-free satoshis (100 million sats = 1 BTC) truly belonging to each share of common stock after setting aside enough assets to pay off all debt and preferred stock at full face value.",
    whyItMatters:
      "Headline 'BTC per share' can be misleading if a company borrowed heavily to buy that Bitcoin. Unencumbered sats show what common shareholders actually own free and clear today.",
    underTheHood:
      "(Hard Floor CEBE per share ÷ BTC Spot Price) × 100,000,000 sats.",
  },
  raw_sats: {
    term: "Gross Vault Sats / Share",
    mathName: "Raw Unadjusted Satoshis per Basic Share",
    plainEnglish:
      "Total Bitcoin sitting in the company's vault divided by basic common shares—before subtracting any debt or preferred stock claims.",
    whyItMatters:
      "Represents the theoretical ceiling of sats per share if Bitcoin moons high enough that fixed-dollar debt and preferred claims shrink to almost nothing.",
    underTheHood: "(Total BTC Holdings ÷ Basic Shares) × 100,000,000 sats.",
  },
  delta_net: {
    term: "BTC Sensitivity (Delta)",
    mathName: "Analytical Net Common Delta (Δ_net)",
    plainEnglish:
      "How many cents common equity value gains (or loses) for every $1.00 move in the company's Bitcoin vault.",
    whyItMatters:
      "At 1.00, common shareholders capture 100% of every dollar Bitcoin moves. Below 1.00 means some of that move is being shared with preferred holders (recovering toward $100 par) or convertible holders (gaining option value).",
    underTheHood:
      "1 − Σ(Preferred Value Sensitivity dP/dX) − Convertible Call Delta; equals 0 if BTC falls below the senior debt barrier.",
  },
  implied_btc_vol: {
    term: "Options-Implied BTC Vol",
    mathName: "Equity-Implied Unlevered BTC Volatility",
    plainEnglish:
      "Takes the stock's 30-day options implied volatility and strips out the company's leverage to reveal how much Bitcoin volatility stock options traders are implicitly betting on.",
    whyItMatters:
      "Helps you spot when stock options are pricing in way more (or way less) Bitcoin movement than Bitcoin's own market.",
    underTheHood:
      "30D Stock Options IV × (Modeled Common Equity ÷ (BTC Value × Net Delta)).",
  },

  // --- Scorecard Breakdown Rows ---
  carry_debt_adj: {
    term: "Debt & Dividend Rate Adjustment",
    mathName: "Perpetual Carry & Straight Debt PV Adjustment",
    plainEnglish:
      "Adjusts Fair Value up or down based on how cheap or expensive the company's debt and preferred stock dividend rates are compared to fair market risk rates.",
    whyItMatters:
      "Positive (+$) means cheap financing is a gift to common shareholders—like low-interest convertible notes or 8% STRK preferreds. Negative (−$) means high uncapped dividend rates (like 15% SATS) create a permanent drag.",
    underTheHood:
      "(Gross Debt & Preferred Face Value − Debt Present Value − Preferred Bull-Market Ceilings) ÷ Basic Shares.",
  },
  leland_put: {
    term: "Downside Safety Cushion (Leland Put)",
    mathName: "3-Regime Smooth-Pasting Leland (1994) Suspension Put",
    plainEnglish:
      "Unlike bank debt—which can force bankruptcy if you miss a payment—perpetual preferred stock lets the company pause dividends during a severe Bitcoin crash. This line puts a dollar value on that built-in survival cushion.",
    whyItMatters:
      "It's the reason common stock still holds real option value during brutal drawdowns instead of instantly wiping out when asset value dips near face value.",
    underTheHood:
      "(Preferred Bull Ceilings − Modeled Senior Claims + min(0, Vault Assets − Gross Face)) ÷ Basic Shares.",
  },
  convert_dilution: {
    term: "Convertible Share Dilution",
    mathName: "Black-Cox Barrier & Ingersoll Convertible Haircut",
    plainEnglish:
      "The estimated value of the 'upside tickets' held by convertible bondholders and convertible preferred (STRK) holders who can swap into new common shares if the stock rips higher.",
    whyItMatters:
      "Even if those bonds aren't in the money today, their conversion option slices a piece off common shareholders' future upside—so the model subtracts its fair option value right now.",
    underTheHood:
      "Sequential down-and-out call option values (knocked out if BTC breaches senior debt barrier H₀) for convertible notes and STRK, capped at maximum diluted ownership share.",
  },

  // --- Charts & Yield Tab ---
  yield_cone: {
    term: "4-Year BTC-per-Share Growth Cone",
    mathName: "Market-Implied Unencumbered Sats Trajectory",
    plainEnglish:
      "Maps out the exact compounding path of debt-free sats per share the company has to climb over the next 4 years to grow into today's stock price.",
    whyItMatters:
      "Lets you visually compare what the market is demanding against clean 10%/yr and 20%/yr benchmark tracks.",
    underTheHood:
      "Compounds Year-0 Unencumbered Sats/Share at the Annual Required BTC Growth rate across 0.5-year steps.",
  },
  de_encumbrance: {
    term: "Bull-Market De-Encumbrance",
    mathName: "Fixed-Dollar Senior Claim Compression",
    plainEnglish:
      "Because debt and preferred stock are owed in fixed U.S. dollars, a rising Bitcoin price means it takes fewer and fewer coins to pay them off—automatically freeing up more sats per share for common stockholders.",
    whyItMatters:
      "Shows the built-in tailwind of Bitcoin treasuries: even without issuing a single share, your debt-free sats per share climb as Bitcoin rises, while leverage naturally cools down.",
    underTheHood:
      "Sweeps BTC spot price from $10k to $200k holding balance sheets constant and recomputes Unencumbered Sats, Amplification, and Model Fair Value at each step.",
  },

  // --- Preferred Stock Waterfall Tab ---
  cash_reserve: {
    term: "Cash on Hand",
    mathName: "Fiat Cash Reserve (C₀)",
    plainEnglish:
      "Total U.S. dollar cash and equivalents sitting on the balance sheet.",
    whyItMatters:
      "In the model's priority waterfall, cash absorbs the safest senior claims first—shrinking how much Bitcoin has to be tied up backing debt or preferreds.",
    underTheHood: "C₀ in $ millions from the latest SEC Form 8-K baseline.",
  },
  cash_to_debt: {
    term: "Cash Covering Debt",
    mathName: "Waterfall Allocation to Senior Debt PV",
    plainEnglish:
      "How much of the company's cash reserve goes toward covering the present value of senior debt obligations first.",
    whyItMatters:
      "Every dollar of debt covered by cash is one less dollar of bankruptcy risk hanging over the Bitcoin vault.",
    underTheHood: "min(Cash Reserves C₀, Present Value of Senior Debt B_PV).",
  },
  cash_to_prefs: {
    term: "Cash Covering Preferreds",
    mathName: "Waterfall Allocation to Senior Preferred Tiers",
    plainEnglish:
      "Any leftover cash remaining after covering senior debt flows down to back the highest-ranking preferred stock tiers dollar-for-dollar.",
    whyItMatters:
      "Reduces the Bitcoin-backed exposure of top-tier preferred stock, making those tranches safer and closer to $100 par.",
    underTheHood:
      "Remaining cash allocated strictly from Tier 1 downward, pro-rata within equal tiers.",
  },
  debt_barrier: {
    term: "BTC Needed for Debt",
    mathName: "Senior Debt Default Barrier (H₀)",
    plainEnglish:
      "The dollar value of senior debt that isn't covered by cash and therefore must be backed by the Bitcoin stack.",
    whyItMatters:
      "This is the hard survival line. If the market value of the company's Bitcoin drops below this level, debt holders claim the vault and common stock drops to $0.",
    underTheHood: "H₀ = max(0, Debt Present Value B_PV − Cash Allocated to Debt).",
  },
  post_debt_pool: {
    term: "BTC Left for Prefs & Common",
    mathName: "Post-Debt Bitcoin Asset Pool (X₀)",
    plainEnglish:
      "The market value of the Bitcoin vault remaining after subtracting the BTC needed to cover senior debt.",
    whyItMatters:
      "This is the actual pool of Bitcoin that preferred stockholders and common stockholders share—and it drives every preferred stock's current price and status.",
    underTheHood: "X₀ = max(0, BTC Market Value V₀ − Senior Debt Barrier H₀).",
  },
  senior_claims_val: {
    term: "Modeled Senior Claims",
    mathName: "Total Modeled Value of Debt + Preferreds",
    plainEnglish:
      "What the model estimates all debt and preferred stock tranches are worth combined at today's Bitcoin price and volatility.",
    whyItMatters:
      "Subtracting this (plus convertible dilution) from total vault assets gives you total common equity value.",
    underTheHood:
      "Cash to Debt + BTC Debt Value + Cash to Prefs + Σ(Modeled BTC Preferred Tranches).",
  },
  solvency_buffer: {
    term: "Solvency Buffer",
    mathName: "Homogeneity Solvency Scaling Factor (α_solv)",
    plainEnglish:
      "An automatic math guardrail that prevents all preferred stock tiers combined from ever being valued at more than 95% of the available Bitcoin pool.",
    whyItMatters:
      "Guarantees common stock obeys real-world limited liability and never prints an impossible negative value, even in extreme crashes.",
    underTheHood:
      "Scales dividend pause triggers by α_solv(σ) ≥ 1.0 whenever unscaled preferred value exceeds 95% of X across a 120-point sweep.",
  },
  btc_backed_par: {
    term: "BTC-Backed Par",
    mathName: "Post-Cash Preferred Face Value (Par_BTC)",
    plainEnglish:
      "The slice of a preferred stock's face value that relies on the Bitcoin vault rather than cash on hand.",
    whyItMatters:
      "Only the Bitcoin-backed portion fluctuates with Bitcoin's price; any cash-backed slice is treated as risk-free.",
    underTheHood: "Tranche Total Par − Pro-Rata Cash Waterfall Slice.",
  },
  coupon_vs_rho: {
    term: "Dividend / Risk Rate",
    mathName: "Stated Coupon (c₀) vs. Subordinated Discount Rate (ρᵢ)",
    plainEnglish:
      "Compares the annual dividend rate printed on the preferred stock against the return investors demand for taking on its tier of credit risk.",
    whyItMatters:
      "If the dividend is higher than the risk rate, an uncapped preferred can trade above $100 in a bull market—unless it has a variable rate-reset cap that pins it at $100.",
    underTheHood:
      "Ratio m = c₀ / ρᵢ determines the uncapped bull ceiling (or activates 3-regime $100 par-pinning for variable-rate tranches).",
  },
  pause_trigger: {
    term: "Pause Trigger",
    mathName: "Effective Dividend-Suspension Barrier (X_S)",
    plainEnglish:
      "The post-debt Bitcoin pool size ($M) below which management would optimally pause preferred dividends to protect the company's survival.",
    whyItMatters:
      "Higher-ranking tiers have much lower pause triggers (safer), while junior tiers get paused much earlier in a bear market.",
    underTheHood:
      "X_S_eff = α_solv × λ_base × Cumulative BTC-Backed Par through that tier.",
  },
  cap_trigger: {
    term: "$100 Cap Trigger",
    mathName: "Upper Par-Pinning Boundary (X_cap)",
    plainEnglish:
      "For variable-rate preferreds (SATA and STRC), this is the Bitcoin pool size where management can simply dial the dividend rate down to keep the stock trading cleanly at $100.00.",
    whyItMatters:
      "Once the vault passes this line, all additional Bitcoin upside flows 100% to common shareholders instead of leaking into preferred stock price gains.",
    underTheHood:
      "X_cap = (1 − ρᵢ / c₀)^(-1/γᵢ) × X_S_eff, enforced with C¹ smooth-pasting (zero slope kink at $100).",
  },
  pref_regime: {
    term: "Current Status",
    mathName: "Active Leland ODE Regime",
    plainEnglish:
      "Shows which economic zone a preferred stock is sitting in right now based on today's Bitcoin price.",
    whyItMatters:
      "Quickly tells you whether a preferred is safely pinned at $100, floating in its middle transition zone, or distressed enough that dividends are at risk of pausing.",
    underTheHood:
      "Maps X₀ relative to X_S and X_cap across the 2-regime uncapped or 3-regime par-capped analytical solutions.",
  },
  strk_hybrid: {
    term: "+ Conversion Option (STRK)",
    mathName: "Hybrid Convertible Preferred Value",
    plainEnglish:
      "STRK is both an 8% preferred stock AND a long-term option to convert into MSTR common stock at $1,000/sh. The top number is the bond-like floor; '+ Conversion' adds that stock option.",
    whyItMatters:
      "Helps you compare STRK's live market price against both its pure income value and its full convertible value.",
    underTheHood:
      "Straight preferred model price + (STRK Black-Cox conversion dilution ÷ STRK share count).",
  },

  // --- Balance Sheet & Math Checks Tab ---
  bs_btc_holdings: {
    term: "Bitcoin Holdings (BTC)",
    mathName: "Vault BTC Balance (btc_holdings)",
    plainEnglish:
      "Total number of Bitcoin held in the company's corporate treasury from its latest SEC filing.",
    whyItMatters:
      "The foundation of the entire valuation. Edit this locally to test what happens after a big BTC purchase.",
    underTheHood: "V₀ ($M) = (btcHoldings × BTC Spot Price) ÷ 1,000,000.",
  },
  bs_cash_reserves: {
    term: "Cash Reserves ($M)",
    mathName: "Fiat Cash Balance (cash_reserves)",
    plainEnglish:
      "Cash and cash equivalents on hand, in millions of dollars.",
    whyItMatters:
      "Protects debt and top-tier preferreds first, lowering Ex-Cash Amplification and senior debt risk.",
    underTheHood: "Enters the top of the priority waterfall as C₀.",
  },
  bs_basic_shares: {
    term: "Basic Common Shares (M)",
    mathName: "Basic Shares Outstanding (basic_shares)",
    plainEnglish:
      "Total common stock shares currently outstanding (in millions), before counting unexercised convertible bonds or convertible preferreds.",
    whyItMatters:
      "Divides total common equity value into per-share numbers. The model handles convertible share dilution separately so nothing gets double-counted.",
    underTheHood:
      "Used as the denominator for Model Fair Value, Hard Floor (CEBE), and Sats/Share.",
  },
  bs_equity_iv: {
    term: "30-Day Stock Options Vol",
    mathName: "30D Equity Implied Volatility (equity_iv_30d)",
    plainEnglish:
      "The 30-day implied volatility of the company's own stock options (entered as a decimal, e.g., 0.85 = 85%).",
    whyItMatters:
      "Used solely to back out the 'Options-Implied BTC Vol' readout—it does not alter Model Fair Value.",
    underTheHood: "Input into impliedBtcVolPct = equityIv30d × (E_model / (V₀ × Δ_net)).",
  },
  bs_par_total: {
    term: "Face Value ($M)",
    mathName: "Stated Liquidation Preference (par_total)",
    plainEnglish:
      "The total dollar liquidation claim of this preferred stock class, in millions ($100 stated value per preferred share).",
    whyItMatters:
      "Determines how much senior capital sits ahead of common stockholders in the payout waterfall.",
    underTheHood: "Included in gross senior par K₀ and cumulative tier barriers.",
  },
  bs_coupon_rate: {
    term: "Annual Dividend Rate",
    mathName: "Stated Coupon Rate (coupon_rate)",
    plainEnglish:
      "The yearly dividend percentage paid on face value (entered as a decimal, e.g., 0.12 = 12.0%).",
    whyItMatters:
      "Drives both the preferred stock's market value and the Debt & Dividend Rate Adjustment on the scorecard.",
    underTheHood: "Sets c₀ in the Leland preferred pricing equations.",
  },
  invariant_suite: {
    term: "Automated Math Integrity Checks",
    mathName: "Physics & Financial Invariant Torture Suite",
    plainEnglish:
      "An instant built-in self-test that hammers the valuation engine across extreme Bitcoin prices ($500 to $1,000,000) and volatilities (25% to 150%) to verify zero broken math.",
    whyItMatters:
      "Proves right in your browser that value never leaks out of the vault, common stock never goes negative, and every scorecard row adds up to the penny.",
    underTheHood:
      "Runs executeInvariantSuite() across 120+ grid states plus seam-continuity and finite-difference delta checks.",
  },
  audit_trace_vars: {
    term: "Internal Engine State Trace",
    mathName: "Live ODE & Waterfall Variables",
    plainEnglish:
      "The raw under-the-hood numbers (BTC vault value, cash, debt barrier, post-debt pool, and ODE exponents) calculated at the current BTC price and volatility.",
    whyItMatters:
      "Lets independent analysts or other AI tools verify every intermediate step of the model without having to trust a black box.",
    underTheHood:
      "Direct readout of ValuationResult fields from lib/v31-alpha-engine.ts.",
  },
  // --- Break-Even Simulator & Exact Hurdle Metrics ---
  unencumbered_btc_needed: {
    term: "Unencumbered BTC Needed",
    mathName: "Exact Debt-Free BTC Required to Clear Premium",
    plainEnglish:
      "The exact number of brand-new, debt-free Bitcoin the company would have to add to its vault (at today's flat BTC price) for Model Fair Value to catch up to today's stock price.",
    whyItMatters:
      "Turns an abstract percentage hurdle into a concrete stack of coins. If the stock already trades at a discount to Fair Value, this number is 0 BTC.",
    underTheHood:
      "Binary-solved directly against evaluateBalanceSheet() so adding this exact BTC count raises Model Fair Value to match liveStockPrice to the penny.",
  },
  unencumbered_btc_hurdle: {
    term: "Unencumbered BTC Hurdle",
    mathName: "Required Growth on Debt-Free Sats/Share",
    plainEnglish:
      "How fast the company's debt-free (unencumbered) sats per share need to grow over 4 years to erase today's stock premium if Bitcoin's price never moves.",
    whyItMatters:
      "Higher than the Total Vault hurdle whenever a company carries debt or preferreds, because the growth is measured only against the debt-free slice common shareholders truly own today.",
    underTheHood:
      "((1 + Unencumbered Sats Needed ÷ Spot Unencumbered Sats)^(1/T) − 1) × 100%. Displays N/A if CEBE is $0 (underwater).",
  },
  total_btc_hurdle: {
    term: "Total Vault BTC Hurdle",
    mathName: "Required Growth on Gross BTC Holdings",
    plainEnglish:
      "That exact same stack of needed debt-free Bitcoin measured as an annual growth percentage of the company's entire gross Bitcoin vault.",
    whyItMatters:
      "Gives you a steady yardstick that still works cleanly even if a severe crash temporarily pushes debt-free sats per share down to zero.",
    underTheHood:
      "((1 + Exact Unencumbered BTC Needed ÷ Total BTC Holdings)^(1/T) − 1) × 100%.",
  },
  drink_a_beer_btc: {
    term: "Dollar Break-Even BTC Price",
    mathName: "Zero-Issuance Fair Value Break-Even Spot Price",
    plainEnglish:
      "The exact Bitcoin price where Model Fair Value catches up to the stock price you paid today—even if management does nothing (zero share or preferred issuance) and the market premium collapses to $0.",
    whyItMatters:
      "Puts scary-looking premiums in plain perspective. If Bitcoin hits this price tomorrow, you've already cleared the dollar hurdle without waiting years.",
    underTheHood:
      "Solves for P_BTC where evaluateBalanceSheet(bs, P_BTC).fairValuePerSh == liveStockPrice.",
  },
  beat_spot_btc: {
    term: "Beat-Spot-BTC Price",
    mathName: "Zero-Issuance Spot Outperformance Threshold",
    plainEnglish:
      "The Bitcoin price where holding the stock actually beats just buying spot Bitcoin today—even if the stock's premium drops all the way to $0.",
    whyItMatters:
      "Dollar break-even only gets you back to flat; this shows when leverage and shrinking fixed-dollar debt actually put you ahead of spot BTC. If you paid above 1.0x the gross vault, waiting alone can't beat spot—management has to issue at a premium or use preferreds.",
    underTheHood:
      "Solves for lowest P_BTC ≥ spot where Model Fair Value(P_BTC) ≥ liveStockPrice × (P_BTC ÷ spot).",
  },
  atm_issuance_premium: {
    term: "ATM Issuance Premium",
    mathName: "Common Equity Offering Multiple vs. Fair Value",
    plainEnglish:
      "How much above Model Fair Value the company is able to sell new common stock to buy Bitcoin.",
    whyItMatters:
      "This is the engine of common-stock BTC yield. Slide this to 0% and no amount of new common shares can ever clear the hurdle—forcing the company to rely on Bitcoin price appreciation or preferred stock instead.",
    underTheHood:
      "ATM Sale Price = Model Fair Value × (1 + Premium%). New shares = Proceeds ÷ Sale Price.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export interface PlainRegimeBadge {
  label: string;
  tone: "emerald" | "sky" | "amber" | "rose" | "slate";
}

/**
 * Translates raw engine regime labels from v31-alpha-engine.ts into plain English
 * without mutating the underlying math engine.
 */
export function translateRegime(rawRegime: string): PlainRegimeBadge {
  switch (rawRegime) {
    case "Regime 3: $100 Par-Pinned":
      return { label: "Pinned at $100 Par", tone: "emerald" };
    case "Regime 2: Rate-Reset Transition":
      return { label: "Active (Rate-Resetting)", tone: "sky" };
    case "2-Regime Uncapped":
      return { label: "Active (Uncapped)", tone: "amber" };
    case "Regime 1: Suspended":
      return { label: "Dividends Paused", tone: "rose" };
    case "Cash-Defended":
      return { label: "100% Cash-Backed", tone: "emerald" };
    default:
      return { label: rawRegime, tone: "slate" };
  }
}

export interface PlainInvariantMeta {
  plainTitle: string;
  plainSummary: string;
}

/**
 * Plain-English labels for the 8 automated math checks (INV-01 to INV-08).
 */
export const INVARIANT_PLAIN_MAP: Record<string, PlainInvariantMeta> = {
  "INV-01": {
    plainTitle: "No Missing Dollars (Vault Balance Check)",
    plainSummary:
      "Common equity + debt/preferreds + convertible dilution always equals 100% of Bitcoin + cash.",
  },
  "INV-02": {
    plainTitle: "Limited Liability (No Negative Stock Prices)",
    plainSummary:
      "Common stock stays positive whenever Bitcoin beats debt, and floors cleanly at $0 below it.",
  },
  "INV-03": {
    plainTitle: "Scorecard Rows Add Up Strictly",
    plainSummary:
      "Hard Floor + Rate Adj + Safety Cushion − Dilution always equals Model Fair Value to the penny.",
  },
  "INV-04": {
    plainTitle: "Variable Preferreds Never Break $100 Cap",
    plainSummary:
      "Rate-resetting preferreds (SATA & STRC) stay strictly between $0.00 and $100.00.",
  },
  "INV-05": {
    plainTitle: "Higher Bitcoin Never Lowers Fair Value",
    plainSummary:
      "Once above pause triggers, a rising Bitcoin price never causes a dip in common Fair Value.",
  },
  "INV-06": {
    plainTitle: "Smooth Transitions (No Price Jumps or Kinks)",
    plainSummary:
      "Preferred pricing curves connect seamlessly across dividend-pause and $100 cap boundaries.",
  },
  "INV-07": {
    plainTitle: "BTC Sensitivity (Delta) Matches Reality",
    plainSummary:
      "The analytical BTC sensitivity formula matches direct price-nudge testing across the grid.",
  },
  "INV-08": {
    plainTitle: "Excess Cash Flows Cleanly to Common ($30B Test)",
    plainSummary:
      "If cash exceeds all debt and preferred face value, every leftover dollar goes straight to common stock.",
  },
};
