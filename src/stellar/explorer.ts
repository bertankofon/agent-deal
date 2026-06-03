/** Locate the on-chain settlement transaction via Horizon, for a real explorer link. */

const HORIZON = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";

async function recentTxHashes(account: string, limit = 8): Promise<string[]> {
  try {
    const res = await fetch(`${HORIZON}/accounts/${account}/transactions?order=desc&limit=${limit}`);
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data?._embedded?.records ?? []).map((t: any) => t.hash as string);
  } catch {
    return [];
  }
}

/**
 * The USDC SAC transfer touches both wallets, so the settlement tx is the most
 * recent hash present in BOTH accounts' history (the buyer's feedback tx is not).
 * Polls a few times to ride out Horizon indexing lag.
 */
export async function findSettlementTx(
  buyer: string,
  seller: string,
  attempts = 5,
  delayMs = 1000
): Promise<{ hash: string; url: string } | null> {
  for (let i = 0; i < attempts; i++) {
    const [b, s] = await Promise.all([recentTxHashes(buyer), recentTxHashes(seller)]);
    const set = new Set(b);
    const shared = s.find((h) => set.has(h));
    if (shared) {
      return { hash: shared, url: `https://stellar.expert/explorer/testnet/tx/${shared}` };
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
