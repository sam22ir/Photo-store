# Lamsa Studio

Lamsa Studio turns a phone photo of a product into a professional picture. Sellers on Instagram and Facebook upload a photo, pick a style (studio, luxury, outdoor, or ad poster), and download the result. Sellers buy credit packs with BaridiMob or CCP by uploading a payment receipt. The site owner checks each receipt and approves it in the admin page.

The whole site runs on one Cloudflare Worker. It uses a free-tier database (D1) for accounts and history, and a storage bucket (R2) for pictures and receipts.

## Setup on Cloudflare

1. **Create the database.** In the Cloudflare dashboard, go to Storage & Databases, then D1. Create a database named `lamsa-db`. Copy its ID and paste it in `wrangler.toml`, replacing `PASTE_D1_ID_HERE`.
2. **Create the tables.** Open the D1 Console for `lamsa-db`, paste the whole content of `schema.sql`, and run it once.
3. **Create the storage bucket.** Go to R2 and create a bucket named `lamsa-images`.
4. **Deploy from GitHub.** Go to Workers & Pages, click Create, then Import a repository. Pick the `lamsa-studio` repository and deploy it.
5. **Add the image key.** Go to the Worker's Settings, then Variables and Secrets. Add a secret named `IMAGE_API_KEY` with your image provider key. If the provider uses a different address, change `IMAGE_API_BASE` too.
6. **Become the admin.** Sign up on the site using the email in `ADMIN_EMAIL` (in `wrangler.toml`). That account gets admin access.
7. **Add your payment details.** Open `public/buy.html` and replace `[YOUR BARIDIMOB RIP]` and `[YOUR CCP NUMBER + KEY + NAME]` with your real details. Commit the change and the site updates.

## Costs

- Cloudflare Workers, D1 and R2 have free tiers that cover a small business to start.
- Each picture costs what your image provider charges for one image edit.
- Credit packs are your income. Price them above your image cost.

## Change the image provider

Only three settings matter: `IMAGE_API_BASE`, `IMAGE_MODEL` (in `wrangler.toml`), and the `IMAGE_API_KEY` secret. The provider must accept an image edit request at `/images/edits` in the same format as OpenAI.

## Project files

- `src/worker.js` is the server (API and private file access).
- `schema.sql` creates the database tables.
- `public/` holds the website pages and assets.
- `wrangler.toml` holds the Cloudflare settings.
