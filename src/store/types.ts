/** Three ready-made strategies, available on both sides. */
export type PersonaId = "fast" | "revenue" | "balanced";

/** Buyer strategy parameters (ratios are fractions of the list price). */
export interface BuyerParams {
  /** Max the buyer will ever pay, as a fraction of list price. */
  budgetRatio: number;
  /** First offer, as a fraction of list price. */
  openRatio: number;
  /** Fraction of the gap the buyer closes each round. */
  concession: number;
  /** Max rounds before the buyer walks away. */
  patience: number;
  /** Accept if the seller ask is within this % of the buyer's current offer. */
  acceptGapPct: number;
}

/** Seller strategy parameters (ratios are fractions of the list price). */
export interface SellerParams {
  /** Lowest price the seller will accept, as a fraction of list price. */
  reserveRatio: number;
  /** First ask, as a fraction of list price. */
  openRatio: number;
  /** Fraction of the gap the seller closes each round. */
  concession: number;
  /** Max rounds before the seller walks away. */
  patience: number;
  /** Accept if the buyer offer is within this % of the seller's current ask. */
  acceptGapPct: number;
}

/** One line item a seller carries. Many sellers can carry the same sku. */
export interface InventoryItem {
  sku: string;
  listPrice: number;
  floorPct: number;
}

/** A registered agent identity that carries an on-chain reputation. */
export interface Agent {
  id: string;
  role: "buyer" | "seller";
  persona: PersonaId;
  name: string;
  tagline: string;
  /** Reputation on a 0–5 scale (mirrors the 8004 Reputation Registry). */
  repScore: number;
  /** Number of past deals backing the score (volume). */
  repDeals: number;
  /** On-chain ERC-8004 agent id (u32) once registered. */
  stellarAgentId?: number;
  /** Seller-owner public address that receives payment. */
  wallet?: string;
  /** Seller inventory (sellers only). */
  inventory?: InventoryItem[];
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  listPrice: number;
  /** Hard floor: the largest discount the merchant will ever allow. */
  floorPct: number;
}

export interface NegotiationMessage {
  sender: "buyer" | "seller";
  name: string;
  message: string;
  proposedPrice: number;
  accept: boolean;
  reject: boolean;
  round: number;
}

export interface NegotiationSession {
  id: string;
  productId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  buyerPersona: PersonaId;
  sellerPersona: PersonaId;
  buyerRep: number;
  sellerRep: number;
  /** True when the counterparty's low reputation forced a prepay demand. */
  prepayRequired: boolean;
  status: "agreed" | "failed" | "rejected";
  transcript: NegotiationMessage[];
  initialPrice: number;
  finalPrice?: number;
  /** Effective values the reputation gate produced, for the UI to explain. */
  effectiveReserve: number;
  effectiveBudget: number;
  agreed: boolean;
  createdAt: string;
  /** Settlement targets (filled by the shop orchestrator). */
  sku?: string;
  sellerName?: string;
  sellerWallet?: string;
  sellerStellarAgentId?: number;
  payment?: {
    status: string;
    method?: "mpp-charge" | "mock";
    detail?: string;
    httpStatus?: number;
    txHash?: string;
    explorerUrl?: string;
    from?: string;
    to?: string;
  };
  feedback?: { status: string; detail?: string };
}

export interface NegotiationTurn {
  message: string;
  proposedPrice: number;
  accept: boolean;
  reject: boolean;
  reason?: string;
}
