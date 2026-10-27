# CompuSoft Computer Support

Business website for CompuSoft Computer Support, with service and contact pages.

## Cloudflare deployment

- The site assets are served from `dist/`, which mirrors the public HTML, CSS, JavaScript, and image files.
- The Cloudflare Worker in `src/index.js` handles `/api/contact` and serves static assets.
- Configure the `EMAIL` send-email binding in `wrangler.jsonc` before deploying.

## Private business dashboard

The owner dashboard is served at `/admin.html`. It uses Cloudflare Access for owner sign-in and a D1 database for customer, quote, sale, invoice, and public website inquiry records. Contact form messages and product quote requests are saved as inquiries; the Worker validates the Access JWT and allowed owner email on both the dashboard and every admin API request.

The D1 database `compusoft-business` has been created and its initial schema is applied. Before enabling the dashboard in production:

1. In Cloudflare Zero Trust, protect the site's `/admin.html` and `/api/admin/*` paths with Access applications and allow only the owner's sign-in email. If separate applications are needed for the two paths, keep both Audience tags.
2. Add Worker secrets interactively with `npx wrangler secret put ACCESS_TEAM_DOMAIN`, `npx wrangler secret put ACCESS_AUD`, and `npx wrangler secret put ADMIN_EMAIL`. Use your `https://<team>.cloudflareaccess.com` team domain, the Access application's Audience tag(s) (comma-separated if there are two), and the same owner email allowed by the Access policies.
3. Deploy the Worker and static assets. Open `https://<your-site>/admin.html` and sign in through Cloudflare Access.

The dashboard stores customer contact details and business records. It is not an accounting or tax system; do not store card numbers, passwords, or other authentication secrets in notes.
