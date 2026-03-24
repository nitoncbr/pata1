# Testing

## Automated

```bash
npm test
npm run test:coverage
```

- **`routes/waitlist.utils.js`** — pure helpers (email normalization, referral IP check, etc.).
- **`tests/waitlist.utils.test.js`** — unit tests.
- **`tests/waitlist.api.test.js`** — HTTP tests with mocked Supabase (no real database).

## Manual smoke (server must be running)

```powershell
.\scripts\waitlist-smoke.ps1
# or
.\scripts\waitlist-smoke.ps1 -BaseUrl "http://localhost:3000"
```

## Security / manual QA

See **`docs/waitlist-security-checklist.md`** (rate limits, abuse cases, fuzz ideas, tooling).

## Production deploy (waitlist)

- **`docs/RAILWAY.md`** — Railway project, variables, domains, health checks.
- **`docs/DEPLOY_WAITLIST.md`** — env vars, Supabase SQL, smoke checks.
