# E.D.I.T.H. Store — Cloudflare deployment

This ZIP is flattened so Cloudflare's Wrangler deployment can see:
- ./wrangler.toml
- ./package.json
- ./src/worker.js
- ./public/index.html

## Cloudflare + GitHub

1. Put the CONTENTS of this ZIP into the root of a GitHub repository.
   Do not put the whole ZIP inside another `edithstore/` folder.
2. In Cloudflare Workers & Pages, connect that repository.
3. Set the root/project directory to the repository root (`/`).
4. Build command: `npx wrangler deploy`
5. Deploy command: `npx wrangler deploy`
6. The Wrangler config already points to `./public` for static assets.

The previous error happened because the repository had an extra `edithstore/` directory while Wrangler was looking for `./public`.

## Required Cloudflare resources

Create:
- D1 database: `edith-store`
- R2 bucket: `edith-apks`

Put the D1 database ID returned by Cloudflare into `wrangler.toml`.

Then initialize the database from `db/schema.sql`.

## Secrets

Add these as Cloudflare Worker secrets (never put real values in GitHub):
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET
- ADMIN_TOKEN

Use Razorpay Test Mode first.

## After deployment

Your website will be available on the Cloudflare-generated hostname.
That real URL is the one to enter in Razorpay onboarding under Website.

Admin:
`https://YOUR-HOST/qwerty.html`

Razorpay webhook:
`https://YOUR-HOST/api/webhooks/razorpay`

Do not send API secrets, OTPs, passwords or UPI PINs in chat.
