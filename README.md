# CompuSoft Computer Support

Website for CompuSoft Computer Support. The homepage is an email problem-report form; the previous services and pricing page is preserved as `index_old.html`.

## Cloudflare deployment

- The site assets are served from `dist/`, which mirrors the public HTML, CSS, JavaScript, and image files.
- The Cloudflare Worker in `src/index.js` handles `/api/contact` and `/api/problem-report`, sends problem reports to the configured email address, and serves static assets.
- Configure the `EMAIL` send-email binding in `wrangler.jsonc` before deploying.

Contact form messages and product quote requests are saved as inquiries. Wrangler's custom domain publishes the Worker at `www.compusoft.co.za`; it provisions DNS and certificates for the Worker.
