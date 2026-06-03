# Setup (your machine)

## 1. Install & run

```bash
cd agent-deal
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:8787 — header should show `8004 · MPP · x402` status.

## 2. Testnet wallets

Do this **twice** (seller + buyer):

1. Create keypair: https://lab.stellar.org/account/create  
2. Fund XLM: https://lab.stellar.org/account/fund  
3. Add USDC trustline (button on fund page)  
4. USDC: https://faucet.circle.com → Stellar Testnet → paste `G...`

## 3. Fill `.env`

```env
PORT=8787
APP_BASE_URL=http://localhost:8787

# Seller receives USDC
STELLAR_RECIPIENT=G...

# Buyer pays (demo: backend holds buyer key)
STELLAR_PAYER_SECRET=S...

# MPP (any long random string)
MPP_SECRET_KEY=change-me-to-random-secret

# x402 — required for x402 button
OZ_API_KEY=...   # https://channels.openzeppelin.com/testnet/gen
STELLAR_NETWORK=stellar:testnet

# 8004 feedback (after register)
STELLAR_SECRET_KEY=S...   # same as deployer or buyer
SELLER_STELLAR_AGENT_ID=42  # from npm run register:seller
```

Restart `npm run dev`. Header: `MPP ✓ · x402 ✓`.

## 4. Register seller on 8004 (optional, 2 min)

```bash
npm run register:seller
```

Copy `SELLER_STELLAR_AGENT_ID` into `.env`, restart server.

## 5. Verify end-to-end

1. Negotiate → deal  
2. **Settle · MPP** → should NOT say "simulated"  
3. Check testnet tx on [Stellar Expert](https://stellar.expert/explorer/testnet)

## Troubleshooting

| Error | Fix |
|-------|-----|
| `op_no_trust` | USDC trustline on **both** G accounts |
| MPP simulated | Missing `STELLAR_RECIPIENT`, `MPP_SECRET_KEY`, or `STELLAR_PAYER_SECRET` |
| x402 fails | Set `OZ_API_KEY`; both accounts need USDC |
| 8004 off | `STELLAR_SECRET_KEY` in `.env` |
