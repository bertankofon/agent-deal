/**
 * One-time seeder: register the demo seller agents on Stellar testnet 8004
 * (identity + reputation + USDC trustline), and write seed/sellers.json so the
 * app merges the on-chain agentId / wallet / score in. Admin script — uses
 * freshly generated keypairs; secrets are not persisted (sellers only receive).
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { createHash } from "crypto";
import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Horizon,
} from "@stellar/stellar-sdk";
import {
  TESTNET_CONFIG,
  createClients,
  wrapBasicSigner,
  buildMetadataJson,
  toDataUri,
  fundTestnet,
} from "@trionlabs/stellar8004";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../seed/sellers.json");
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const BASE = process.env.APP_BASE_URL ?? "http://localhost:8787";
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const PASS = TESTNET_CONFIG.networkPassphrase;

// Sellers to register on-chain (apex already = agent #2, skipped).
const SELLERS = [
  { id: "quickcart", name: "QuickCart", persona: "fast", repScore: 4.3, repDeals: 58 },
  { id: "fairtrade", name: "FairTrade Co", persona: "balanced", repScore: 4.5, repDeals: 81 },
  { id: "budgetbin", name: "BudgetBin", persona: "fast", repScore: 3.6, repDeals: 33 },
  { id: "meridian", name: "Meridian Goods", persona: "balanced", repScore: 4.1, repDeals: 47 },
  { id: "drift", name: "Drift Trading", persona: "revenue", repScore: 2.2, repDeals: 4 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function addUsdcTrustline(kp: Keypair) {
  const acct = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", USDC_ISSUER) }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);
}

async function registerSeller(s: (typeof SELLERS)[number]) {
  const kp = Keypair.random();
  await fundTestnet(kp.publicKey());
  await sleep(1500);
  await addUsdcTrustline(kp);

  const signer = wrapBasicSigner(kp, PASS);
  const { identity } = createClients(TESTNET_CONFIG, signer);
  const meta = buildMetadataJson({
    name: s.name,
    description: `${s.persona} seller agent on Agent Deal`,
    imageUrl: "",
    services: [{ name: "a2a", endpoint: `${BASE}/.well-known/agent.json`, version: "1.0", description: `${s.persona} seller` }],
    supportedTrust: ["reputation"],
    x402Enabled: false,
  });
  const tx = await identity.register_with_uri({ caller: kp.publicKey(), agent_uri: toDataUri(meta) });
  const sent = await tx.signAndSend();
  const agentId = Number(sent.result);
  return { keypair: kp, agentId };
}

async function giveFeedback(reviewer: Keypair, agentId: number, score: number) {
  const signer = wrapBasicSigner(reviewer, PASS);
  const { reputation } = createClients(TESTNET_CONFIG, signer);
  const hash = createHash("sha256").update(`${agentId}:${score}:${reviewer.publicKey()}`).digest();
  const tx = await reputation.give_feedback({
    caller: reviewer.publicKey(),
    agent_id: agentId,
    value: BigInt(Math.round(score * 20)), // 0–5 → 0–100
    value_decimals: 0,
    tag1: "starred",
    tag2: "",
    endpoint: "",
    feedback_uri: "",
    feedback_hash: hash,
  });
  await tx.signAndSend();
}

async function main() {
  console.log("Seeding sellers on Stellar testnet 8004…\n");

  // Two reviewer accounts (not the sellers) so feedback isn't self-feedback.
  const reviewers: Keypair[] = [Keypair.random(), Keypair.random()];
  for (const r of reviewers) { await fundTestnet(r.publicKey()); }
  await sleep(1500);

  const out: any[] = [];
  for (const s of SELLERS) {
    try {
      const { keypair, agentId } = await registerSeller(s);
      console.log(`✅ ${s.name.padEnd(16)} → agent #${agentId}  ${keypair.publicKey().slice(0, 6)}…`);
      for (const r of reviewers) {
        try { await giveFeedback(r, agentId, s.repScore); } catch (e) { console.log(`   feedback skipped: ${(e as Error).message?.slice(0, 60)}`); }
      }
      out.push({ id: s.id, name: s.name, persona: s.persona, repScore: s.repScore, repDeals: s.repDeals, stellarAgentId: agentId, wallet: keypair.publicKey() });
    } catch (e) {
      console.log(`❌ ${s.name}: ${(e as Error).message?.slice(0, 120)}`);
    }
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ seededAt: "manual", sellers: out }, null, 2));
  console.log(`\nWrote ${out.length} sellers → seed/sellers.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
