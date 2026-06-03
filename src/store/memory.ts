import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import type { Agent, NegotiationSession } from "./types.js";

const sessions = new Map<string, NegotiationSession>();
const agents = new Map<string, Agent>();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, "../../seed/sellers.json");

/**
 * Marketplace: several seller agents, each with overlapping inventory, so the
 * buyer agent has real choices to scan and compare. Cent-scale prices keep
 * testnet settlement cheap. Reputation is seeded here and (once registered)
 * also lives on-chain — see scripts/seed-agents.ts.
 */
const SELLERS: Agent[] = [
  { id: "apex", role: "seller", persona: "revenue", name: "Apex Supplies", tagline: "Premium stock, holds margins", repScore: 4.7, repDeals: 124,
    wallet: "GB7ZAAGZ74D5MWNHCIUX25D5URBYT4LEATC6HEWIKMRJFTMFLBCT5A2W", stellarAgentId: 2,
    inventory: [{ sku: "USB-C Cable (5-pack)", listPrice: 0.09, floorPct: 18 }, { sku: "Wireless Mouse", listPrice: 0.16, floorPct: 18 }, { sku: "Desk Lamp", listPrice: 0.22, floorPct: 16 },
      { sku: "Smartphone (128GB)", listPrice: 0.32, floorPct: 14 }, { sku: "Laptop 14-inch", listPrice: 0.48, floorPct: 12 }, { sku: "Flight IST to BER", listPrice: 0.2, floorPct: 16 }, { sku: "Hotel - 2 nights", listPrice: 0.26, floorPct: 18 }] },
  { id: "quickcart", role: "seller", persona: "fast", name: "QuickCart", tagline: "Moves volume, quick to deal", repScore: 4.3, repDeals: 58,
    inventory: [{ sku: "USB-C Cable (5-pack)", listPrice: 0.08, floorPct: 25 }, { sku: "Ballpoint Pens (10-pack)", listPrice: 0.05, floorPct: 30 }, { sku: "Sticky Notes (12-pack)", listPrice: 0.06, floorPct: 28 },
      { sku: "Bus Ankara to Izmir", listPrice: 0.07, floorPct: 28 }, { sku: "Smartphone (128GB)", listPrice: 0.31, floorPct: 16 }] },
  { id: "fairtrade", role: "seller", persona: "balanced", name: "FairTrade Co", tagline: "Reasonable, reliable", repScore: 4.5, repDeals: 81,
    inventory: [{ sku: "USB-C Cable (5-pack)", listPrice: 0.085, floorPct: 22 }, { sku: "Notebook A5", listPrice: 0.04, floorPct: 25 }, { sku: "Wireless Mouse", listPrice: 0.15, floorPct: 20 },
      { sku: "Flight IST to BER", listPrice: 0.18, floorPct: 18 }, { sku: "Hotel - 2 nights", listPrice: 0.25, floorPct: 20 }, { sku: "Laptop 14-inch", listPrice: 0.46, floorPct: 14 }] },
  { id: "budgetbin", role: "seller", persona: "fast", name: "BudgetBin", tagline: "Cheap and cheerful", repScore: 3.6, repDeals: 33,
    inventory: [{ sku: "USB-C Cable (5-pack)", listPrice: 0.075, floorPct: 28 }, { sku: "Sticky Notes (12-pack)", listPrice: 0.055, floorPct: 30 }, { sku: "Ballpoint Pens (10-pack)", listPrice: 0.045, floorPct: 32 },
      { sku: "Bus Ankara to Izmir", listPrice: 0.06, floorPct: 30 }, { sku: "Smartphone (128GB)", listPrice: 0.29, floorPct: 18 }] },
  { id: "meridian", role: "seller", persona: "balanced", name: "Meridian Goods", tagline: "Solid mid-market", repScore: 4.1, repDeals: 47,
    inventory: [{ sku: "Wireless Mouse", listPrice: 0.15, floorPct: 20 }, { sku: "Desk Lamp", listPrice: 0.21, floorPct: 18 }, { sku: "Notebook A5", listPrice: 0.042, floorPct: 24 },
      { sku: "Flight IST to BER", listPrice: 0.19, floorPct: 17 }, { sku: "Hotel - 2 nights", listPrice: 0.24, floorPct: 19 }, { sku: "Laptop 14-inch", listPrice: 0.45, floorPct: 14 }] },
  { id: "drift", role: "seller", persona: "revenue", name: "Drift Trading", tagline: "New account, unproven", repScore: 2.2, repDeals: 4,
    inventory: [{ sku: "USB-C Cable (5-pack)", listPrice: 0.07, floorPct: 30 }, { sku: "Sticky Notes (12-pack)", listPrice: 0.05, floorPct: 30 }, { sku: "Bus Ankara to Izmir", listPrice: 0.055, floorPct: 32 }] },
];

