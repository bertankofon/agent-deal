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

export interface SellerListing {
  seller: {
    id: string;
    name: string;
    persona: string;
    tagline: string;
    repScore: number;
    repDeals: number;
    wallet?: string;
    stellarAgentId?: number;
  };
  listPrice: number;
  floorPct: number;
  /** List price × floorPct — lowest the seller policy allows. */
  floorPrice: number;
  eligible: boolean;
  skipReason?: string;
  links: {
    explorer: string;
    wallet?: string;
    agentRegistry?: string;
  };
}

export interface ShopPreviewResult {
  sku: string;
  buyer: { id: string; name: string; persona: string; repScore: number };
  threshold: number;
  sellers: SellerListing[];
}

/** List sellers for a sku without negotiating — buyer picks who to talk to. */
export function shopPreview(buyer: Agent, sku: string): ShopPreviewResult {
  const strat = STRATEGY[buyer.persona];
  const candidates = sellersForSku(sku);
  const sellers: SellerListing[] = candidates.map(({ seller, item }) => {
    const eligible = seller.repScore >= strat.minRep;
    const wallet = seller.wallet;
    return {
      seller: {
        id: seller.id,
        name: seller.name,
        persona: seller.persona,
        tagline: seller.tagline,
        repScore: seller.repScore,
        repDeals: seller.repDeals,
        wallet,
        stellarAgentId: seller.stellarAgentId,
      },
      listPrice: item.listPrice,
      floorPct: item.floorPct,
      floorPrice: round4(item.listPrice * (item.floorPct / 100)),
      eligible,
      skipReason: eligible
        ? undefined
        : `Reputation ${seller.repScore.toFixed(1)} is below your agent's ${strat.minRep.toFixed(1)} threshold`,
      links: {
        explorer: "/explorer.html",
        wallet: wallet ? `https://stellar.expert/explorer/testnet/account/${wallet}` : undefined,
        agentRegistry: seller.stellarAgentId != null ? `/explorer.html#agent-${seller.stellarAgentId}` : undefined,
      },
    };
  });
  sellers.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.listPrice - b.listPrice;
  });
  return {
    sku,
    buyer: { id: buyer.id, name: buyer.name, persona: buyer.persona, repScore: buyer.repScore },
    threshold: strat.minRep,
    sellers,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Negotiate with one seller for a sku. */
export function negotiateWithSeller(buyer: Agent, sku: string, sellerId: string): Offer | { error: string } {
  const strat = STRATEGY[buyer.persona];
  const row = sellersForSku(sku).find((c) => c.seller.id === sellerId);
  if (!row) return { error: "seller does not carry this product" };
  const { seller, item } = row;
  if (seller.repScore < strat.minRep) {
    return { error: `${seller.name}'s reputation (${seller.repScore.toFixed(1)}) is below your threshold (${strat.minRep.toFixed(1)})` };
  }
  return buildOffer(buyer, sku, seller, item);
}

function buildOffer(
  buyer: Agent,
  sku: string,
  seller: Agent,
  item: NonNullable<Agent["inventory"]>[number]
): Offer {
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
  return {
    seller: {
      id: seller.id,
      name: seller.name,
      persona: seller.persona,
      repScore: seller.repScore,
      wallet: seller.wallet,
      stellarAgentId: seller.stellarAgentId,
    },
    listPrice: item.listPrice,
    agreed: session.agreed,
    finalPrice: session.finalPrice ?? item.listPrice,
    sellerRep: seller.repScore,
    session,
  };
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
    offers.push(buildOffer(buyer, sku, seller, item));
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
