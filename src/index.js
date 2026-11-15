export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    if (url.pathname === '/api/problem-report') {
      if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { headers: { ...corsHeaders(), ...securityHeaders(), 'Cache-Control': 'no-store' } });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      let data;
      try {
        if (Number(request.headers.get('Content-Length') || 0) > 8000) return json({ error: 'Your message is too long.' }, 413);
        data = await request.json();
      } catch {
        return json({ error: 'Request body must be valid JSON.' }, 400);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Request body must be a JSON object.' }, 400);
      if (data.website) return json({ ok: true });
      const name = cleanField(data.name, 120);
      const phone = cleanField(data.phone, 40);
      const message = cleanField(data.message, 3000);
      if (!message) return json({ error: 'Please describe the problem.' }, 400);
      if (!env.EMAIL) return json({ error: 'Email service is not configured.' }, 503);

      const now = new Date().toISOString();
      if (env.DB) {
        try {
          await env.DB.prepare(`INSERT INTO inquiries (id, source, name, phone, topic, message, status, created_at, updated_at)
            VALUES (?, 'contact', ?, ?, 'Website problem report', ?, 'new', ?, ?)`)
            .bind(crypto.randomUUID(), name || 'Website visitor', phone, message, now, now).run();
        } catch (error) {
          console.error(JSON.stringify({ message: 'Problem report could not be stored', error: error?.message || String(error) }));
          return json({ error: 'Your report could not be saved.' }, 503);
        }
      }

      try {
        const details = [
          `Problem reported through the CompuSoft website${name ? ` by ${name}` : ''}.`,
          phone ? `Phone: ${phone}` : 'Phone: Not provided',
          '',
          'Problem:',
          message,
        ].join('\n');
        await env.EMAIL.send({
          from: 'mail@compusoft.co.za',
          to: 'zanderbooyzen@gmail.com',
          subject: `Website problem report${name ? ` from ${name.replace(/[\r\n]+/g, ' ')}` : ''}`,
          text: details,
          html: `<p>Problem reported through the CompuSoft website${name ? ` by ${escapeHtml(name)}` : ''}.</p><p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p><p><strong>Problem:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
        });
        return json({ ok: true });
      } catch (error) {
        console.error('Problem report email failed:', error?.code || error?.message || error);
        return json({ error: 'Email could not be sent right now.' }, 500);
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

function cleanField(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
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

