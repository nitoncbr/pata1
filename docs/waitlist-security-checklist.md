# Waitlist — automated tests, manual QA & security review

## Automated tests

```bash
npm test                 # unit + API tests (mocked Supabase)
npm run test:coverage    # coverage for waitlist routes/utils
```

- **`tests/waitlist.utils.test.js`** — email normalization, referral IP logic, disposable detection, `signup_ip` migration error detection.
- **`tests/waitlist.api.test.js`** — HTTP behaviour with **mocked** `@supabase/supabase-js` (no real DB).

---

## Manual smoke (local)

1. Start the app: `npm run dev` (default `http://localhost:3000`).
2. Run: `powershell -File scripts/waitlist-smoke.ps1`  
   Or: `powershell -File scripts/waitlist-smoke.ps1 -BaseUrl https://your-ngrok-url.ngrok-free.app`

Expected: exit code 0; JSON responses for count/position; 400 for bad input.

---

## Manual / “pen test” style checks (waitlist API)

Use these on **staging** or **local** only; don’t hammer production.

### 1. Input validation

| Check | How |
|--------|-----|
| Missing email | `POST /api/waitlist` body `{}` → **400** |
| Invalid email | `"email": "nope"` → **400** |
| Disposable domain | `"email": "x@mailinator.com"` → **400** |

### 2. Rate limiting (`express-rate-limit`)

- Send **6+** `POST /api/waitlist` requests **from the same IP** within 15 minutes with **unique valid emails** (or use different bodies until limit hits).
- Expect **429** with `Too many requests` after the configured threshold (default **5** per 15 min).

**Note:** Behind ngrok/proxy, `trust proxy` must be set (already in `server.js`) or the limiter may mis-identify clients.

### 3. Referral & abuse controls

| Scenario | Expected |
|----------|----------|
| Sign up with `?ref=VALIDCODE` from **same IP** as referrer (requires `signup_ip` column in DB) | **200**, `referral_blocked: true`, referrer **not** moved |
| `user@gmail.com` then `u.s.e.r+1@gmail.com` | Second request → **409** duplicate (normalized) |

### 4. Information disclosure

| Check | Expected |
|--------|----------|
| `GET /api/waitlist/position?ref=CODE` | Response has **no** email field |
| Error messages | Generic for 500s; no stack traces to clients in production |

### 5. Injection / abuse payloads (quick fuzz)

Send `POST /api/waitlist` with JSON body (expect **400** or safe handling, not 500):

```json
{"email": "<script>alert(1)</script>@x.com"}
{"email": "a@b.com", "referred_by": "'; DROP TABLE waitlist;--"}
{"email": "a@b.com", "referred_by": "../../../etc/passwd"}
```

Supabase uses parameterized queries; still verify **no 500** from malformed input.

### 6. CORS / CSRF (if you add cookies later)

Current waitlist is **JSON API** + static page; CSRF is lower risk without cookie auth. If you add **cookie-based** dashboard auth on the same site, revisit CSRF tokens for state-changing routes.

---

## What automated tests do **not** replace

- **Real Supabase** RLS policies, indexes, and migrations (`signup_ip`).
- **Resend** deliverability and rate limits.
- **Load testing** (e.g. k6, Artillery) for concurrent signups.
- **Professional penetration test** before handling payments at scale.

---

## Suggested tools (optional)

- **Burp Suite / OWASP ZAP** — proxy API calls, repeat requests, inspect responses.
- **k6** — script `POST /api/waitlist` with ramping VUs to validate rate limits and server behaviour under load.
