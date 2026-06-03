import type { BuyerParams, PersonaId, SellerParams } from "../store/types.js";

/**
 * Personas are NOT just prompt flavour — each one is a concrete numeric policy.
 * That is what makes the outcome change visibly: a "revenue" seller lands higher
 * than a "fast" seller every time, deterministically. The LLM (optional) only
 * narrates; these numbers decide accept / counter / walk-away.
 */

export const PERSONA_LABELS: Record<PersonaId, string> = {
  fast: "Fast",
  revenue: "Revenue-max",
  balanced: "Balanced",
};

export const BUYER_PERSONA_TAGLINE: Record<PersonaId, string> = {
  fast: "Price-insensitive, closes quickly",
  revenue: "Bargain hunter, grinds for the lowest price",
  balanced: "Reasonable, meets in the middle",
};

export const SELLER_PERSONA_TAGLINE: Record<PersonaId, string> = {
  fast: "Moves volume, concedes early",
  revenue: "Holds out, protects the margin",
  balanced: "Reasonable, meets in the middle",
};

export const BUYER_PARAMS: Record<PersonaId, BuyerParams> = {
  fast: { budgetRatio: 1.0, openRatio: 0.9, concession: 0.5, patience: 5, acceptGapPct: 7 },
  revenue: { budgetRatio: 0.9, openRatio: 0.65, concession: 0.18, patience: 8, acceptGapPct: 3 },
  balanced: { budgetRatio: 0.95, openRatio: 0.78, concession: 0.32, patience: 6, acceptGapPct: 5 },
};

export const SELLER_PARAMS: Record<PersonaId, SellerParams> = {
  fast: { reserveRatio: 0.78, openRatio: 1.0, concession: 0.5, patience: 5, acceptGapPct: 8 },
  revenue: { reserveRatio: 0.88, openRatio: 1.0, concession: 0.18, patience: 8, acceptGapPct: 3 },
  balanced: { reserveRatio: 0.83, openRatio: 1.0, concession: 0.32, patience: 6, acceptGapPct: 5 },
};

/** Round to 4 decimals so cent-scale negotiations keep sub-cent resolution. */
export function roundAmt(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Reputation on a 0–5 scale → trust in 0..1. */
export function trust(rep: number): number {
  return Math.max(0, Math.min(1, rep / 5));
}

/**
 * Shortfall below a "trusted" threshold. High-reputation counterparties (>=3.5/5)
 * incur no penalty; below that, the penalty grows. This is the reputation gate.
 */
export function trustShortfall(rep: number): number {
  return Math.max(0, 0.7 - trust(rep));
}
