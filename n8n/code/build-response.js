// n8n Code node: "Build response" (Run once for all items)
// Reports which steps actually ran, so the website can show an honest trace.

const scored = $('Parse and score').first().json;

function status(nodeName) {
  try {
    const node = $(nodeName);
    if (!node.isExecuted) return 'skipped';
    const out = node.first();
    if (!out || out.json.error) return 'failed';
    return 'done';
  } catch (e) {
    return 'skipped';
  }
}

const actions = [
  { step: 'webhook', status: 'done' },
  { step: 'validate', status: 'done' },
  { step: 'ai', status: scored.ai_ok ? 'done' : 'failed' },
  { step: 'crm', status: status('Append lead to CRM') },
  { step: 'draft', status: status('Draft reply in Gmail') },
  { step: 'notify', status: status('Alert owner') },
];

const q = { ...scored.qualification };

return [{
  json: {
    ok: true,
    lead: {
      id: scored.lead.id,
      name: scored.lead.name,
      company: scored.lead.company,
      received_at: scored.lead.received_at,
    },
    qualification: q,
    actions,
  },
}];
