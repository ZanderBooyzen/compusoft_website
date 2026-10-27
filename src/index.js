export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/admin.html') {
      const access = await authorizeAdmin(request, env);
      if (!access.ok) return new Response(access.message, { status: access.status, headers: { ...securityHeaders(), 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
      if (!env.DB) return new Response('The business database is not configured yet.', { status: 503, headers: { ...securityHeaders(), 'Cache-Control': 'no-store' } });
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
      headers.set('Cache-Control', 'no-store');
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }

    if (url.pathname.startsWith('/api/admin/')) {
      const access = await authorizeAdmin(request, env);
      if (!access.ok) return adminJson({ error: access.message }, access.status);
      if (!env.DB) return adminJson({ error: 'The business database is not configured yet.' }, 503);
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return adminJson({ error: 'Method not allowed.' }, 405);
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) {
        return adminJson({ error: 'Cross-origin requests are not allowed.' }, 403);
      }
      try {
        return await handleAdminApi(request, env, url);
      } catch (error) {
        console.error(JSON.stringify({ message: 'Admin API request failed', error: error?.message || String(error) }));
        return adminJson({ error: 'The request could not be completed.' }, 500);
      }
    }

    if (url.pathname === '/api/quote-intake') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (request.headers.get('Origin') !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
      if (!env.DB) return json({ error: 'Quote requests cannot be saved right now. Please message CompuSoft directly.' }, 503);
      let data;
      try {
        if (Number(request.headers.get('Content-Length') || 0) > 12000) throw new Error('Request too large.');
        data = await request.json();
      } catch {
        return json({ error: 'Request body must be valid JSON.' }, 400);
      }
      if (!data || typeof data !== 'object' || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 20) {
        return json({ error: 'Add between one and 20 items to your quote request.' }, 400);
      }
      if (data.website) return json({ ok: true });
      const items = [];
      for (const entry of data.items) {
        const name = cleanField(entry?.name, 120);
        const quantity = Number(entry?.quantity);
        const details = cleanField(entry?.details, 300);
        if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return json({ error: 'One of the requested items is invalid.' }, 400);
        items.push(`${quantity} x ${name}${details ? ` (${details})` : ''}`);
      }
      const notes = cleanField(data.notes, 1200);
      const message = [...items, notes ? `Additional notes: ${notes}` : ''].filter(Boolean).join('\n');
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(`INSERT INTO inquiries (id, source, name, topic, message, status, created_at, updated_at)
          VALUES (?, 'product_quote', 'WhatsApp quote request', 'Product quote request', ?, 'new', ?, ?)`)
          .bind(crypto.randomUUID(), message, now, now).run();
        return json({ ok: true });
      } catch (error) {
        console.error(JSON.stringify({ message: 'Product quote request could not be stored', error: error?.message || String(error) }));
        return json({ error: 'Your quote request could not be saved. Please message CompuSoft directly.' }, 503);
      }
    }

    if (url.pathname === '/api/contact') {
      if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { headers: { ...corsHeaders(), ...securityHeaders(), 'Cache-Control': 'no-store' } });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

      let data;
      try {
        data = await request.json();
      } catch {
        return json({ error: 'Request body must be valid JSON.' }, 400);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return json({ error: 'Request body must be a JSON object.' }, 400);
      }

      const name = typeof data.name === 'string' ? data.name.trim().slice(0, 120) : '';
      const email = typeof data.email === 'string' ? data.email.trim().slice(0, 200) : '';
      const service = typeof data.service === 'string' ? data.service.trim().slice(0, 120) : '';
      const message = typeof data.message === 'string' ? data.message.trim().slice(0, 5000) : '';

      if (data.website) return json({ ok: true });
      if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Please complete all fields correctly.' }, 400);
      }
      if (!env.EMAIL) return json({ error: 'Email service is not configured.' }, 503);

      if (env.DB) {
        const now = new Date().toISOString();
        try {
          await env.DB.prepare(`INSERT INTO inquiries (id, source, name, email, topic, message, status, created_at, updated_at)
            VALUES (?, 'contact', ?, ?, ?, ?, 'new', ?, ?)`)
            .bind(crypto.randomUUID(), name, email, service, message, now, now).run();
        } catch (error) {
          console.error(JSON.stringify({ message: 'Contact inquiry could not be stored', error: error?.message || String(error) }));
          return json({ error: 'Your message could not be saved right now. Please call or message CompuSoft directly.' }, 503);
        }
      }

      try {
        await env.EMAIL.send({
          from: 'mail@zanderbooyzen.com',
          to: 'zanderbooyzen@gmail.com',
          replyTo: email,
          subject: `Website message from ${name.replace(/[\r\n]+/g, ' ')}`,
          text: `${message}\n\nService: ${service || 'Not specified'}\nFrom: ${name} <${email}>`,
          html: `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p><strong>Service:</strong> ${escapeHtml(service || 'Not specified')}<br><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>`,
        });

        return json({ ok: true });
      } catch (error) {
        console.error('Contact email failed:', error?.code || error?.message || error);
        return json({ error: error?.code || 'Email service could not send the message.' }, 500);
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
    if (url.pathname === '/styles.css') {
      headers.set('Cache-Control', 'no-store, max-age=0');
    }
    return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
  },
};

