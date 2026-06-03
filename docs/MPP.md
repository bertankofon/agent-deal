# MPP (Machine Payments Protocol) — Agent Deal notları

Kaynak: [Stellar Agentic Payments](https://developers.stellar.org/docs/build/agentic-payments) · [MPP overview](https://developers.stellar.org/docs/build/agentic-payments/mpp) · [Charge guide](https://developers.stellar.org/docs/build/agentic-payments/mpp/charge-guide) · [Channel guide](https://developers.stellar.org/docs/build/agentic-payments/mpp/channel-guide)

## MPP nedir?

Stripe destekli, HTTP **402 Payment Required** üzerinden makine-ödeme protokolü. Stellar’da USDC, Soroban **SAC transfer** ile settle olur.

## x402 vs MPP (Agent Deal için)

| | x402 | MPP Charge | MPP Channel |
|--|------|------------|-------------|
| Facilitator | Evet (OZ Channels) | **Hayır** | Hayır |
| Tx / istek | 1 on-chain | 1 on-chain | Off-chain commit, seyrek settle |
| Kurulum | Kolay + API key | `STELLAR_RECIPIENT` + `MPP_SECRET_KEY` | Kanal kontratı deploy |
| Agent Deal | v0.3 | **v0.2 (şimdi)** | v0.4 (çok tur agent) |

**Agent Deal seçimi:** Tek anlaşma başına ödeme → **MPP Charge**. Negotiation sonrası `GET /api/deal/:id/fulfill` (402 → öde → 200).

## Charge akışı (docs özeti)

1. Client `GET /fulfill` → **402** + ödeme şartları (USDC, miktar, recipient)
2. Client Soroban SAC transfer tx imzalar (pull: server broadcast eder)
3. Client credential ile retry → server simulate eder → broadcast → **200 + receipt**

## Channel akışı (ileride)

1. **Deposit:** one-way-channel kontratına USDC (`C...` contract)
2. Her API çağrısı: **off-chain** cumulative commitment imzası (ed25519)
3. **Close:** tek on-chain tx ile toplam ödeme

Yüksek frekanslı buyer agent (100+ tur pazarlık + micro API) için ideal — hackathon MVP’de şart değil.

## Agent Deal entegrasyonu

```
Negotiate (off-chain) → agreed price
    → POST /api/settle/:sessionId  (buyer key, MPP client)
        → GET /api/deal/:id/fulfill  (MPP Charge 402→200)
            → give_feedback (8004, optional)
```

### Env

```env
STELLAR_RECIPIENT=G...      # seller receives USDC
MPP_SECRET_KEY=...          # MPP credential HMAC
STELLAR_PAYER_SECRET=S...   # buyer agent (demo: backend holds key)
FEE_PAYER_SECRET=S...       # optional: buyer needs no XLM
SELLER_STELLAR_AGENT_ID=42  # optional: on-chain feedback
```

### Testnet hazırlık

1. [Lab](https://lab.stellar.org/account/create) → keypair
2. Friendbot XLM
3. USDC trustline + [Circle faucet](https://faucet.circle.com)
4. Payer ve recipient **ikisi de** trustline (yoksa `op_no_trust`)

## Paketler

- `@stellar/mpp` — Charge + Channel server/client
- `mppx` — 402 framework
- `USDC_SAC_TESTNET` = `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
