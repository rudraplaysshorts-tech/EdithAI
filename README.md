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
- Admin release center: upload a new APK, publish it, archive the previous live release
- Protected latest-APK download endpoint requiring a paid license
- Default product price: ₹59

## Important before going live

Replace the placeholder legal/support details. Do not claim capabilities the Android app cannot actually perform on a user's device. Do not put Razorpay secrets in frontend code or GitHub.

The 10-minute trial should be enforced inside the demo APK. This website only advertises and routes to the trial/purchase flow. A normal Android app cannot reliably uninstall its own APK after license purchase; the safe design is to disable/lock the demo and ask the user to install the licensed APK.

No APK can be guaranteed impossible to reverse engineer. Use release signing, R8/ProGuard, resource shrinking, tamper/signature checks and server-side authorization for practical protection.

## Free-tier architecture

- Cloudflare static assets: free on the free plan.
- Workers/D1: free allowances apply; limits apply.
- R2: current free monthly allowance includes 10 GB-month storage, 1M Class A operations, 10M Class B operations and free egress. APK storage above the free allowance is billable.
- Razorpay: payment processing fees apply to successful transactions according to your active plan; onboarding/KYC is separate.
- Custom .com domain is optional; start with the free Cloudflare Pages/Workers hostname.

## Deploy

1. Create a Cloudflare account.
2. Install Node.js on your PC and run: `npm install -g wrangler`
3. `wrangler login`
4. `wrangler d1 create edith-store`
5. Put the returned database ID into `wrangler.toml`.
6. `wrangler r2 bucket create edith-apks`
7. `wrangler d1 execute edith-store --remote --file=./db/schema.sql`
8. Add secrets:
   - `wrangler secret put RAZORPAY_KEY_ID`
   - `wrangler secret put RAZORPAY_KEY_SECRET`
   - `wrangler secret put RAZORPAY_WEBHOOK_SECRET`
   - `wrangler secret put ADMIN_TOKEN`
9. `wrangler deploy`

The deployed hostname can then be submitted to Razorpay as the live website. Razorpay requires live website/app details for live API access and checks for policy/contact pages during activation.

## Razorpay later

Do not invent a URL. Use the real deployed E.D.I.T.H. URL. In Razorpay onboarding select Website, then enter the actual live URL once deployed. Later, in Dashboard, add the website details and policy pages, complete KYC, use Test Mode first, then switch to Live Mode when approved.

Webhook endpoint:
`https://YOUR-LIVE-HOSTNAME/api/webhooks/razorpay`

Use a webhook secret you generate yourself. Never send API secrets, OTPs, passwords or UPI PINs in chat.

## Admin release flow

Open `/qwerty.html`, enter the server admin token, choose an APK, enter version/release notes/price and publish. The previous live release is archived and the new release becomes live. The website's latest-release card updates automatically.

The public download endpoint is:
`/api/download/latest?license=YOUR_LICENSE_KEY`

## Recommended final Android integration

Trial APK:
- 10-minute timer
- conversation-only entitlement
- no customer API-key entry
- advanced actions locked
- purchase button to store

Paid APK:
- license validation
- first-install device binding
- second-device rejection
- admin recovery/revoke
- full features according to the Android project and device permissions

Keep critical entitlement checks server-side; do not rely only on a boolean stored in the APK.
