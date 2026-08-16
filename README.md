# E.D.I.T.H. Android Store — Free-tier production starter

A professional Android-only storefront for E.D.I.T.H., designed around Cloudflare Pages/Workers + D1 + R2 and Razorpay.

## What is included

- Premium dark/purple responsive landing page inspired by the supplied Maya screenshots, but branded for E.D.I.T.H.
- Android-only product positioning
- 10-minute trial explanation and purchase CTA
- Features, pricing, FAQ, latest release section
- Terms / Privacy / Cancellation & Refund starter pages
- Razorpay server-side order creation and signature verification
- Razorpay webhook verification + idempotency
- D1 order, license, activation and release tables
- Email one-time-code login (no passwords) so checkout can't be impersonated by typing someone else's email
- Admin release center: paste a direct APK download link (e.g. a GitHub Releases asset), publish it, archive the previous live release
- Protected latest-APK download endpoint requiring a paid license
- Device-bound license activation (`/api/activate`) enforcing one device per license, with an admin "revoke" button to let a customer move to a new device
- Default product price: ₹59

## Important before going live

Replace the placeholder legal/support details. Do not claim capabilities the Android app cannot actually perform on a user's device. Do not put Razorpay secrets in frontend code or GitHub.

The 10-minute trial should be enforced inside the demo APK. This website only advertises and routes to the trial/purchase flow. A normal Android app cannot reliably uninstall its own APK after license purchase; the safe design is to disable/lock the demo and ask the user to install the licensed APK.

No APK can be guaranteed impossible to reverse engineer. Use release signing, R8/ProGuard, resource shrinking, tamper/signature checks and server-side authorization for practical protection.

## Free-tier architecture

- Cloudflare static assets: free on the free plan.
- Workers/D1: free allowances apply; limits apply.
- APK hosting: this project does **not** use R2. The admin panel takes a direct-download URL (e.g. a GitHub Releases asset link) and the worker 302-redirects licensed downloaders to it. Host the APK anywhere that gives you a stable direct-download link (GitHub Releases works well and is free).
- Razorpay: payment processing fees apply to successful transactions according to your active plan; onboarding/KYC is separate.
- Resend (optional): used only to email login codes; the free tier covers this project's volume comfortably. Without it, login codes are returned in the API response instead of emailed — fine for local testing, not for production.
- Custom .com domain is optional; start with the free Cloudflare Pages/Workers hostname.

## Deploy

1. Create a Cloudflare account.
2. Install Node.js on your PC and run: `npm install -g wrangler`
3. `wrangler login`
4. `wrangler d1 create edith-store`
5. Put the returned database ID into `wrangler.toml`.
6. `wrangler d1 execute edith-store --remote --file=./db/schema.sql`
7. Add secrets:
   - `wrangler secret put RAZORPAY_KEY_ID`
   - `wrangler secret put RAZORPAY_KEY_SECRET`
   - `wrangler secret put RAZORPAY_WEBHOOK_SECRET`
   - `wrangler secret put ADMIN_TOKEN`
   - `wrangler secret put RESEND_API_KEY` (optional — omit and login codes will be returned in the API response instead of emailed; only do this for local testing)
8. `wrangler deploy`

Re-running `wrangler d1 execute ... --file=./db/schema.sql` on an existing database is safe — every statement uses `CREATE TABLE IF NOT EXISTS` / `INSERT OR IGNORE`, so it won't touch existing data. Run it again any time you pull schema changes (e.g. the `login_otps` table added for email login).

The deployed hostname can then be submitted to Razorpay as the live website. Razorpay requires live website/app details for live API access and checks for policy/contact pages during activation.

## Razorpay later

Do not invent a URL. Use the real deployed E.D.I.T.H. URL. In Razorpay onboarding select Website, then enter the actual live URL once deployed. Later, in Dashboard, add the website details and policy pages, complete KYC, use Test Mode first, then switch to Live Mode when approved.

Webhook endpoint:
`https://YOUR-LIVE-HOSTNAME/api/webhooks/razorpay`

Use a webhook secret you generate yourself. Never send API secrets, OTPs, passwords or UPI PINs in chat.

## Admin release flow

Open `/qwerty.html`, enter the server admin token, paste the APK's direct-download URL (e.g. a GitHub Releases asset link), enter version/release notes/price and publish. The previous live release is archived and the new release becomes live. The website's latest-release card updates automatically.

The public download endpoint is:
`/api/download/latest?license=YOUR_LICENSE_KEY`

The same admin panel lists recent paid orders with each license's activation status, and lets you revoke a device activation so a customer can move their license to a new phone.

## License activation (device binding)

`POST /api/activate` with JSON body `{ "license_key": "...", "device_key_hash": "..." }`. The Android app should call this once on first run with a stable per-device identifier (hashed — don't send a raw hardware ID). Behavior:

- First call for a license: binds it to that device, returns `{ ok: true, status: "activated" }`.
- Same device calling again: `{ ok: true, status: "already-active" }`.
- A different device, while still bound: `409` with an error — the app should tell the user to contact support.
- After an admin revoke: the next call from any device re-binds and succeeds.

Keep this check server-side in the app (call `/api/activate` and trust its response) rather than caching a boolean locally, so a revoke actually takes effect.

## Recommended final Android integration

Trial APK:
- 10-minute timer
- conversation-only entitlement
- no customer API-key entry
- advanced actions locked
- purchase button to store

Paid APK:
- license validation
- first-install device binding via `POST /api/activate` (now implemented server-side — see "License activation" above)
- second-device rejection (enforced by `/api/activate`)
- admin recovery/revoke (available in `/qwerty.html`)
- full features according to the Android project and device permissions

Keep critical entitlement checks server-side; do not rely only on a boolean stored in the APK.
