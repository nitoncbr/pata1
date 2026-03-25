# Deploy PATA on Railway

This repo includes **`railway.toml`** so deploy settings (start command, health check) are version-controlled.

## Prerequisites

- GitHub (or GitLab) repo pushed with this code
- Railway account: [railway.app](https://railway.app)
- **Supabase** URL + service role key
- Optional: **Resend** API key (waitlist welcome emails)

## 1. Create the service

1. Open **Railway** → **New Project** → **Deploy from GitHub** (or empty project → connect repo).
2. Select the **pata** repository and the branch you deploy from (e.g. `main`).
3. Railway will detect **Node** and run **`npm install`** (uses `package-lock.json` when present) then **`npm start`** from `railway.toml`.

No Dockerfile is required; **Railpack** builds the app automatically.

## 2. Environment variables

In the service → **Variables**, add:

| Name | Example | Required |
|------|---------|----------|
| `NODE_ENV` | `production` | Yes |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Yes |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service role, server-only) | Yes |
| `ENCRYPTION_KEY` | 64-char hex (32 bytes) — see `.env.example` | Yes |
| `PUBLIC_SITE_URL` | `https://pataqr.com` or your Railway URL first | Recommended |
| `RESEND_API_KEY` | `re_...` | Optional (emails skipped if empty) |

Railway injects **`PORT`** automatically — do not set it manually unless you know you need to.

Copy any other secrets from `.env.example` (Twilio, etc.) as you enable those features.

**Important:** After changing variables, **Redeploy** so the new process picks them up.

## 3. Domains

1. Service → **Settings** → **Networking** → **Generate domain** (e.g. `pata-production.up.railway.app`).
2. Test: `curl https://<your-railway-domain>/health` → `{"status":"ok",...}`.
3. For production, add a **Custom Domain** (e.g. `pataqr.com`) and point DNS per Railway’s instructions (CNAME / A record).

Set **`PUBLIC_SITE_URL`** to the canonical URL users see (custom domain once live).

## 4. Health checks

`railway.toml` sets:

- **`healthcheckPath`** = `/health` (must return **HTTP 200**)
- **`healthcheckTimeout`** = 120 seconds (adjust if cold starts are slower)

`server.js` exposes `GET /health`.

## 5. Logs & debugging

- **Deployments** tab → select a deploy → **View logs**.
- If the app **exits on boot** (e.g. missing `SUPABASE_*` in production), check logs — `config/validateEnv.js` exits with code 1 when required vars are missing.

## 6. CLI (optional)

```bash
npm i -g @railway/cli
railway login
railway link   # in repo root
railway variables
railway up     # deploy from local directory
```

## 7. Checklist

- [ ] Variables set; `NODE_ENV=production`
- [ ] `/health` returns 200 on the Railway URL
- [ ] `/waitlist` loads in the browser
- [ ] Custom domain + `PUBLIC_SITE_URL` aligned

See also **`docs/DEPLOY_WAITLIST.md`** for Supabase SQL and waitlist-specific checks.
