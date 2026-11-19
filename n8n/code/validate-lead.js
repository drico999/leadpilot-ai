// n8n Code node: "Validate lead" (Run once for all items)
// Input: Webhook item { body, headers, ... }. Output: { valid, lead | errors }.
/*__SCORING__*/

return $input.all().map((item) => {
  const body = item.json.body || {};
  const check = normalizeLead(body);
  if (!check.ok) {
    return { json: { valid: false, spam: !!check.spam, errors: check.errors } };
  }
  const lead = {
    ...check.lead,
    id: makeLeadId(new Date()),
    received_at: new Date().toISOString(),
    source: String(body.source || 'website').slice(0, 30),
  };
  return { json: { valid: true, lead } };
});
