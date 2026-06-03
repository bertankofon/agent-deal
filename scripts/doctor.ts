import "dotenv/config";
import { hasStellarKeys } from "../src/stellar/trust.js";
import { isMppConfigured, isMppPayerConfigured } from "../src/payment/mpp.js";

const rows: [string, boolean, string][] = [
  ["STELLAR_RECIPIENT (G...)", Boolean(process.env.STELLAR_RECIPIENT?.startsWith("G")), "Seller-owner receives USDC"],
  ["STELLAR_PAYER_SECRET (S...)", Boolean(process.env.STELLAR_PAYER_SECRET?.startsWith("S")), "Buyer-owner pays deals"],
  ["MPP_SECRET_KEY", isMppConfigured(), "MPP Charge server"],
  ["STELLAR_SECRET_KEY", hasStellarKeys(), "8004 register + feedback signer"],
  ["SELLER_STELLAR_AGENT_ID", Number.isFinite(Number(process.env.SELLER_STELLAR_AGENT_ID)), "8004 explorer link after register"],
  ["APP_BASE_URL", Boolean(process.env.APP_BASE_URL), "Settlement callbacks"],
];

console.log("\nAgent Deal — environment check\n");
for (const [key, ok, note] of rows) {
  console.log(`${ok ? "✅" : "❌"} ${key.padEnd(28)} ${note}`);
}

const mppReady = isMppConfigured() && isMppPayerConfigured();
console.log("\nSettlement:");
console.log(`  MPP: ${mppReady ? "ready (real USDC)" : "demo mode (simulated settle)"}`);
console.log("\nRun: npm run dev → http://localhost:8787\n");
