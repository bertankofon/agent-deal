import { createHash } from "crypto";
import { Keypair } from "@stellar/stellar-sdk";
import {
  TESTNET_CONFIG,
  buildMetadataJson,
  createClients,
  fundTestnet,
  toDataUri,
  wrapBasicSigner,
} from "@trionlabs/stellar8004";

export function hasStellarKeys(): boolean {
  return Boolean(process.env.STELLAR_SECRET_KEY?.startsWith("S"));
}

export function getDeployerKeypair(): Keypair {
  const secret = process.env.STELLAR_SECRET_KEY;
  if (!secret) throw new Error("STELLAR_SECRET_KEY not set");
  return Keypair.fromSecret(secret);
}

/**
 * The buyer's keypair signs reputation feedback. It must NOT be the agent
 * owner — the Reputation Registry blocks self-feedback.
 */
export function getBuyerKeypair(): Keypair | null {
  const secret = process.env.STELLAR_PAYER_SECRET;
  if (!secret?.startsWith("S")) return null;
  return Keypair.fromSecret(secret);
}

/** Public address of the buyer-owner wallet (the payer). */
export function buyerAddress(): string | null {
  return getBuyerKeypair()?.publicKey() ?? null;
}

/** Public address of the seller-owner wallet (the recipient). */
export function sellerAddress(): string | null {
  return process.env.STELLAR_RECIPIENT ?? null;
}

export async function ensureFunded(publicKey: string): Promise<void> {
  if (process.env.STELLAR_NETWORK === "mainnet") return;
  await fundTestnet(publicKey);
}

/**
 * Register a demo agent on Stellar ERC-8004 (testnet by default).
 */
export async function registerDemoAgent(opts: {
  name: string;
  description: string;
  role: "buyer" | "seller";
  appBaseUrl?: string;
}): Promise<{ agentId: number; publicKey: string; explorerUrl: string }> {
  const keypair = getDeployerKeypair();
  await ensureFunded(keypair.publicKey());

  const base = opts.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:8787";
  const signer = wrapBasicSigner(keypair, TESTNET_CONFIG.networkPassphrase);
  const { identity } = createClients(TESTNET_CONFIG, signer);

  const metadata = buildMetadataJson({
    name: opts.name,
    description: opts.description,
    imageUrl: "",
    services: [
      {
        name: "a2a",
        endpoint: `${base}/.well-known/agent.json`,
        version: "1.0",
        description: `Agent Deal ${opts.role} agent`,
      },
    ],
    supportedTrust: ["reputation"],
    x402Enabled: false,
  });

  const dataUri = toDataUri(metadata);
  const tx = await identity.register_with_uri({
    caller: keypair.publicKey(),
    agent_uri: dataUri,
  });
  const sent = await tx.signAndSend();
  const agentId = Number(sent.result);

  return {
    agentId,
    publicKey: keypair.publicKey(),
    explorerUrl: `https://stellar8004.com/agents/${agentId}`,
  };
}

export async function submitDealFeedback(opts: {
  stellarAgentId: number;
  score: number;
  tag?: string;
  endpoint?: string;
}): Promise<{ status: string; detail?: string }> {
  // The buyer rates the seller. Signing with the buyer's key avoids the
  // self-feedback block (the seller can't rate its own agent).
  const keypair = getBuyerKeypair();
  if (!keypair) {
    return { status: "skipped", detail: "STELLAR_PAYER_SECRET (buyer) not configured" };
  }

  try {
    const signer = wrapBasicSigner(keypair, TESTNET_CONFIG.networkPassphrase);
    const { reputation } = createClients(TESTNET_CONFIG, signer);

    const payload = JSON.stringify({
      score: opts.score,
      at: new Date().toISOString(),
    });
    const hash = createHash("sha256").update(payload).digest();

    const tx = await reputation.give_feedback({
      caller: keypair.publicKey(),
      agent_id: opts.stellarAgentId,
      value: BigInt(Math.round(opts.score)),
      value_decimals: 0,
      tag1: opts.tag ?? "starred",
      tag2: "",
      endpoint: opts.endpoint ?? "",
      feedback_uri: "",
      feedback_hash: hash,
    });
    await tx.signAndSend();
    return { status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", detail: message };
  }
}
