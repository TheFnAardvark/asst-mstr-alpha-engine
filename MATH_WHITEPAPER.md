# Mathematical Specification: ASST & MSTR Institutional Alpha Engine (v3.1)

This repository implements a deterministic, closed-form corporate contingent-claims model for corporate Bitcoin treasuries (**Strive `$ASST`** and **Strategy `$MSTR`**), grounded in:
- **Hayne Leland (1994)** — Endogenous perpetual debt/preferred pricing & smooth-pasting distress barriers
- **David Emanuel (1983) & Marco Realdon (2006)** — Perpetual preferred dividend suspension dynamics
- **Fischer Black & John Cox (1976)** — First-passage down-and-out call valuation above senior debt barriers
- **Jonathan Ingersoll (1977)** — Multi-tranche sequential convertible dilution

## 1. Subordination-Adjusted Leland ODE

Each perpetual preferred tranche $i$ satisfies the time-homogeneous ODE on post-debt BTC value $X = \max(0, V_0 - H_0)$:

$$\frac{1}{2}\sigma^2 X^2 P''(X) + r X P'(X) - \rho_i P(X) + D_i(X) = 0, \quad \rho_i > r$$

with characteristic exponents $\gamma_i > 0$, $\beta_{+,i} > 1$, and smooth-pasting put weight $w_i = \frac{\beta_{+,i}}{\beta_{+,i} + \gamma_i}$.

## 2. 3-Regime $C^1$ Smooth-Pasting for Variable Par-Resetting Preferreds (`SATA`, `STRC`)

For par-targeted variable-rate preferreds with filed coupon $c_0 > \rho_i$, let $m = c_0 / \rho_i$, $u = (1 - \rho_i / c_0)^{-1/\gamma_i}$, and $X_{\text{cap}} = u X_S$:
1. **Regime 3 ($X \ge X_{\text{cap}}$, Par-Pinned):** $P_{\text{BTC}}(X) = \text{Par}_{\text{BTC}}, \; P'_{\text{BTC}}(X) = 0$.
2. **Regime 2 ($X_S < X < X_{\text{cap}}$, Rate-Reset Transition):**
   $$P_{\text{BTC}}(X) = \text{Par}_{\text{BTC}}\left[m - (m-1)(1-w_i)\left(\frac{X}{X_{\text{cap}}}\right)^{\beta_{+,i}} - m w_i \left(\frac{X}{X_S}\right)^{-\gamma_i}\right]$$
3. **Regime 1 ($0 < X \le X_S$, Suspended Recovery):**
   $$P_{\text{BTC}}(X) = \text{Par}_{\text{BTC}}(1-w_i)\left[m - (m-1)u^{-\beta_{+,i}}\right]\left(\frac{X}{X_S}\right)^{\beta_{+,i}}$$

## 3. Universal Invariants Verified by `npm test`

1. **Modigliani-Miller Vault Conservation:** $E_{\text{model}} + \text{SeniorClaims} + \text{Dilution} \equiv S_0$ to $< 10^{-6}$.
2. **Strict Limited Liability:** Homogeneity solvency scaling $\alpha_{\text{solv}}(\sigma)$ guarantees $\sum_k P_{k,\text{BTC}}(X) \le 0.95 X$ for all $X > 0$ and $\sigma > 0$.
3. **Universal Scorecard Additivity:** `CEBE + CarryDebtAdj + NetLelandPut - ConvertDilution == FairValue` across all underwater and bull states.
4. **$100.00 Variable Par-Pinning:** `SATA` and `STRC` never exceed `$100.00` per share.
