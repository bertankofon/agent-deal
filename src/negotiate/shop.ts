/**
 * Autonomous buyer flow: given a need, the buyer agent discovers every seller
 * carrying the sku, filters by reputation (per its strategy), negotiates with
 * each one, and ranks the agreed offers. The whole thing is off-chain — only
 * the final settlement and feedback touch the wallet.
 */
import type { Agent, NegotiationSession } from "../store/types.js";
import { sellersForSku } from "../store/memory.js";
import { runNegotiation } from "./engine.js";
import { newSessionId } from "../store/memory.js";

/** Each buyer strategy trusts differently and ranks offers differently. */
const STRATEGY = {
  fast: { minRep: 4.0, rank: (o: Offer) => -o.sellerRep }, // most trusted first
  revenue: { minRep: 3.0, rank: (o: Offer) => o.finalPrice }, // cheapest first
  balanced: { minRep: 3.5, rank: (o: Offer) => o.finalPrice / o.listPrice - (o.sellerRep / 5) * 0.15 },
} as const;

export interface Offer {
  seller: { id: string; name: string; persona: string; repScore: number; wallet?: string; stellarAgentId?: number };
  listPrice: number;
  agreed: boolean;
  finalPrice: number;
  sellerRep: number;
  session: NegotiationSession;
}

export interface ShopResult {
  sku: string;
  buyer: { id: string; name: string; persona: string; repScore: number };
  threshold: number;
  scanned: number;
  skipped: { name: string; rep: number }[];
  scanLog: string[];
  offers: Offer[];
  ranked: Offer[];
  best: Offer | null;
}

export function shop(buyer: Agent, sku: string): ShopResult {
  const strat = STRATEGY[buyer.persona];
  const candidates = sellersForSku(sku);
  const scanLog: string[] = [];
  scanLog.push(`Found ${candidates.length} seller${candidates.length === 1 ? "" : "s"} offering "${sku}".`);
  scanLog.push(`Reputation threshold for a ${label(buyer.persona)} buyer: ${strat.minRep.toFixed(1)}/5.`);

  const skipped: { name: string; rep: number }[] = [];
  const offers: Offer[] = [];

  for (const { seller, item } of candidates) {
    if (seller.repScore < strat.minRep) {
      skipped.push({ name: seller.name, rep: seller.repScore });
      scanLog.push(`Skipping ${seller.name} — reputation ${seller.repScore.toFixed(1)} below threshold.`);
      continue;
    }
    scanLog.push(`Opening negotiation with ${seller.name} (${label(seller.persona)}, ★${seller.repScore.toFixed(1)})…`);
    const session = runNegotiation({
      sessionId: newSessionId(),
      product: { id: `${seller.id}:${sku}`, name: sku, listPrice: item.listPrice, floorPct: item.floorPct },
      buyer,
      seller,
    });
    session.sku = sku;
    session.sellerName = seller.name;
    session.sellerWallet = seller.wallet;
    session.sellerStellarAgentId = seller.stellarAgentId;
    offers.push({
      seller: { id: seller.id, name: seller.name, persona: seller.persona, repScore: seller.repScore, wallet: seller.wallet, stellarAgentId: seller.stellarAgentId },
      listPrice: item.listPrice,
      agreed: session.agreed,
      finalPrice: session.finalPrice ?? item.listPrice,
      sellerRep: seller.repScore,
      session,
    });
  }

  const agreedOffers = offers.filter((o) => o.agreed);
  const ranked = [...agreedOffers].sort((a, b) => strat.rank(a) - strat.rank(b));
  const best = ranked[0] ?? null;

  if (best) {
    scanLog.push(`Best deal: ${best.seller.name} at $${best.finalPrice.toFixed(3)} (${rankReason(buyer.persona)}).`);
  } else {
    scanLog.push(`No agreeable offer — every seller's terms were outside budget.`);
  }

  return {
    sku,
    buyer: { id: buyer.id, name: buyer.name, persona: buyer.persona, repScore: buyer.repScore },
    threshold: strat.minRep,
    scanned: candidates.length,
    skipped,
    scanLog,
    offers,
    ranked,
    best,
  };
}

function label(p: string): string {
  return p === "revenue" ? "bargain" : p;
}
function rankReason(p: string): string {
  return p === "fast" ? "highest reputation" : p === "revenue" ? "lowest price" : "best price-to-trust";
}
