# Agent Deal

**A marketplace where AI agents negotiate a price for you and settle in USDC on Stellar — and where on-chain reputation changes the outcome.**

Pick a buyer strategy and a seller strategy, watch the two agents haggle, then settle the agreed price in USDC. Every agent carries an [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) reputation (via [@trionlabs/stellar8004](https://github.com/trionlabs/stellar-8004)). The twist: a low-reputation counterparty gets a stiffer reserve and a prepay demand — reputation literally moves the deal.

Inspired by [agent-commerce](https://github.com/bertankofon/agent-commerce) (ERC-8004 + x402 on Base), re-built natively on Stellar.

## How it works

| Layer | What | Where it lives |
|-------|------|----------------|
| Strategy | 3 ready-made personas per side — **Fast · Revenue-max · Balanced** | `src/negotiate/personas.ts` |
| Negotiation | Deterministic price policy (LLM-free, never faceplants). Personas = real numbers, not prompt tone | `src/negotiate/engine.ts` |
| Reputation gate | Counterparty's 8004 score adjusts the seller's reserve & buyer's budget; low rep → prepay demand | `src/negotiate/engine.ts` |
| Identity & reputation | ERC-8004 Identity + Reputation registries on Stellar testnet | `src/stellar/trust.ts` |
| Settlement | [MPP Charge](https://developers.stellar.org/docs/build/agentic-payments/mpp) — owner→owner USDC (SEP-41 SAC), real tx hash linked to stellar.expert | `src/payment/mpp.ts` |
| UI | One clean static page | `public/index.html` |

**Owner-wallet model.** Agents never hold funds. The buyer-owner wallet pays and the seller-owner wallet receives; the agent is just the strategy negotiating on the owner's behalf. On approval the transfer runs owner→owner on-chain.

**No per-user deploy.** A fixed roster of agents is registered once on 8004 and serves everyone; personas are attached at request time. Negotiations run in parallel; only same-wallet settlement is serialized (Stellar sequence numbers).

## Personas (numeric policy, not vibes)

| | Fast | Revenue-max | Balanced |
|---|---|---|---|
| **Buyer** | pays near list, closes fast | bargain hunter, grinds low | meets in the middle |
| **Seller** | moves volume, concedes early | holds the margin | meets in the middle |

A *Revenue-max* seller deterministically lands higher than a *Fast* seller; a *bargain* buyer lands lower than a *Fast* buyer. The LLM (optional, future) only narrates — the numbers decide accept / counter / walk-away.

## Quick start

```bash
cd agent-deal
cp .env.example .env
npm install
npm run dev          # http://localhost:8787
```

Works out of the box in **demo mode** (no keys): real negotiation + reputation gate, simulated settlement. Add testnet keys for real USDC.

## Demo script (the kill shot)

1. Seller = **Apex Supplies** (Revenue-max, ★4.7), buyer = **Vault Procurement** (Revenue-max, ★4.8) → they close a deal.
2. Switch the buyer to **Drift (new account)** — same Balanced strategy as Meridian, but ★2.1.
3. Same seller now demands full prepayment, lifts its reserve above Drift's budget → **no deal**.

Reputation changed the negotiation outcome live. That's the point a pure LLM-haggle demo can't make.

## Enable real settlement (optional)

1. Create two keypairs at [Stellar Lab](https://lab.stellar.org/account/create), fund XLM + open a USDC trustline + [Circle faucet](https://faucet.circle.com) for **both** (buyer-owner and seller-owner — must be different wallets).
2. Register the seller agent on-chain: `npm run register:seller` → set `SELLER_STELLAR_AGENT_ID`.
3. Set `STELLAR_SECRET_KEY` (seller-owner), `STELLAR_RECIPIENT` (seller-owner G…), `STELLAR_PAYER_SECRET` (buyer-owner), `MPP_SECRET_KEY` (any long string).
4. `npm run doctor` to verify config, then `npm run dev`.

> Each real settle spends real testnet USDC — top up the buyer-owner via the faucet before a live demo.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Network, owner wallets, registered agent |
| GET | `/api/roster` | Buyer + seller agents with reputation |
| GET | `/api/products` | Demo catalog |
| POST | `/api/negotiate` | `{ productId, buyerAgentId, sellerAgentId }` → session + transcript |
| POST | `/api/settle/:id` | Buyer-owner pays the agreed price (MPP) |
| GET | `/api/deal/:id/fulfill` | MPP-gated (402 → 200 + on-chain transfer) |
| GET | `/api/health` | Config status |

## Scripts

```bash
npm run dev               # server with reload
npm run doctor            # check .env configuration
npm run register:seller   # register an agent on 8004 testnet
npm run check             # typecheck
```

## Roadmap

- [x] 3 personas/side, deterministic engine
- [x] Reputation-gated negotiation (prepay + reserve shift)
- [x] MPP settlement (owner→owner), real tx link, feedback to Reputation Registry
- [ ] Optional LLM narration layer
- [ ] Per-user wallet connect (Freighter) instead of server-held keys
- [ ] MPP Channel for high-frequency multi-round sessions

MIT
