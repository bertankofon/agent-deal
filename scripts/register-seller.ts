import "dotenv/config";
import { registerDemoAgent, hasStellarKeys } from "../src/stellar/trust.js";

async function main() {
  if (!hasStellarKeys()) {
    console.error("Set STELLAR_SECRET_KEY in .env first");
    process.exit(1);
  }
  const result = await registerDemoAgent({
    name: "Agent Deal Seller",
    description: "RFQ seller agent — negotiation demo on Stellar 8004",
    role: "seller",
  });
  console.log("\n✅ Registered on Stellar 8004 testnet\n");
  console.log("SELLER_STELLAR_AGENT_ID=" + result.agentId);
  console.log("Explorer:", result.explorerUrl);
  console.log("Public key:", result.publicKey);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
