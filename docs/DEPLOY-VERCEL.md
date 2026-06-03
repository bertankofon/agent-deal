# Vercel deploy — Agent Deal

## Şu an canlıda ne var?

`agent-deal.vercel.app` adresinde **senin Agent Deal uygulaman yok**.

Orada Vercel’in varsayılan **Next.js “Create Next App”** şablonu açılıyor (“Get started by editing app/page.tsx”). Bu, GitHub’daki `bertankofon/agent-deal` reposundan gelmiyor; yanlış proje veya boş Next.js projesi bağlanmış.

**Doğru canlı site:** açık mavi arka planlı **“Agentic Commerce on Stellar — Agent Deal”** sayfası (localhost:8787 ile aynı).

---

## Ne yapmalısın? (5 dakika)

### A) Yanlış projeyi düzelt (önerilen)

1. https://vercel.com/dashboard → **agent-deal** projesine gir.
2. **Settings** → **Git**:
   - Repository **`bertankofon/agent-deal`** olmalı.
   - Değilse **Disconnect** → **Connect Git Repository** → `agent-deal` seç.
3. **Settings** → **General**:
   - **Root Directory:** boş veya `.` (alt klasör değil).
   - **Framework Preset:** **Other** (Next.js olmamalı).
4. **Deployments** → son deployment → **⋯** → **Redeploy** (Use existing Build Cache: kapalı).

### B) Sıfırdan doğru proje (A işe yaramazsa)

1. Dashboard’da eski **agent-deal** projesini **Delete** (yanlış Next.js olan).
2. https://vercel.com/new → **Import** → `bertankofon/agent-deal`.
3. **Project Name:** `agent-deal` → URL: `agent-deal.vercel.app`.
4. Framework: **Other** — Build: `npm run check`, Output: boş.
5. **Deploy**.

### C) Deploy sonrası kontrol

Tarayıcıda aç:

- https://agent-deal.vercel.app → **Agent Deal** başlığı, chat UI (Next.js logosu **olmamalı**).
- https://agent-deal.vercel.app/api/health → `{"ok":true,...}` JSON.

---

## Environment variables (isteğe bağlı)

Gerçek USDC settle + LLM için Vercel → **Settings** → **Environment Variables** (Production):

| Değişken | Açıklama |
|----------|----------|
| `STELLAR_SECRET_KEY` | Seller S… |
| `STELLAR_PAYER_SECRET` | Buyer S… |
| `STELLAR_RECIPIENT` | Seller G… |
| `MPP_SECRET_KEY` | Uzun random string |
| `SELLER_STELLAR_AGENT_ID` | 8004 agent id |
| `STELLAR_NETWORK` | `stellar:testnet` |
| `FAL_KEY` | fal.ai (opsiyonel) |

`APP_BASE_URL` repoda `vercel.json` içinde `https://agent-deal.vercel.app` olarak ayarlı.

Keysiz de demo (negotiation + mock settle) çalışır.

---

## CLI ile (alternatif)

```bash
cd agent-deal
vercel login
vercel link    # project: agent-deal
vercel --prod
```

---

## Serverless notu

Session’lar bellekte. Canlıda negotiate → settle bazen kopabilir; UI ve müzakere demo için yeterli. Tam güvenilir settle için localhost veya kalıcı sunucu (Railway, Fly.io) daha iyi.
