import { Router } from "express";
import {
  BUYER_PERSONA_TAGLINE,
  PERSONA_LABELS,
  SELLER_PERSONA_TAGLINE,
} from "../negotiate/personas.js";
import {
  getAgent,
  getSession,
  listAgents,
  listCatalog,
  saveSession,
  seedDemoCatalog,
} from "../store/memory.js";
import { shop } from "../negotiate/shop.js";
import { chatReply } from "../llm/chat.js";
import { hasStellarKeys, registerDemoAgent } from "../stellar/trust.js";
import { buyerServerConfigured } from "../payment/transfer.js";
import { clearRegistryCache, listRegisteredAgents } from "../stellar/registry.js";
import { buildGiveFeedbackXdr, buildRegisterXdr } from "../stellar/feedback.js";
import { submitSignedXdr } from "../payment/transfer.js";
import { rateHandler, settleBuild, settleServer, settleSubmit } from "./fulfill.js";

export const apiRouter = Router();
const NETWORK = process.env.STELLAR_NETWORK ?? "stellar:testnet";

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, stellar8004: hasStellarKeys() ? "configured" : "off", settle: buyerServerConfigured() });
});

apiRouter.get("/config", (_req, res) => {
  res.json({ network: NETWORK, serverSettle: buyerServerConfigured() });
});

apiRouter.get("/personas", (_req, res) => {
  res.json({ labels: PERSONA_LABELS, buyer: BUYER_PERSONA_TAGLINE, seller: SELLER_PERSONA_TAGLINE });
});

apiRouter.get("/roster", (_req, res) => {
  seedDemoCatalog();
  res.json({ buyers: listAgents("buyer"), sellers: listAgents("seller") });
});

/** Distinct SKUs available across the marketplace. */
apiRouter.get("/catalog", (_req, res) => {
  seedDemoCatalog();
  res.json({ items: listCatalog() });
});

/** Conversational shopping assistant (fal.ai LLM + catalog facts). */
apiRouter.post("/chat", async (req, res) => {
  seedDemoCatalog();
  const message = String(req.body?.message ?? "");
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  try {
    res.json(await chatReply(message, history));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Autonomous shopping: buyer agent scans + negotiates every seller of a sku. */
apiRouter.post("/shop", (req, res) => {
  seedDemoCatalog();
  const { buyerAgentId, sku } = req.body ?? {};
  if (!buyerAgentId || !sku) return void res.status(400).json({ error: "buyerAgentId and sku required" });
  const buyer = getAgent(String(buyerAgentId));
  if (!buyer || buyer.role !== "buyer") return void res.status(404).json({ error: "buyer agent not found" });

  const result = shop(buyer, String(sku));
  for (const o of result.offers) saveSession(o.session);
  res.json(result);
});

apiRouter.get("/session/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return void res.status(404).json({ error: "session not found" });
  res.json({ session });
});

/** Settlement — server-key path (demo) */
apiRouter.post("/settle/:sessionId", settleServer);
/** Settlement — Freighter path */
apiRouter.get("/settle/:sessionId/build", settleBuild);
apiRouter.post("/settle/:sessionId/submit", settleSubmit);
/** Rate the seller after a Freighter-paid deal */
apiRouter.post("/rate/:sessionId", rateHandler);

/** Interactive 8004 — the USER signs these with Freighter (build → sign → submit). */
apiRouter.get("/feedback/:agentId/build", async (req, res) => {
  const from = String(req.query.from ?? "");
  const score = Number(req.query.score ?? 5); // 0–5 stars
  const tag = String(req.query.tag ?? "starred");
  if (!from.startsWith("G")) return void res.status(400).json({ error: "from (wallet) required" });
  try {
    res.json({ xdr: await buildGiveFeedbackXdr(from, Number(req.params.agentId), score * 20, tag) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.get("/identity/build", async (req, res) => {
  const from = String(req.query.from ?? "");
  const name = String(req.query.name ?? "").slice(0, 60);
  const description = String(req.query.description ?? "").slice(0, 200);
  if (!from.startsWith("G")) return void res.status(400).json({ error: "from (wallet) required" });
  if (!name) return void res.status(400).json({ error: "name required" });
  try {
    res.json({ xdr: await buildRegisterXdr(from, name, description) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Submit any Freighter-signed 8004 action. */
apiRouter.post("/tx/submit", async (req, res) => {
  const signedXdr = req.body?.signedXdr;
  if (!signedXdr) return void res.status(400).json({ error: "signedXdr required" });
  try {
    const hash = await submitSignedXdr(String(signedXdr));
    clearRegistryCache();
    res.json({ hash, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${hash}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Testnet 8004 explorer: index the on-chain Identity + Reputation registries. */
apiRouter.get("/registry", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 24;
    const owner = req.query.owner ? String(req.query.owner) : undefined;
    res.json(await listRegisteredAgents({ limit, owner }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.post("/stellar/register-demo", async (req, res) => {
  if (!hasStellarKeys()) return void res.status(400).json({ error: "Set STELLAR_SECRET_KEY in .env" });
  try {
    const role = (req.body?.role as "buyer" | "seller") ?? "seller";
    res.json(await registerDemoAgent({ name: req.body?.name ?? `Agent Deal ${role}`, description: "Agent Deal demo", role }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
