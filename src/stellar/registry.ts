/**
 * Lightweight testnet indexer for the trionlabs ERC-8004 contracts.
 * stellar8004.com only shows mainnet, so we read the testnet Identity +
 * Reputation registries directly over Soroban RPC (simulate-only, no signing).
 */
import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";

const RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const IDENTITY = "CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH";
const REPUTATION = "CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55";

const server = new rpc.Server(RPC_URL);

export interface IndexedAgent {
  id: number;
  name: string;
  description?: string;
  image?: string;
  owner: string | null;
  wallet: string | null;
  services: { name: string; endpoint?: string; description?: string }[];
  uri: string;
  feedbackCount: number;
  avgScore: number | null;
}

const u32 = (n: number) => nativeToScVal(n, { type: "u32" });

let sourceAccountPromise: Promise<import("@stellar/stellar-sdk").Account> | null = null;
function getSource() {
  // Any existing account works as the simulation source.
  const pub = process.env.STELLAR_RECIPIENT;
  if (!pub) throw new Error("STELLAR_RECIPIENT must be set (used as RPC read source)");
  if (!sourceAccountPromise) sourceAccountPromise = server.getAccount(pub);
  return sourceAccountPromise;
}

async function read(contractId: string, method: string, args: ReturnType<typeof u32>[] = []): Promise<unknown> {
  const source = await getSource();
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${method}: ${sim.error}`);
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
  return retval ? scValToNative(retval) : null;
}

/** Decode an agent_uri (data: / https: / ipfs:) into its metadata JSON. */
async function resolveMetadata(uri: string): Promise<any> {
  try {
    if (uri.startsWith("data:")) {
      const comma = uri.indexOf(",");
      const meta = uri.slice(5, comma);
      const payload = uri.slice(comma + 1);
      const json = meta.includes("base64")
        ? Buffer.from(payload, "base64").toString("utf8")
        : decodeURIComponent(payload);
      return JSON.parse(json);
    }
    let url = uri;
    if (uri.startsWith("ipfs://")) url = `https://ipfs.io/ipfs/${uri.slice(7)}`;
    if (url.startsWith("http")) {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return await res.json();
    }
  } catch {
    /* unresolved */
  }
  return {};
}

async function reputation(id: number): Promise<{ feedbackCount: number; avgScore: number | null }> {
  try {
    const clients = (await read(REPUTATION, "get_clients_paginated", [u32(id), u32(0), u32(50)])) as string[] | null;
    const list = clients ?? [];
    if (!list.length) return { feedbackCount: 0, avgScore: null };

    // get_summary takes a Vec<Address>, capped at 5 clients — build the scvVec by hand.
    const clientsVec = xdr.ScVal.scvVec(list.slice(0, 5).map((c) => nativeToScVal(c, { type: "address" })));
    const summary: any = await read(REPUTATION, "get_summary", [
      u32(id),
      clientsVec,
      nativeToScVal("", { type: "string" }),
      nativeToScVal("", { type: "string" }),
    ]);
    let avg: number | null = null;
    let count = list.length;
    if (summary) {
      if (summary.summary_value != null) {
        const dec = Number(summary.summary_value_decimals ?? 0);
        avg = Number(summary.summary_value) / Math.pow(10, dec);
      }
      if (summary.count != null) count = Number(summary.count);
    }
    return { feedbackCount: count, avgScore: avg };
  } catch {
    return { feedbackCount: 0, avgScore: null };
  }
}

async function loadAgent(id: number): Promise<IndexedAgent | null> {
  try {
    const exists = await read(IDENTITY, "agent_exists", [u32(id)]);
    if (!exists) return null;
    const uri = ((await read(IDENTITY, "agent_uri", [u32(id)])) as string) ?? "";
    const owner = ((await read(IDENTITY, "find_owner", [u32(id)])) as string) ?? null;
    const wallet = ((await read(IDENTITY, "get_agent_wallet", [u32(id)])) as string) ?? null;
    const meta = await resolveMetadata(uri);
    const rep = await reputation(id);
    return {
      id,
      name: meta.name ?? `Agent #${id}`,
      description: meta.description,
      image: meta.image ?? meta.imageUrl,
      owner,
      wallet,
      services: Array.isArray(meta.services) ? meta.services : [],
      uri,
      feedbackCount: rep.feedbackCount,
      avgScore: rep.avgScore,
    };
  } catch {
    return null;
  }
}

async function pMap<T, R>(items: T[], fn: (t: T) => Promise<R>, concurrency = 5): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

interface CacheEntry { at: number; data: any }
const cache = new Map<string, CacheEntry>();

/** Drop cached index pages (e.g. after a new feedback/registration lands). */
export function clearRegistryCache(): void {
  cache.clear();
}

export async function listRegisteredAgents(opts: { limit?: number; owner?: string } = {}) {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
  const key = `${limit}:${opts.owner ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;

  const total = Number((await read(IDENTITY, "total_agents")) ?? 0);
  const ids: number[] = [];
  for (let id = total; id >= 1 && ids.length < limit; id--) ids.push(id);

  let agents = (await pMap(ids, loadAgent)).filter(Boolean) as IndexedAgent[];
  if (opts.owner) agents = agents.filter((a) => a.owner === opts.owner);

  const data = {
    network: "testnet",
    totalAgents: total,
    shown: agents.length,
    identityRegistry: IDENTITY,
    reputationRegistry: REPUTATION,
    agents,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
