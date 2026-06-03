import type { Request, Response } from "express";
import { getSession, saveSession } from "../store/memory.js";
import { buyerAddress, submitDealFeedback } from "../stellar/trust.js";
import { findSettlementTx } from "../stellar/explorer.js";
import {
  buildTransferXdr,
  buyerServerConfigured,
  payUsdcServer,
  submitSignedXdr,
} from "../payment/transfer.js";

/** Score a settled deal from its outcome, then write 8004 feedback (buyer-signed). */
async function rateSeller(sessionId: string) {
  const session = getSession(sessionId);
  if (!session?.sellerStellarAgentId) return;
  // Outcome-based: a smooth deal scores high; near-floor / many rounds a bit lower.
  const rounds = session.transcript.length;
  const score = rounds <= 3 ? 95 : rounds <= 6 ? 88 : 80;
  session.feedback = await submitDealFeedback({
    stellarAgentId: session.sellerStellarAgentId,
    score,
    endpoint: `${process.env.APP_BASE_URL ?? ""}/deal/${sessionId}`,
  });
  saveSession(session);
}

async function attachTx(sessionId: string, txHash: string | undefined, from?: string, to?: string) {
  let hash = txHash;
  if (!hash && from && to) {
    const found = await findSettlementTx(from, to);
    if (found) hash = found.hash;
  }
  const session = getSession(sessionId);
  if (!session) return;
  session.payment = {
    status: "success",
    method: "mpp-charge",
    httpStatus: 200,
    txHash: hash,
    explorerUrl: hash ? `https://stellar.expert/explorer/testnet/tx/${hash}` : undefined,
    from,
    to,
  };
  saveSession(session);
}

/** Server-key settlement (demo / verification path). */
export async function settleServer(req: Request, res: Response): Promise<void> {
  const session = getSession(String(req.params.sessionId));
  if (!session?.agreed || session.finalPrice == null) {
    res.status(400).json({ error: "negotiation not agreed" });
    return;
  }
  const to = session.sellerWallet ?? process.env.STELLAR_RECIPIENT;
  if (!to) {
    res.status(400).json({ error: "seller wallet unknown — register this seller first" });
    return;
  }
  if (!buyerServerConfigured()) {
    session.payment = { status: "mock", method: "mock", detail: "Connect Freighter or set STELLAR_PAYER_SECRET" };
    saveSession(session);
    res.json({ session, mock: true });
    return;
  }
  try {
    const hash = await payUsdcServer(to, session.finalPrice);
    await attachTx(session.id, hash, buyerAddress() ?? undefined, to);
    await rateSeller(session.id);
    res.json({ session: getSession(session.id) });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const insufficient = /#10|resulting balance|not within the allowed range/.test(raw);
    session.payment = { status: "error", method: "mpp-charge", detail: raw };
    saveSession(session);
    res.status(200).json({
      error: insufficient
        ? "Insufficient USDC in the buyer wallet. Top up at faucet.circle.com and try again."
        : raw,
    });
  }
}

/** Freighter path step 1: hand the browser a prepared, unsigned XDR to sign. */
export async function settleBuild(req: Request, res: Response): Promise<void> {
  const session = getSession(String(req.params.sessionId));
  if (!session?.agreed || session.finalPrice == null) {
    res.status(400).json({ error: "negotiation not agreed" });
    return;
  }
  const from = String(req.query.from ?? "");
  const to = session.sellerWallet ?? process.env.STELLAR_RECIPIENT;
  if (!from.startsWith("G")) return void res.status(400).json({ error: "from (buyer wallet) required" });
  if (!to) return void res.status(400).json({ error: "seller wallet unknown" });
  try {
    const xdr = await buildTransferXdr(from, to, session.finalPrice);
    res.json({ xdr, to, amount: session.finalPrice });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/** Freighter path step 2: submit the signed XDR, then record + rate. */
export async function settleSubmit(req: Request, res: Response): Promise<void> {
  const session = getSession(String(req.params.sessionId));
  if (!session) return void res.status(404).json({ error: "session not found" });
  const signedXdr = req.body?.signedXdr;
  const from = req.body?.from;
  if (!signedXdr) return void res.status(400).json({ error: "signedXdr required" });
  try {
    const hash = await submitSignedXdr(String(signedXdr));
    await attachTx(session.id, hash, from, session.sellerWallet ?? process.env.STELLAR_RECIPIENT);
    res.json({ session: getSession(session.id) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/** Rate the seller after a Freighter-paid deal (server writes feedback for the demo). */
export async function rateHandler(req: Request, res: Response): Promise<void> {
  const session = getSession(String(req.params.sessionId));
  if (!session) return void res.status(404).json({ error: "session not found" });
  await rateSeller(session.id);
  res.json({ session: getSession(session.id) });
}
