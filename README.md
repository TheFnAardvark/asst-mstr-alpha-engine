# ASST & MSTR Institutional Alpha Engine (v3.1)

Open-source structural valuation engine for **Strive (`$ASST`)** and **Strategy (`$MSTR`)** grounded in:
- **Hayne Leland (1994)** — Subordination-adjusted perpetual corporate claims & smooth-pasting endogenous barriers
- **David Emanuel (1983) & Marco Realdon (2006)** — Preferred dividend suspension dynamics
- **Fischer Black & John Cox (1976)** — First-passage down-and-out senior debt default barriers
- **Jonathan Ingersoll (1977)** — Sequential convertible note & STRK warrant dilution

## Independent Mathematical Audit

All core valuation equations live in [`lib/v31-alpha-engine.ts`](./lib/v31-alpha-engine.ts) with zero external dependencies. Run the 8-invariant torture suite locally:

```bash
npm install
npm test
```

## Environment Variables (Vercel / Self-Hosting)

| Variable | Purpose |
| :--- | :--- |
| `GOOGLE_SHEET_ID` | Private Google Sheet ID storing weekly SEC Form 8-K & 424B5 ledgers |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Cloud Service Account email shared on the backend Sheet |
| `GOOGLE_PRIVATE_KEY` | Service Account RSA private key (PEM or Base64) |
| `CRON_SECRET` | Bearer secret authenticating `/api/snapshot` time-series logging |
