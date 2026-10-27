# CompuSoft Computer Support

Business website for CompuSoft Computer Support, with service and contact pages.

## Cloudflare deployment

- The site assets are served from `dist/`, which mirrors the public HTML, CSS, JavaScript, and image files.
- The Cloudflare Worker in `src/index.js` handles `/api/contact` and serves static assets.
- Configure the `EMAIL` send-email binding in `wrangler.jsonc` before deploying.

Contact form messages and product quote requests are saved as inquiries. Wrangler's custom domain publishes the Worker at `www.zanderbooyzen.com`; it provisions DNS and certificates for the Worker.
