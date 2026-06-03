/**
 * Deterministic, reputation-gated negotiation loop.
 *
 * Price is decided by each persona's numeric policy (never by an LLM), so the
 * demo always converges and personas produce visibly different outcomes. The
 * counterparty's on-chain reputation shifts the seller's reserve and the buyer's
 * budget — a low-reputation buyer gets a stiffer reserve and a prepay demand,
 * which can move or even kill the deal. That swing is the whole point.
 */
import type {
  Agent,
  NegotiationMessage,
  NegotiationSession,
  Product,
} from "../store/types.js";
import {
  BUYER_PARAMS,
  SELLER_PARAMS,
  roundAmt,
  trustShortfall,
} from "./personas.js";

export interface RunNegotiationInput {
  sessionId: string;
  product: Product;
  buyer: Agent;
  seller: Agent;
}

const PREPAY_THRESHOLD = 3.0; // counterparty rep (0–5) below this → prepay demanded

export function runNegotiation(input: RunNegotiationInput): NegotiationSession {
  const { product, buyer, seller } = input;
  const list = product.listPrice;

  const bp = BUYER_PARAMS[buyer.persona];
  const sp = SELLER_PARAMS[seller.persona];

  // --- Reputation gate -----------------------------------------------------
  // Seller becomes less flexible against a low-rep buyer: higher reserve, slower
  // concession. Hard merchant floor still applies on top.
  const buyerPenalty = trustShortfall(buyer.repScore); // 0 when buyer is trusted
  const sellerPenalty = trustShortfall(seller.repScore);

  const reserveRatioEff = Math.min(1.0, sp.reserveRatio + buyerPenalty * 0.5);
  const floorPrice = roundAmt(list * (1 - product.floorPct / 100));
  const reserve = roundAmt(Math.max(floorPrice, list * reserveRatioEff));
  const sellerConcession = sp.concession * (1 - buyerPenalty);

  // Buyer gets more cautious against a low-rep seller: trims the budget.
  const budgetRatioEff = Math.max(0.5, bp.budgetRatio - sellerPenalty * 0.25);
  const budget = roundAmt(list * budgetRatioEff);

  const prepayRequired = buyer.repScore < PREPAY_THRESHOLD;
  const maxRounds = Math.min(bp.patience, sp.patience);

  const transcript: NegotiationMessage[] = [];
  let ask = roundAmt(list * sp.openRatio);
  let offer = roundAmt(Math.min(budget, list * bp.openRatio));
  let agreed = false;
  let rejected = false;
  let finalPrice = list;

  // Seller lists the item.
  transcript.push(
    msg(seller, "seller", 0, ask, false, false, listingLine(seller, product, ask, prepayRequired, reserve))
  );

  // No overlap is possible — the rep-adjusted reserve is above the buyer's budget.
  // The seller says so up front rather than play out a doomed negotiation.
  if (reserve > budget) {
    transcript.push(
      msg(seller, "seller", 1, reserve, false, true, sellerNoOverlapLine(seller, reserve, buyer, prepayRequired))
    );
    return finalize(input, transcript, false, true, list, undefined, reserve, budget, prepayRequired);
  }

  for (let round = 1; round <= maxRounds; round++) {
    const lastRound = round === maxRounds;

    // ---- Buyer turn -------------------------------------------------------
    const askWithinBudget = ask <= budget;
    const askCloseEnough = (ask - offer) / ask * 100 <= bp.acceptGapPct;
    if (askWithinBudget && (askCloseEnough || lastRound)) {
      agreed = true;
      finalPrice = ask;
      transcript.push(msg(buyer, "buyer", round, ask, true, false, buyerAcceptLine(buyer, ask)));
      break;
    }
    if (lastRound && !askWithinBudget) {
      rejected = true;
      transcript.push(msg(buyer, "buyer", round, offer, false, true, buyerWalkLine(buyer, budget)));
      break;
    }
    offer = roundAmt(Math.min(budget, offer + (ask - offer) * bp.concession));
    transcript.push(msg(buyer, "buyer", round, offer, false, false, buyerCounterLine(buyer, offer, round)));

    // ---- Seller turn ------------------------------------------------------
    const offerAboveReserve = offer >= reserve;
    const offerCloseEnough = (ask - offer) / ask * 100 <= sp.acceptGapPct;
    if (offerAboveReserve && (offerCloseEnough || lastRound)) {
      agreed = true;
      finalPrice = offer;
      transcript.push(msg(seller, "seller", round, offer, true, false, sellerAcceptLine(seller, offer)));
      break;
    }
    if (lastRound) {
      rejected = true;
      transcript.push(msg(seller, "seller", round, reserve, false, true, sellerFloorLine(seller, reserve)));
      break;
    }
    ask = roundAmt(Math.max(reserve, ask - (ask - offer) * sellerConcession));
    transcript.push(msg(seller, "seller", round, ask, false, false, sellerCounterLine(seller, ask, round)));
  }

  return finalize(input, transcript, agreed, rejected, list, agreed ? finalPrice : undefined, reserve, budget, prepayRequired);
}

