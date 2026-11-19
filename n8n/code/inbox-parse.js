// n8n Code node: "Parse agent result" (Run once for all items)
// The agent ends with a JSON summary; turn it into a log row.

const emails = $('Prepare email').all();

return $input.all().map((item, i) => {
  const email = emails[i] ? emails[i].json : {};
  const raw = String(item.json.output || '');
  let r = {};
  try {
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    r = JSON.parse(raw.slice(s, e + 1));
  } catch (err) {
    r = { category: 'other', priority: 'normal', is_known_lead: false, actions_taken: [], summary: raw.slice(0, 200) };
  }
  return {
    json: {
      logged_at: new Date().toISOString(),
      message_id: email.message_id || '',
      from: email.from_email || '',
      subject: email.subject || '',
      category: String(r.category || 'other'),
      priority: String(r.priority || 'normal'),
      is_known_lead: r.is_known_lead ? 'yes' : 'no',
      actions_taken: (Array.isArray(r.actions_taken) ? r.actions_taken : []).join('; '),
      summary: String(r.summary || '').slice(0, 300),
    },
  };
});
