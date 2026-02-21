# GrabClientsNow Extension

## Setup

```bash
npm install
```

## Test Scripts

### Unit tests

```bash
npm test
```

### Integration / E2E / billing tests

```bash
npm run test:e2e
npm run test:webhook
npm run test:billing
npm run test:magiclink
npm run test:prod-readiness
npm run test:webhook:health
```

What each one does:
- `test:webhook`: sends signed Stripe-like events to `stripe-webhook` and checks response.
- `test:billing`: validates billing flow in current mode (magic-link-only by default).
- `test:magiclink`: full lifecycle test (creates temp user, OTP path, webhook, DB check, cleanup).
- `test:prod-readiness`: broader readiness check (idempotency, refund/dispute, users row policy).
- `test:webhook:health`: operational health check with latency threshold and optional alert webhook.

Main env vars used by those tests:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Optional: `STRIPE_SECRET_KEY`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`
- Optional policy/health vars: `PROD_EXPECTED_FINAL_PLAN`, `PROD_WEBHOOK_MAX_MS`, `WEBHOOK_HEALTH_MAX_MS`, `ALERT_WEBHOOK_URL`

See `.env.example` for full examples.

## Manual Plan Operations (Admin)

Use the script below when you sell outside Stripe and need to manually grant/revoke access for an existing extension user.

### Grant Pro

```bash
npm run grant:pro -- --email user@email.com
```

Also supported:

```bash
npm run grant:pro -- --user-id 00000000-0000-0000-0000-000000000000
npm run grant:pro -- --email user@email.com --plan trial --trial-days 7
npm run grant:pro -- --email user@email.com --dry-run
```

### Revoke Pro (last script created)

```bash
npm run revoke:pro -- --email user@email.com
```

Also supported:

```bash
npm run revoke:pro -- --user-id 00000000-0000-0000-0000-000000000000
npm run revoke:pro -- --email user@email.com --clear-stripe-id
```

Notes:
- Uses `SUPABASE_SERVICE_ROLE_KEY`.
- Resolves user from `auth.users` (by email or id) and upserts `public.users`.
- `--revoke-pro` sets plan to `free` and clears `purchase_date` / `refund_window`.

## Build (minified + obfuscated)

```bash
npm run build
```

Output: `dist/`

Load in Chrome:
- `chrome://extensions`
- Enable Developer mode
- Click **Load unpacked**
- Select the `dist/` folder

## Build dev (minified only, no obfuscation)

```bash
npm run build:dev
```

## Build and create zip package

```bash
npm run pack
```

Output zip: `grabclientsnow-extension.zip` (if `zip` is available in your system).

## Notes

- Source files are modularized under `src/` (`src/panel/*`, `src/background/*`).
- Build pipeline is handled by `scripts/build.mjs` using:
  - `esbuild` for bundling/minification
  - `javascript-obfuscator` for code obfuscation
