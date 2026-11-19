// Small helpers shared by the Vercel functions.

// Best-effort in-memory rate limit. Serverless instances are short-lived, so this
// only slows down bursts; put Vercel Firewall / Upstash in front for hard limits.
const hits = new Map();
export function rateLimited(req, { limit = 5, windowMs = 60_000 } = {}) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

/** Call an n8n webhook with the shared secret header and a hard timeout. */
export async function callN8n(url, { method = 'GET', body, timeoutMs = 55_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-LeadPilot-Key': process.env.N8N_WEBHOOK_SECRET || '',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 300) }; }
    return { status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}
