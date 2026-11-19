// Exercises the Vercel functions with fake req/res objects (demo mode and a stubbed n8n).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

function req(method, body, ip = '10.0.0.' + Math.floor(Math.random() * 250)) {
  const r = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  r.method = method;
  r.headers = { 'x-forwarded-for': ip };
  return r;
}
function res() {
  const headers = {};
  return {
    statusCode: 200, headers, body: '',
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    end(b) { this.body = b; },
    json() { return JSON.parse(this.body); },
  };
}
const lead = { name: 'Thandi Nkosi', email: 'thandi@kasilogistics.co.za', company: 'Kasi Logistics', budget: '5k-20k', timeline: 'asap', message: 'We need an n8n automation for CRM lead routing and email replies, urgent.' };

test('POST /api/lead in demo mode returns a full qualification', async () => {
  delete process.env.N8N_LEAD_WEBHOOK_URL;
  const { default: handler } = await import('../api/lead.js');
  const r = res();
  await handler(req('POST', lead), r);
  const d = r.json();
  assert.equal(r.statusCode, 200);
  assert.equal(d.mode, 'demo');
  assert.ok(d.qualification.score >= 0 && d.qualification.score <= 100);
  assert.equal(d.actions.length, 6);
  assert.ok(d.qualification.reply_body.startsWith('Hi Thandi'));
});

test('POST /api/lead validates input', async () => {
  const { default: handler } = await import('../api/lead.js');
  const r = res();
  await handler(req('POST', { name: 'x' }), r);
  assert.equal(r.statusCode, 422);
  assert.ok(r.json().fields.email);
});

test('POST /api/lead silently drops honeypot spam', async () => {
  const { default: handler } = await import('../api/lead.js');
  const r = res();
  await handler(req('POST', { ...lead, company_url: 'x' }), r);
  assert.equal(r.json().mode, 'ignored');
});

test('POST /api/lead rate limits bursts per IP', async () => {
  const { default: handler } = await import('../api/lead.js');
  let last;
  for (let i = 0; i < 7; i++) { last = res(); await handler(req('POST', lead, '9.9.9.9'), last); }
  assert.equal(last.statusCode, 429);
});

test('GET /api/lead is rejected', async () => {
  const { default: handler } = await import('../api/lead.js');
  const r = res();
  await handler(req('GET'), r);
  assert.equal(r.statusCode, 405);
});

test('POST /api/lead forwards to n8n with the secret header in live mode', async () => {
  process.env.N8N_LEAD_WEBHOOK_URL = 'https://n8n.example/webhook/leadpilot/lead';
  process.env.N8N_WEBHOOK_SECRET = 's3cret';
  const realFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, opts) => {
    seen = { url, opts };
    return new Response(JSON.stringify({ ok: true, lead: { id: 'LP-1' }, qualification: { score: 80 }, actions: [] }), { status: 200 });
  };
  try {
    const { default: handler } = await import('../api/lead.js');
    const r = res();
    await handler(req('POST', lead), r);
    assert.equal(r.json().mode, 'live');
    assert.equal(seen.opts.headers['X-LeadPilot-Key'], 's3cret');
    assert.equal(JSON.parse(seen.opts.body).source, 'website');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.N8N_LEAD_WEBHOOK_URL;
  }
});

test('GET /api/leads demo pipeline', async () => {
  delete process.env.N8N_LEADS_WEBHOOK_URL;
  const { default: handler } = await import('../api/leads.js');
  const r = res();
  await handler(req('GET'), r);
  const d = r.json();
  assert.equal(d.mode, 'demo');
  assert.ok(d.leads.length > 0);
  assert.ok(!JSON.stringify(d).includes('@'));
});