async function authorizeAdmin(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) {
    return { ok: false, status: 503, message: 'Admin sign-in is not configured.' };
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, status: 401, message: 'Sign in through Cloudflare Access to continue.' };

  try {
    const teamUrl = new URL(env.ACCESS_TEAM_DOMAIN.startsWith('https://') ? env.ACCESS_TEAM_DOMAIN : `https://${env.ACCESS_TEAM_DOMAIN}`);
    if (teamUrl.protocol !== 'https:' || !teamUrl.hostname.endsWith('.cloudflareaccess.com')) throw new Error('Invalid Access team domain.');
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error('Invalid token.');
    const decode = (part) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')), (char) => char.charCodeAt(0))));
    const header = decode(encodedHeader);
    const claims = decode(encodedPayload);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token.');
    const expectedIssuer = teamUrl.origin;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const acceptedAudiences = env.ACCESS_AUD.split(',').map((audience) => audience.trim()).filter(Boolean);
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== expectedIssuer || !acceptedAudiences.some((audience) => audiences.includes(audience)) || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now)) {
      throw new Error('Invalid token claims.');
    }

    const certResponse = await fetch(`${expectedIssuer}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!certResponse.ok) throw new Error('Could not retrieve Access signing keys.');
    const certificates = await certResponse.json();
    const key = certificates.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
    if (!key) throw new Error('Access signing key was not found.');
    const publicKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encodedSignature.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
    const validSignature = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!validSignature || !email || email !== env.ADMIN_EMAIL.trim().toLowerCase()) throw new Error('This account is not authorized.');
    return { ok: true, email };
  } catch (error) {
    console.warn(JSON.stringify({ message: 'Admin Access verification denied', error: error?.message || String(error) }));
    return { ok: false, status: 401, message: 'Access sign-in could not be verified. Sign in again and try once more.' };
  }
}

async function handleAdminApi(request, env, url) {
  const path = url.pathname.replace(/\/$/, '');
  if (path === '/api/admin/data' && request.method === 'GET') {
    const [customers, records, inquiries] = await Promise.all([
      env.DB.prepare('SELECT id, name, email, phone, company, notes, created_at, updated_at FROM customers ORDER BY name COLLATE NOCASE').all(),
      env.DB.prepare(`SELECT r.id, r.kind, r.customer_id, c.name AS customer_name, r.title, r.reference, r.status, r.amount_cents, r.currency, r.record_date, r.due_date, r.details, r.created_at, r.updated_at
        FROM business_records r LEFT JOIN customers c ON c.id = r.customer_id
        ORDER BY r.record_date DESC, r.created_at DESC`).all(),
      env.DB.prepare('SELECT id, source, name, email, phone, topic, message, status, created_at FROM inquiries ORDER BY created_at DESC').all(),
    ]);
    return adminJson({ customers: customers.results || [], records: records.results || [], inquiries: inquiries.results || [] });
  }

  if (path === '/api/admin/customers' && request.method === 'POST') {
    const data = await readAdminBody(request);
    if (!data) return adminJson({ error: 'Send a valid JSON object.' }, 400);
    const name = cleanField(data.name, 120);
    const email = cleanField(data.email, 200).toLowerCase();
    const phone = cleanField(data.phone, 60);
    const company = cleanField(data.company, 160);
    const notes = cleanField(data.notes, 3000);
    if (!name) return adminJson({ error: 'Customer name is required.' }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return adminJson({ error: 'Enter a valid email address.' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO customers (id, name, email, phone, company, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, email, phone, company, notes, now, now).run();
    return adminJson({ ok: true, id }, 201);
  }

  if (path === '/api/admin/records' && request.method === 'POST') {
    const data = await readAdminBody(request);
    if (!data) return adminJson({ error: 'Send a valid JSON object.' }, 400);
    const kind = ['quote', 'sale', 'invoice'].includes(data.kind) ? data.kind : '';
    const title = cleanField(data.title, 200);
    const reference = cleanField(data.reference, 80);
    const status = cleanField(data.status || 'draft', 40).toLowerCase();
    const details = cleanField(data.details, 5000);
    const customerId = typeof data.customerId === 'string' && data.customerId ? data.customerId : null;
    const amount = Number(data.amount);
    const amountCents = Math.round(amount * 100);
    const date = validDate(data.date);
    const dueDate = validDate(data.dueDate);
    const allowedStatuses = { quote: ['draft', 'sent', 'accepted', 'declined', 'expired'], sale: ['pending', 'complete', 'refunded'], invoice: ['draft', 'sent', 'partially paid', 'paid', 'overdue', 'cancelled'] };
    if (!kind || !title || !Number.isFinite(amount) || amount < 0 || amountCents > 100000000000 || !allowedStatuses[kind].includes(status) || (data.date && !date) || (data.dueDate && !dueDate)) {
      return adminJson({ error: 'Check the type, title, amount, status, and dates.' }, 400);
    }
    if (customerId) {
      const customer = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first();
      if (!customer) return adminJson({ error: 'Choose a customer from the list.' }, 400);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO business_records (id, kind, customer_id, title, reference, status, amount_cents, currency, record_date, due_date, details, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ZAR', ?, ?, ?, ?, ?)`)
      .bind(id, kind, customerId, title, reference, status, amountCents, date, dueDate, details, now, now).run();
    return adminJson({ ok: true, id }, 201);
  }

  const recordMatch = path.match(/^\/api\/admin\/records\/([0-9a-f-]{36})$/i);
  if (recordMatch && request.method === 'PATCH') {
    const data = await readAdminBody(request);
    if (!data) return adminJson({ error: 'Choose a valid status.' }, 400);
    const current = await env.DB.prepare('SELECT kind FROM business_records WHERE id = ?').bind(recordMatch[1]).first();
    if (!current) return adminJson({ error: 'Record not found.' }, 404);
    const allowed = { quote: ['draft', 'sent', 'accepted', 'declined', 'expired'], sale: ['pending', 'complete', 'refunded'], invoice: ['draft', 'sent', 'partially paid', 'paid', 'overdue', 'cancelled'] };
    if (!allowed[current.kind]?.includes(data.status)) return adminJson({ error: 'Choose a valid status.' }, 400);
    const result = await env.DB.prepare('UPDATE business_records SET status = ?, updated_at = ? WHERE id = ?')
      .bind(data.status, new Date().toISOString(), recordMatch[1]).run();
    return result.meta?.changes ? adminJson({ ok: true }) : adminJson({ error: 'Record not found.' }, 404);
  }

  if (recordMatch && request.method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM business_records WHERE id = ?').bind(recordMatch[1]).run();
    return result.meta?.changes ? adminJson({ ok: true }) : adminJson({ error: 'Record not found.' }, 404);
  }

  const inquiryMatch = path.match(/^\/api\/admin\/inquiries\/([0-9a-f-]{36})$/i);
  if (inquiryMatch && request.method === 'PATCH') {
    const data = await readAdminBody(request);
    if (!data || !['new', 'converted', 'closed'].includes(data.status)) return adminJson({ error: 'Choose a valid inquiry status.' }, 400);
    const result = await env.DB.prepare('UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ?')
      .bind(data.status, new Date().toISOString(), inquiryMatch[1]).run();
    return result.meta?.changes ? adminJson({ ok: true }) : adminJson({ error: 'Inquiry not found.' }, 404);
  }

  if (inquiryMatch && request.method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM inquiries WHERE id = ?').bind(inquiryMatch[1]).run();
    return result.meta?.changes ? adminJson({ ok: true }) : adminJson({ error: 'Inquiry not found.' }, 404);
  }

  return adminJson({ error: 'Admin route not found.' }, 404);
}

async function readAdminBody(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 20000 || !request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return null;
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function cleanField(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function validDate(value) {
  if (typeof value !== 'string' || !value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? '' : value;
}

function adminJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...securityHeaders(), 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), ...securityHeaders(), 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } });
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

// Keep this class exported because the production Worker has an existing
// Durable Object namespace bound to it, even though the page now uses CounterAPI.
export class VisitorCounter {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch() {
    const count = await this.storage.transaction(async (transaction) => {
      const nextCount = (await transaction.get('count') || 0) + 1;
      await transaction.put('count', nextCount);
      return nextCount;
    });

    return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

