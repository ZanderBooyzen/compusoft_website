# CompuSoft Computer Support

Business website for CompuSoft Computer Support, with service and contact pages.

## Cloudflare deployment

- The site assets are served from `dist/`, which mirrors the public HTML, CSS, JavaScript, and image files.
- The Cloudflare Worker in `src/index.js` handles `/api/contact` and serves static assets.
- Configure the `EMAIL` send-email binding in `wrangler.jsonc` before deploying.

## Private business dashboard

The owner dashboard is served at `/admin.html`. It uses Cloudflare Access for owner sign-in and a D1 database for customer, quote, sale, invoice, and public website inquiry records. Contact form messages and product quote requests are saved as inquiries; the Worker validates the Access JWT and allowed owner email on both the dashboard and every admin API request.

The D1 database `compusoft-business` has been created and its initial schema is applied. Cloudflare Access protects `/admin.html` and `/api/admin/*` for the owner account. After Access sign-in, the dashboard also requires its own username and password. The password is stored as a PBKDF2-SHA-256 hash; the username, hash, and session signing key are Worker secrets (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET`). Wrangler's custom domain publishes the Worker at `www.zanderbooyzen.com`; it provisions DNS and certificates for the Worker.

The dashboard stores customer contact details and business records. It is not an accounting or tax system; do not store card numbers, passwords, or other authentication secrets in notes.
