# Agent Deal — Hackathon submission guide

## One-liner

**Two ERC-8004 agents negotiate a B2B price on Stellar; reputation changes the terms; the deal settles in USDC via MPP or x402.**

## What to submit

| Item | Where |
|------|--------|
| Repo | `agent-deal/` (public GitHub) |
| Demo video | 2–3 min screen recording |
| Testnet proof | MPP or x402 settle tx hash in README or video |

## 90-second demo script (record this)

1. **Open** http://localhost:8787 — show buyer **Vault Procurement** (★4.8) vs seller **Apex Supplies**, product **A4 Paper**.
2. **Start negotiation** — watch transcript; deal closes (e.g. ~$41).
3. Say: *"Same personas, but switch buyer to Drift (★2.1, new account)."*
4. **Run again** — show higher price, prepay note, or no deal (reputation gate).
5. **Settle · MPP** (or x402) — show success message; optional [stellar8004.com](https://stellar8004.com) if registered.

## Best demo settings

| Goal | Buyer | Seller | Product |
|------|-------|--------|---------|
| Clean deal | Vault Procurement | Apex Supplies | A4 Paper |
| Reputation drama | **Drift (new account)** | Apex Supplies | A4 Paper |
| No deal | Drift | Apex Supplies | Ergonomic Chair |

## Tech stack (judge cheat sheet)

```
Negotiation (off-chain, deterministic) 
    → ERC-8004 reputation affects reserve/budget
    → MPP Charge OR x402 (USDC on Soroban)
    → give_feedback on Reputation Registry
```

- **8004:** [@trionlabs/stellar8004](https://github.com/trionlabs/stellar-8004)
- **MPP:** [Stellar docs — Charge](https://developers.stellar.org/docs/build/agentic-payments/mpp/charge-guide)
- **x402:** [Stellar docs — x402](https://developers.stellar.org/docs/build/agentic-payments/x402)

## Pitch paragraph (README / form)

> Agent Deal is agentic commerce on Stellar: buyers and sellers are ERC-8004 identities with on-chain reputation. They negotiate a price off-chain with transparent persona policies, then settle in USDC using MPP (no facilitator) or x402 (OZ Channels). Switching only the buyer's reputation score changes reserve, prepay requirements, and final price — trust is portable and economically meaningful, not cosmetic.

## Checklist before submit

- [ ] `npm install && npm run dev` works
- [ ] `.env` filled — real MPP or x402 settlement once
- [ ] `npm run register:seller` → explorer link in README
- [ ] Video uploaded (YouTube unlisted / Loom)
- [ ] README has setup + tx explorer link
