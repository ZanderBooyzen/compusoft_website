export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/verify') {
      if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405, headers: { ...securityHeaders(), 'Cache-Control': 'no-store' } });
      const assetRequest = new Request(new URL('/admin-verify.html', url), { method: 'GET', headers: request.headers });
      const asset = await env.ASSETS.fetch(assetRequest);
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
      headers.set('Cache-Control', 'no-store');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }

    if (url.pathname === '/admin.html') {
      if (!env.DB) return new Response('The business database is not configured yet.', { status: 503, headers: { ...securityHeaders(), 'Cache-Control': 'no-store' } });
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
      headers.set('Cache-Control', 'no-store');
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }

    if (url.pathname.startsWith('/api/admin/')) {
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return adminJson({ error: 'Method not allowed.' }, 405);
      if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
        return adminJson({ error: 'Cross-origin requests are not allowed.' }, 403);
      }
      try {
        const adminPath = url.pathname.replace(/\/$/, '');
        if (adminPath === '/api/admin/auth' && request.method === 'GET') {
          return adminJson({ authenticated: await verifyAdminSession(request, env) });
        }
        if (adminPath === '/api/admin/login' && request.method === 'POST') {
          return await handleAdminEmailLogin(request, env);
        }
        if (adminPath === '/api/admin/redeem' && request.method === 'POST') {
          return await handleAdminMagicLinkRedeem(request, env);
        }
        if (adminPath === '/api/admin/logout' && request.method === 'POST') {
          return adminJson({ ok: true }, 200, { 'Set-Cookie': adminSessionCookie('', 0) });
        }
        if (!await verifyAdminSession(request, env)) return adminJson({ error: 'Request an email sign-in link to continue.' }, 401);
        if (!env.DB) return adminJson({ error: 'The business database is not configured yet.' }, 503);
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
          from: 'mail@compusoft.co.za',
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

async function handleAdminEmailLogin(request, env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_SESSION_SECRET || !env.DB || !env.EMAIL) {
    return adminJson({ error: 'Email sign-in is not configured.' }, 503);
  }
  const data = await readAdminBody(request);
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return adminJson({ error: 'Enter a valid email address.' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const clientHash = await adminClientHash(request, env);
  const attempts = await env.DB.prepare('SELECT attempt_count, window_started, locked_until FROM admin_login_attempts WHERE client_hash = ?').bind(clientHash).first();
  if (attempts?.locked_until > now) {
    const retryAfter = Math.max(1, attempts.locked_until - now);
    return adminJson({ error: 'Too many sign-in attempts. Try again later.' }, 429, { 'Retry-After': String(retryAfter) });
  }
  await env.DB.prepare(`INSERT INTO admin_login_attempts (client_hash, attempt_count, window_started, locked_until)
      VALUES (?, 1, ?, 0)
      ON CONFLICT(client_hash) DO UPDATE SET
        attempt_count = CASE WHEN admin_login_attempts.window_started <= ? THEN 1 ELSE admin_login_attempts.attempt_count + 1 END,
        window_started = CASE WHEN admin_login_attempts.window_started <= ? THEN excluded.window_started ELSE admin_login_attempts.window_started END,
        locked_until = CASE WHEN admin_login_attempts.window_started <= ? THEN 0 WHEN admin_login_attempts.attempt_count + 1 >= 3 THEN ? ELSE admin_login_attempts.locked_until END`)
    .bind(clientHash, now, now - 900, now - 900, now - 900, now + 900).run();
  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE window_started < ?').bind(now - 86400).run();
  if (email !== env.ADMIN_EMAIL.trim().toLowerCase()) return adminJson({ ok: true, message: 'If the address is authorized, a sign-in link will arrive shortly.' });

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64UrlEncode(tokenBytes);
  const tokenHash = await hashMagicLinkToken(token);
  const expiresAt = now + 600;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_magic_links'),
    env.DB.prepare('INSERT INTO admin_magic_links (token_hash, created_at, expires_at) VALUES (?, ?, ?)').bind(tokenHash, now, expiresAt),
  ]);
  const link = `https://www.zanderbooyzen.com/admin/verify#token=${encodeURIComponent(token)}`;
  try {
    await env.EMAIL.send({
      from: 'mail@compusoft.co.za',
      to: env.ADMIN_EMAIL,
      subject: 'Your CompuSoft admin sign-in link',
      text: `Use this one-time link to open your admin console. It expires in 10 minutes.\n\n${link}\n\nIf you did not request this email, you can ignore it.`,
      html: `<p>Use this one-time link to open your admin console. It expires in 10 minutes.</p><p><a href="${link}">Open admin console</a></p><p>If you did not request this email, you can ignore it.</p>`,
    });
  } catch (error) {
    await env.DB.prepare('UPDATE admin_magic_links SET consumed_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
    console.error(JSON.stringify({ message: 'Admin sign-in email could not be sent', error: error?.code || error?.message || String(error) }));
    return adminJson({ error: 'The sign-in email could not be sent. Try again later.' }, 503);
  }
  return adminJson({ ok: true, message: 'If the address is authorized, a sign-in link will arrive shortly.' });
}

async function handleAdminMagicLinkRedeem(request, env) {
  const data = await readAdminBody(request);
  const token = typeof data?.token === 'string' ? data.token : '';
  if (!token || token.length > 128 || !env.ADMIN_EMAIL || !env.ADMIN_SESSION_SECRET || !env.DB) {
    return adminJson({ error: 'This sign-in link is invalid or has expired. Request a new one.' }, 401);
  }
  const tokenHash = await hashMagicLinkToken(token);
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare('UPDATE admin_magic_links SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?')
    .bind(now, tokenHash, now).run();
  if (!result.meta?.changes) return adminJson({ error: 'This sign-in link is invalid or has expired. Request a new one.' }, 401);
  return adminJson({ ok: true }, 200, { 'Set-Cookie': await createAdminSessionCookie(env) });
}

async function hashMagicLinkToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return base64UrlEncode(new Uint8Array(digest));
}

async function createAdminSessionCookie(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ sub: env.ADMIN_EMAIL.trim().toLowerCase(), iat: now, exp: now + 28800, nonce: crypto.randomUUID() })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const token = `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  return adminSessionCookie(token, 28800);
}

async function adminClientHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown-client';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`admin-login:${ip}`));
  return base64UrlEncode(new Uint8Array(digest));
}

async function verifyAdminSession(request, env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_SESSION_SECRET) return false;
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('admin_session='))?.slice('admin_session='.length);
  if (!token) return false;
  const [payload, encodedSignature, extra] = token.split('.');
  if (!payload || !encodedSignature || extra) return false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlDecode(encodedSignature), new TextEncoder().encode(payload));
    if (!valid) return false;
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return claims.sub === env.ADMIN_EMAIL.trim().toLowerCase() && Number.isFinite(claims.exp) && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function adminSessionCookie(value, maxAge) {
  return `admin_session=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
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

function adminJson(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...securityHeaders(), ...extraHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
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

