# Deploy waitlist to production (Railway / generic Node host)

**Railway-specific steps:** see **`docs/RAILWAY.md`**. This repo includes **`railway.toml`** (start command + `/health` check).

## 1. Supabase

1. Ensure the **`waitlist`** table exists with columns used by the API (see `CLAUDE.md` / `pata_cursor_prompt.txt`).
2. Run **`sql/waitlist_signup_ip.sql`** in the Supabase SQL editor so `signup_ip` exists (self-referral protection).
3. Confirm **Row Level Security** matches your threat model (service role bypasses RLS; if you ever use the anon key from the browser, lock down policies).

## 2. Environment variables (production)

Set these on the host (Railway → Variables):

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Usually auto | Railway sets this. |
| `SUPABASE_URL` | Yes | Project URL |
| `SUPABASE_SERVICE_KEY` | Yes | **Service role** (server-only; never expose to clients) |
| `PUBLIC_SITE_URL` | Recommended | `https://pataqr.com` — used in Resend emails (waitlist + unsubscribe links) |
| `RESEND_API_KEY` | Recommended | Without it, signups still work but **no welcome email** |

Optional tuning:

| Variable | Default | Purpose |
|----------|---------|---------|
| `WAITLIST_SIGNUP_MAX` | `5` | Max signups per IP per window |
| `WAITLIST_SIGNUP_WINDOW_MS` | `900000` (15 min) | Signup rate window |
| `WAITLIST_READ_MAX` | `120` | Max GET `/count` + `/position` per IP per minute |
| `WAITLIST_READ_WINDOW_MS` | `60000` | Read rate window |

Copy from **`.env.example`** and fill values locally; never commit `.env`.

## 3. DNS & HTTPS

- Point **`pataqr.com`** (and `www` if used) to your host.
- Terminate **HTTPS** at the edge (Railway / Cloudflare). The app sets `trust proxy: 1` so **rate limits** use `X-Forwarded-For` correctly.

## 4. Deploy the app

- **Start command:** `npm start` → `node server.js` (see `package.json`).
- **Health check:** `GET /health` → `{ "status": "ok", "product": "Pata" }`
- **Waitlist page:** `GET /waitlist` → `public/waitlist.html`
- **API:** `/api/waitlist` (POST join, GET count, GET position)

## 5. Post-deploy smoke tests

```bash
curl -sS "https://pataqr.com/health"
curl -sS "https://pataqr.com/api/waitlist/count"
curl -sS -o /dev/null -w "%{http_code}" "https://pataqr.com/api/waitlist/position"
# expect 400 (no ref)
```

From repo root (Windows):

```powershell
.\scripts\waitlist-smoke.ps1 -BaseUrl "https://pataqr.com"
```

## 6. Resend & email

- Domain **`pataqr.com`** should be verified in Resend.
- “From” address matches production: `PATA <hello@pataqr.com>` in `routes/waitlist.js`.
- Unsubscribe: `GET /unsubscribe?email=...` (implemented in `server.js`).

## 7. Automated tests (CI)

```bash
npm test
```

Uses mocked Supabase — safe on CI without secrets.

## 8. Production checklist

- [ ] `NODE_ENV=production`
- [ ] `SUPABASE_*` set; DB migrated (`signup_ip`)
- [ ] `PUBLIC_SITE_URL=https://pataqr.com`
- [ ] `RESEND_API_KEY` set (welcome emails)
- [ ] `/health` and `/waitlist` load over HTTPS
- [ ] One real signup + email received
- [ ] Duplicate email returns 409; disposable domain returns 400
