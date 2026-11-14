import { INITIAL_ASST_BS, INITIAL_MSTR_BS } from "../lib/baselines";
import {
  evaluateBalanceSheet,
  executeInvariantSuite,
} from "../lib/v31-alpha-engine";

const report = executeInvariantSuite(INITIAL_ASST_BS, INITIAL_MSTR_BS, 0.045, 4.0);

console.log("\n======================================================================");
console.log(" ASST & MSTR INSTITUTIONAL ALPHA ENGINE (v3.1) — INVARIANT AUDIT");
console.log("======================================================================");

for (const chk of report.checks) {
  const badge = chk.passed ? "[PASS]" : "[FAIL]";
  console.log(badge + " " + chk.id + " " + chk.title + " -> " + chk.metric);
}

console.log("----------------------------------------------------------------------");
console.log(
  "Evaluated " +
    report.evaluations +
    " ODE states in " +
    report.elapsedMs.toFixed(2) +
    "ms."
);

const btcSpot = 66638.66;
console.log("\nBaseline Verification Snapshot @ BTC $" + btcSpot.toLocaleString("en-US") + ":");
for (const [bs, px] of [
  [INITIAL_ASST_BS, 21.36],
  [INITIAL_MSTR_BS, 111.62],
] as const) {
  for (const sig of [0.423, 0.5]) {
    const out = evaluateBalanceSheet(bs, btcSpot, sig, px, 0.045, 4.0);
    console.log(
      "  " +
        bs.ticker +
        " (sigma=" +
        (sig * 100).toFixed(1) +
        "%): CEBE=$" +
        out.cebePerSh.toFixed(2) +
        " | Carry=$" +
        out.carryDebtAdjPerSh.toFixed(2) +
        " | Put=$" +
        out.lelandPutPerSh.toFixed(2) +
        " | Dil=-$" +
        out.haircutsPerSh.toFixed(2) +
        " => FairVal=$" +
        out.fairValuePerSh.toFixed(2) +
        " | Hurdle=" +
        out.annualHurdlePct.toFixed(2) +
        "%/yr"
    );
  }
}

if (!report.allPassed) {
  console.error("\nERROR: One or more mathematical invariants failed!");
  process.exit(1);
}
console.log("\nALL 8 v3.1 MATHEMATICAL INVARIANTS PASSED! Ready for Phase 2 (Dashboard UI).\n");
