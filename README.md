# CompuSoft Computer Support

Business website for CompuSoft Computer Support, with service and contact pages.

## Cloudflare deployment

- The site assets are served from `dist/`, which mirrors the public HTML, CSS, JavaScript, and image files.
- The Cloudflare Worker in `src/index.js` handles `/api/contact` and serves static assets.
- Configure the `EMAIL` send-email binding in `wrangler.jsonc` before deploying.

## Private business dashboard

The owner dashboard is served at `/admin.html` and uses email magic links for sign-in. The Worker sends a one-time link to the configured admin email, expires it after 10 minutes, and grants an eight-hour signed session after redemption. Links are single-use; the token stays in the URL fragment until the browser redeems it, so it is not sent in the initial page request. `ADMIN_EMAIL` and `ADMIN_SESSION_SECRET` are Worker secrets. The existing `EMAIL` binding must allow mail to the same admin address. The D1 database stores customers, quotes, sales, invoices, website inquiries, hashed login lockouts, and one-time link hashes.

Contact form messages and product quote requests are saved as inquiries. Wrangler's custom domain publishes the Worker at `www.zanderbooyzen.com`; it provisions DNS and certificates for the Worker.

The dashboard stores customer contact details and business records. It is not an accounting or tax system; do not store card numbers, passwords, or other authentication secrets in notes.
