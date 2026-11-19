// POST /api/lead — public entry point for the website form.
// Validates input, then forwards to the n8n "Lead intake" webhook (live mode)
// or answers with a simulated pipeline run (demo mode, no backend configured).
import { normalizeLead } from '../lib/scoring.js';
import { mockLeadResponse } from './_lib/mock.js';
import { rateLimited, sendJson, readJsonBody, callN8n } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Use POST.' });
  }
  if (rateLimited(req)) {
    return sendJson(res, 429, { ok: false, error: 'Too many submissions. Wait a minute and try again.' });
  }

  let body;
  try { body = await readJsonBody(req); } catch {
    return sendJson(res, 400, { ok: false, error: 'Request body must be JSON.' });
  }

  const check = normalizeLead(body);
  if (!check.ok) {
    // Pretend success to bots that trip the honeypot.
    if (check.spam) return sendJson(res, 200, { ok: true, mode: 'ignored' });
    return sendJson(res, 422, { ok: false, error: 'Some fields need attention.', fields: check.errors });
  }

  const url = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!url) return sendJson(res, 200, mockLeadResponse(check.lead));

  try {
    const { status, data } = await callN8n(url, { method: 'POST', body: { ...check.lead, source: 'website' } });
    if (status >= 400 || !data || data.ok === false) {
      return sendJson(res, status >= 400 ? 502 : 500, {
        ok: false,
        error: data?.error || `Automation backend returned ${status}.`,
        fields: data?.fields,
      });
    }
    return sendJson(res, 200, { ...data, mode: 'live' });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    return sendJson(res, 504, {
      ok: false,
      error: timedOut ? 'The automation took too long to answer. Try again shortly.' : 'Could not reach the automation backend.',
    });
  }
}
