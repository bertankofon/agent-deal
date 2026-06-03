/**
 * Conversational shopping assistant. Uses fal.ai (cheap LLM) for the wording
 * when FAL_KEY is set; falls back to templates otherwise. Product facts always
 * come from our catalog — the model only phrases the reply, never invents items.
 */
import { listCatalog } from "../store/memory.js";

const FAL_KEY = process.env.FAL_KEY ?? "";
const FAL_MODEL = process.env.FAL_MODEL ?? "google/gemini-flash-1.5";

export interface ChatResult {
  reply: string;
  action: "catalog" | "product" | "chat";
  sku?: string;
  products?: { sku: string; sellers: number; from: number; image?: string }[];
}

const SYSTEM =
  "You are Cartsy, a warm and concise shopping assistant for Agent Deal — a marketplace where autonomous agents negotiate prices with sellers on the shopper's behalf. " +
  "Reply in 1–2 short, friendly sentences. Never invent products; only refer to items in the provided catalog.";

export async function chatReply(message: string, history: { role: string; content: string }[] = []): Promise<ChatResult> {
  const catalog = listCatalog();
  const text = message.toLowerCase();

  // Intent: did they name a specific product?
  const matched = catalog.find((c) => text.includes(c.sku.toLowerCase()) || skuKeywords(c.sku).some((k) => text.includes(k)));
  const listIntent = /\b(what|which|show|list|browse|catalog|have|sell|available|products?|shop|buy|need|looking)\b/.test(text);

  if (matched) {
    const reply = await phrase(
      `The shopper wants "${matched.sku}". ${matched.sellers} sellers carry it from $${matched.from}. Tell them you'll negotiate with the sellers and find the best deal.`,
      `Great pick! Let me negotiate "${matched.sku}" with all ${matched.sellers} sellers and bring you the best options.`,
      history,
      message
    );
    return { reply, action: "product", sku: matched.sku, products: [matched] };
  }

  if (listIntent || history.length === 0) {
    const reply = await phrase(
      `List the kinds of products available: ${catalog.map((c) => c.sku).join(", ")}. Invite them to pick one.`,
      `Here's what's in the marketplace right now — pick anything and my agent will negotiate the best deal for you.`,
      history,
      message
    );
    return { reply, action: "catalog", products: catalog };
  }

  const reply = await phrase(
    `Answer the shopper helpfully and steer them toward picking a product. Catalog: ${catalog.map((c) => c.sku).join(", ")}.`,
    `I can find you the best deal on any of these — want to see the catalog?`,
    history,
    message
  );
  return { reply, action: "chat" };
}

function skuKeywords(sku: string): string[] {
  const map: Record<string, string[]> = {
    "USB-C Cable (5-pack)": ["cable", "usb", "charger"],
    "Wireless Mouse": ["mouse"],
    "Ballpoint Pens (10-pack)": ["pen", "pens"],
    "Notebook A5": ["notebook", "journal"],
    "Desk Lamp": ["lamp", "light"],
    "Sticky Notes (12-pack)": ["sticky", "notes", "post-it"],
    "Smartphone (128GB)": ["phone", "smartphone", "iphone", "mobile"],
    "Laptop 14-inch": ["laptop", "computer", "macbook", "notebook computer"],
    "Flight IST to BER": ["flight", "plane", "ticket to", "fly", "berlin"],
    "Hotel - 2 nights": ["hotel", "room", "stay", "accommodation"],
    "Bus Ankara to Izmir": ["bus", "coach", "izmir", "ankara"],
  };
  return map[sku] ?? [];
}

/** Phrase a reply with fal.ai if configured, else use the provided fallback. */
async function phrase(instruction: string, fallback: string, history: { role: string; content: string }[], message: string): Promise<string> {
  if (!FAL_KEY) return fallback;
  try {
    const convo = history.slice(-4).map((h) => `${h.role}: ${h.content}`).join("\n");
    const prompt = `${convo ? convo + "\n" : ""}user: ${message}\n\nInstruction: ${instruction}`;
    const res = await fetch(`https://fal.run/${FAL_MODEL.includes("/") ? "fal-ai/any-llm" : FAL_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: FAL_MODEL, system_prompt: SYSTEM, prompt }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallback;
    const data: any = await res.json();
    const out = data.output ?? data.response ?? data.text ?? data.choices?.[0]?.message?.content;
    return typeof out === "string" && out.trim() ? out.trim() : fallback;
  } catch {
    return fallback;
  }
}
