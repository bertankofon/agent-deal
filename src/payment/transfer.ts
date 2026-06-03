/**
 * Direct USDC (SEP-41 SAC) transfer, buyer-owner → winning seller-owner.
 * Two signing paths share one tx builder:
 *   - server key (STELLAR_PAYER_SECRET) for the demo / verification
 *   - Freighter in the browser (build XDR here, sign + submit client-side)
 */
import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  Address,
  Keypair,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { USDC_SAC_TESTNET } from "@stellar/mpp";

const RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const server = new rpc.Server(RPC_URL);

const toStroops = (usdc: number) => BigInt(Math.round(usdc * 1e7));

function transferOp(from: string, to: string, amount: number) {
  return new Contract(USDC_SAC_TESTNET).call(
    "transfer",
    new Address(from).toScVal(),
    new Address(to).toScVal(),
    nativeToScVal(toStroops(amount), { type: "i128" })
  );
}

async function buildPrepared(fromPub: string, to: string, amount: number) {
  const account = await server.getAccount(fromPub);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(transferOp(fromPub, to, amount))
    .setTimeout(60)
    .build();
  return server.prepareTransaction(tx);
}

async function submitAndConfirm(signedXdr: string): Promise<string> {
  const { TransactionBuilder: TB } = await import("@stellar/stellar-sdk");
  const tx = TB.fromXDR(signedXdr, PASSPHRASE);
  const sent = await server.sendTransaction(tx as any);
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  let get = await server.getTransaction(sent.hash);
  for (let i = 0; i < 15 && get.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    get = await server.getTransaction(sent.hash);
  }
  if (get.status !== "SUCCESS") throw new Error(`tx ${sent.hash} status ${get.status}`);
  return sent.hash;
}

/** Server-key settlement (buyer = STELLAR_PAYER_SECRET). Returns the tx hash. */
export async function payUsdcServer(to: string, amount: number): Promise<string> {
  const secret = process.env.STELLAR_PAYER_SECRET;
  if (!secret?.startsWith("S")) throw new Error("STELLAR_PAYER_SECRET not set");
  const kp = Keypair.fromSecret(secret);
  const prepared = await buildPrepared(kp.publicKey(), to, amount);
  prepared.sign(kp);
  return submitAndConfirm(prepared.toXDR());
}

/** Build an unsigned, Soroban-prepared tx for the browser to sign with Freighter. */
export async function buildTransferXdr(fromPub: string, to: string, amount: number): Promise<string> {
  const prepared = await buildPrepared(fromPub, to, amount);
  return prepared.toXDR();
}

/** Submit a Freighter-signed XDR. Returns the tx hash. */
export async function submitSignedXdr(signedXdr: string): Promise<string> {
  return submitAndConfirm(signedXdr);
}

export function buyerServerConfigured(): boolean {
  return Boolean(process.env.STELLAR_PAYER_SECRET?.startsWith("S"));
}
