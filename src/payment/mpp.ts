import { Keypair } from "@stellar/stellar-sdk";
import { Mppx, Store, stellar } from "@stellar/mpp/charge/server";
import { Mppx as MppxClient, stellar as stellarClient } from "@stellar/mpp/charge/client";
import { USDC_SAC_TESTNET } from "@stellar/mpp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serverMppx: any = null;

export function isMppConfigured(): boolean {
  return Boolean(
    process.env.STELLAR_RECIPIENT?.startsWith("G") &&
      process.env.MPP_SECRET_KEY &&
      process.env.MPP_SECRET_KEY.length >= 8
  );
}

export function isMppPayerConfigured(): boolean {
  return Boolean(process.env.STELLAR_PAYER_SECRET?.startsWith("S"));
}

function getServerMppx() {
  if (!isMppConfigured()) {
    throw new Error("MPP not configured: set STELLAR_RECIPIENT and MPP_SECRET_KEY");
  }
  if (!serverMppx) {
    const opts: Parameters<typeof stellar.charge>[0] = {
      recipient: process.env.STELLAR_RECIPIENT!,
      currency: USDC_SAC_TESTNET,
      network: "stellar:testnet",
      store: Store.memory(),
    };
    if (process.env.FEE_PAYER_SECRET?.startsWith("S")) {
      opts.feePayer = {
        envelopeSigner: Keypair.fromSecret(process.env.FEE_PAYER_SECRET),
      };
    }
    serverMppx = Mppx.create({
      secretKey: process.env.MPP_SECRET_KEY!,
      methods: [stellar.charge(opts)],
    });
  }
  return serverMppx;
}

/** Express req → Web Request for mppx handlers */
export function expressToWebRequest(
  req: { method: string; url: string; headers: Record<string, string | string[] | undefined> }
): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${req.url}`;
  return new Request(url, { method: req.method, headers });
}

/** Stellar transaction hashes are 64 lowercase hex chars. Pull one out of any blob. */
function findTxHash(...blobs: unknown[]): string | undefined {
  for (const blob of blobs) {
    const text = typeof blob === "string" ? blob : JSON.stringify(blob ?? "");
    const match = text.match(/\b[a-f0-9]{64}\b/);
    if (match) return match[0];
  }
  return undefined;
}

export async function handleMppCharge(
  req: Parameters<typeof expressToWebRequest>[0],
  amountUsdc: string,
  description: string
): Promise<{ status: number; body: unknown; headers?: Record<string, string>; txHash?: string }> {
  const mppx = getServerMppx();
  const webReq = expressToWebRequest(req);
  // The description lands in an HTTP header (Latin-1 only). Strip non-ASCII
  // chars (em-dashes, middots, …) so any product name is header-safe.
  const safeDescription = description.normalize("NFKD").replace(/[^\x20-\x7E]/g, "-");
  const result = await mppx.charge({ amount: amountUsdc, description: safeDescription })(webReq);

  if (result.status === 402) {
    const headers: Record<string, string> = {};
    result.challenge.headers.forEach((v: string, k: string) => {
      headers[k] = v;
    });
    return {
      status: 402,
      body: await result.challenge.text(),
      headers,
    };
  }

  const response = result.withReceipt(Response.json({ ok: true, paid: true }));
  const headers: Record<string, string> = {};
  response.headers.forEach((v: string, k: string) => {
    headers[k] = v;
  });
  const body = JSON.parse(await response.text());
  return {
    status: response.status,
    body,
    headers,
    txHash: findTxHash(headers, body, result.receipt, result),
  };
}

/**
 * Buyer agent pays via MPP (server-side key) — demo for web UI.
 */
export async function payDealAsBuyer(
  fulfillUrl: string,
  amountUsdc: string
): Promise<{ status: number; data: unknown }> {
  if (!isMppPayerConfigured()) {
    throw new Error("Set STELLAR_PAYER_SECRET (buyer S...) for MPP settlement");
  }

  MppxClient.create({
    methods: [
      stellarClient.charge({
        keypair: Keypair.fromSecret(process.env.STELLAR_PAYER_SECRET!),
        mode: "pull",
        onProgress(event) {
          console.log("[MPP]", event.type, event);
        },
      }),
    ],
  });

  const res = await fetch(fulfillUrl);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain text challenge */
  }
  return { status: res.status, data };
}
