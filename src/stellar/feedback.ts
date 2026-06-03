/**
 * Build unsigned XDR for ERC-8004 write actions so the USER signs them with
 * Freighter (real, interactive — not mock):
 *   - give_feedback  → Reputation Registry
 *   - register_with_uri → Identity Registry
 * Submit reuses payment/transfer.submitSignedXdr.
 */
import { rpc, Contract, TransactionBuilder, nativeToScVal, Address, BASE_FEE } from "@stellar/stellar-sdk";
import { createHash } from "crypto";

const RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const IDENTITY = "CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH";
const REPUTATION = "CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55";
const server = new rpc.Server(RPC_URL);

const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const str = (s: string) => nativeToScVal(s, { type: "string" });

async function prepareXdr(from: string, op: ReturnType<Contract["call"]>): Promise<string> {
  const account = await server.getAccount(from);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(120)
    .build();
  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}

/** value is 0–100. The buyer (caller) rates a seller agent. */
export async function buildGiveFeedbackXdr(from: string, agentId: number, value: number, tag = "starred"): Promise<string> {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const hash = createHash("sha256").update(`${from}:${agentId}:${v}:${tag}`).digest();
  const op = new Contract(REPUTATION).call(
    "give_feedback",
    new Address(from).toScVal(),
    u32(agentId),
    nativeToScVal(BigInt(v), { type: "i128" }),
    u32(0),
    str(tag),
    str(""),
    str(""),
    str(""),
    nativeToScVal(hash, { type: "bytes" })
  );
  return prepareXdr(from, op);
}

/** Register a new agent identity owned by the caller. */
export async function buildRegisterXdr(from: string, name: string, description: string): Promise<string> {
  const meta = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description,
    supportedTrust: ["reputation"],
  };
  const dataUri = "data:application/json;base64," + Buffer.from(JSON.stringify(meta)).toString("base64");
  const op = new Contract(IDENTITY).call("register_with_uri", new Address(from).toScVal(), str(dataUri));
  return prepareXdr(from, op);
}