const BUYERS: Agent[] = [
  { id: "rapidbuy", role: "buyer", persona: "fast", name: "RapidBuy", tagline: "Price-insensitive, closes quickly", repScore: 4.4, repDeals: 47 },
  { id: "vault", role: "buyer", persona: "revenue", name: "Vault Procurement", tagline: "Bargain hunter, grinds for the lowest price", repScore: 4.8, repDeals: 132 },
  { id: "atlas", role: "buyer", persona: "balanced", name: "Atlas Trading", tagline: "Reasonable, meets in the middle", repScore: 4.6, repDeals: 73 },
  { id: "drift-buyer", role: "buyer", persona: "balanced", name: "Drift (new account)", tagline: "Unproven — 3 disputed deals", repScore: 2.1, repDeals: 3 },
];

export function seedDemoCatalog(): void {
  if (agents.size > 0) return;
  // If a testnet seed exists, merge its on-chain agentId / wallet / repScore in.
  let onchain: Record<string, Partial<Agent>> = {};
  try {
    if (existsSync(SEED_FILE)) {
      const raw = JSON.parse(readFileSync(SEED_FILE, "utf8"));
      for (const s of raw.sellers ?? []) onchain[s.id] = s;
    }
  } catch {
    /* ignore */
  }
  for (const s of SELLERS) {
    const patch = onchain[s.id] ?? {};
    agents.set(s.id, { ...s, ...patch });
  }
  for (const b of BUYERS) agents.set(b.id, b);
}

export function listAgents(role?: "buyer" | "seller"): Agent[] {
  const all = [...agents.values()];
  return role ? all.filter((a) => a.role === role) : all;
}

export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}

const SKU_IMAGE: Record<string, string> = {
  "USB-C Cable (5-pack)": "🔌",
  "Wireless Mouse": "🖱️",
  "Ballpoint Pens (10-pack)": "🖊️",
  "Notebook A5": "📓",
  "Desk Lamp": "💡",
  "Sticky Notes (12-pack)": "🗒️",
  "Smartphone (128GB)": "📱",
  "Laptop 14-inch": "💻",
  "Flight IST to BER": "✈️",
  "Hotel - 2 nights": "🏨",
  "Bus Ankara to Izmir": "🚌",
};

/** Distinct SKUs across all sellers, with how many sellers carry each + min price. */
export function listCatalog(): { sku: string; sellers: number; from: number; image: string }[] {
  const map = new Map<string, { sellers: number; from: number }>();
  for (const a of listAgents("seller")) {
    for (const it of a.inventory ?? []) {
      const cur = map.get(it.sku) ?? { sellers: 0, from: Infinity };
      cur.sellers += 1;
      cur.from = Math.min(cur.from, it.listPrice);
      map.set(it.sku, cur);
    }
  }
  return [...map.entries()]
    .map(([sku, v]) => ({ sku, ...v, image: SKU_IMAGE[sku] ?? "📦" }))
    .sort((a, b) => a.from - b.from);
}

/** Sellers carrying a given sku, with the matching line item. */
export function sellersForSku(sku: string): { seller: Agent; item: NonNullable<Agent["inventory"]>[number] }[] {
  const out: { seller: Agent; item: NonNullable<Agent["inventory"]>[number] }[] = [];
  for (const a of listAgents("seller")) {
    const item = (a.inventory ?? []).find((i) => i.sku === sku);
    if (item) out.push({ seller: a, item });
  }
  return out;
}

export function newSessionId(): string {
  return randomUUID();
}

export function saveSession(session: NegotiationSession): void {
  sessions.set(session.id, session);
}

export function getSession(id: string): NegotiationSession | undefined {
  return sessions.get(id);
}
