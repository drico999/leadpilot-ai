// n8n Code node: "Mask and shape" (Run once for all items)
// Public dashboard feed: first names only, no emails or messages.
/*__SCORING__*/

const items = $input.all();
const failed = items.find((i) => i.json && i.json.error);
if (failed) {
  return [{ json: { ok: false, error: 'The CRM sheet could not be read. Check the Google Sheets credential and SHEET_ID.' } }];
}
const rows = items.map((i) => i.json).filter((r) => r && r.lead_id);

const leads = rows
  .sort((a, b) => (Date.parse(b.received_at) || 0) - (Date.parse(a.received_at) || 0))
  .slice(0, 50)
  .map((r) => ({
    id: r.lead_id,
    received_at: r.received_at,
    name: firstName(r.name),
    company: r.company || '',
    tier: r.tier || 'cold',
    score: Number(r.score) || 0,
    industry: r.industry || '',
    status: r.status || 'new',
    summary: String(r.summary || '').slice(0, 160),
  }));

return [{ json: { ok: true, generated_at: new Date().toISOString(), total: rows.length, leads } }];