function finalize(
  input: RunNegotiationInput,
  transcript: NegotiationMessage[],
  agreed: boolean,
  rejected: boolean,
  list: number,
  finalPrice: number | undefined,
  reserve: number,
  budget: number,
  prepayRequired: boolean
): NegotiationSession {
  const { product, buyer, seller } = input;
  const status: NegotiationSession["status"] = agreed ? "agreed" : rejected ? "rejected" : "failed";
  return {
    id: input.sessionId,
    productId: product.id,
    buyerAgentId: buyer.id,
    sellerAgentId: seller.id,
    buyerPersona: buyer.persona,
    sellerPersona: seller.persona,
    buyerRep: buyer.repScore,
    sellerRep: seller.repScore,
    prepayRequired,
    status,
    transcript,
    initialPrice: list,
    finalPrice: finalPrice != null ? roundAmt(finalPrice) : undefined,
    effectiveReserve: reserve,
    effectiveBudget: budget,
    agreed,
    createdAt: new Date().toISOString(),
  };
}

// --- narration (deterministic templates; LLM layer can replace later) -------

function msg(
  agent: Agent,
  sender: "buyer" | "seller",
  round: number,
  price: number,
  accept: boolean,
  reject: boolean,
  message: string
): NegotiationMessage {
  return { sender, name: agent.name, message, proposedPrice: roundAmt(price), accept, reject, round };
}

function usd(n: number): string {
  const v = roundAmt(n);
  return v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;
}

function listingLine(seller: Agent, product: Product, ask: number, prepay: boolean, reserve: number): string {
  if (prepay) {
    return `Listing ${product.name} at ${usd(ask)}. Heads up — your reputation is low, so I'll need full prepayment and I can't go below ${usd(reserve)}.`;
  }
  return `Listing ${product.name} at ${usd(ask)}. Open to a reasonable offer.`;
}

function buyerCounterLine(buyer: Agent, offer: number, round: number): string {
  if (buyer.persona === "revenue") {
    return round === 1
      ? `That's steep. I can do ${usd(offer)}.`
      : `Still high for me — ${usd(offer)} is where I'm at.`;
  }
  if (buyer.persona === "fast") {
    return `Works for me, I'll come up to ${usd(offer)} to close this now.`;
  }
  return `Let's meet closer to the middle — ${usd(offer)}.`;
}

function buyerAcceptLine(buyer: Agent, price: number): string {
  return `Deal at ${usd(price)}. Sending payment.`;
}

function buyerWalkLine(buyer: Agent, budget: number): string {
  return `My ceiling is ${usd(budget)} — can't close at this price. Walking away.`;
}

function sellerCounterLine(seller: Agent, ask: number, round: number): string {
  if (seller.persona === "revenue") {
    return `I hold my margins. Best I'll do is ${usd(ask)}.`;
  }
  if (seller.persona === "fast") {
    return `I'd rather move it today — ${usd(ask)} and it's yours.`;
  }
  return `I can come down to ${usd(ask)}.`;
}

function sellerAcceptLine(seller: Agent, price: number): string {
  return `Sold at ${usd(price)}. Pleasure doing business.`;
}

function sellerFloorLine(seller: Agent, reserve: number): string {
  return `${usd(reserve)} is my floor and I won't go lower. No deal.`;
}

function sellerNoOverlapLine(seller: Agent, reserve: number, buyer: Agent, prepay: boolean): string {
  if (prepay) {
    return `Your reputation is only ${buyer.repScore.toFixed(1)}/5, so I need ${usd(reserve)} paid up front — that's above your budget. No deal.`;
  }
  return `My floor on this is ${usd(reserve)}, which is above your budget. We can't make it work.`;
}
