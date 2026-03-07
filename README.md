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

### Integration / E2E / license tests

```bash
npm run test:e2e
npm run test:license
```

What each one does:
- `test:e2e`: remote endpoint checks for `validate-license` when env is configured.
- `test:license`: runs trial and paid-license checks against the deployed `validate-license` edge function.

Notes:
- `test:e2e` only runs the remote checks when `RUN_REMOTE_LICENSE_E2E=1`.
- `test:license` is intended for a deployed Supabase project with network access.

Main env vars used by those tests:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `TEST_LICENSE_EMAIL`, `TEST_LICENSE_KEY`, `TEST_TRIAL_EMAIL`

See `.env.example` for full examples.

## License Backend Contract

The extension now uses a license + device flow:

- The panel sends license operations to `POST /functions/v1/validate-license`.
- Expected actions: `activate`, `status`, `start_trial`, `release_device`.
- Expected request fields:
  - `email` only for `start_trial`
  - `licenseKey` for paid license actions
  - `deviceId`
  - optional `deviceName`
  - optional `appVersion`
- `trialDays: 2` for the free trial path
- Expected normalized response fields:
  - `plan`: `pro`, `trial`, or `free`
  - `email`
  - `trial_end`
  - `purchase_date`
  - `licenseKeyMasked` or `license_key_masked`
  - `device_id`
  - `device_name`

Suggested Supabase table:

- `licenses`
  - `email text`
  - `license_key text`
  - `plan text`
  - `trial_device_id text`
  - `trial_end timestamptz`
  - `purchase_date timestamptz`
  - `updated_at timestamptz`
- `license_devices`
  - `license_id uuid`
  - `device_id text`
  - `device_name text`
  - `last_seen_at timestamptz`
  - `released_at timestamptz`
  - `is_active boolean`

Device rule:
- one active device per license
- a second device is rejected with `LICENSE_IN_USE`
- stale devices can be reclaimed after the configured inactivity window
- free trial is also limited per device, not only per email

Gumroad verification should happen inside the Edge Function, not directly in the extension.

Recommended Gumroad env vars:
- `GUMROAD_ACCESS_TOKEN`
- `GUMROAD_PRODUCT_ID`
- optional fallback: `GUMROAD_PRODUCT_PERMALINK`

## Manual License Operations (Admin)

Use the script below to manually grant, trial, or revoke access in `public.licenses`.

### Grant License

```bash
npm run grant:license -- --email user@email.com
```

Also supported:

```bash
npm run grant:license -- --email user@email.com --plan trial --trial-days 2
npm run grant:license -- --email user@email.com --plan pro --license-key ABCD-1234-EFGH
npm run grant:license -- --email user@email.com --dry-run
```

### Revoke License

```bash
npm run revoke:license -- --email user@email.com
```

Also supported:

Notes:
- Uses `SUPABASE_SERVICE_ROLE_KEY`.
- Writes directly to `public.licenses`.
- `--revoke` sets plan to `free` and clears trial/purchase fields.

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
