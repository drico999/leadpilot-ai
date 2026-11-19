// GET /api/leads — pipeline data for the public dashboard.
// Live mode reads the Google Sheets CRM through the n8n "CRM API" workflow,
// which masks personal data before it leaves n8n.
import { mockPipeline } from './_lib/mock.js';
import { sendJson, callN8n } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Use GET.' });
  }
  const url = process.env.N8N_LEADS_WEBHOOK_URL;
  if (!url) return sendJson(res, 200, mockPipeline());

  try {
    const { status, data } = await callN8n(url, { timeoutMs: 20_000 });
    if (status >= 400 || !data?.ok) {
      return sendJson(res, 502, { ok: false, error: data?.error || `CRM API returned ${status}.` });
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return sendJson(res, 200, { ...data, mode: 'live' });
  } catch {
    return sendJson(res, 504, { ok: false, error: 'Could not reach the CRM API.' });
  }
}
