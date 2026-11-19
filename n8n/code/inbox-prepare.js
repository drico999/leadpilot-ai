// n8n Code node: "Prepare email" (Run once for all items)
// Normalises the Gmail Trigger output (simplify = off) for the AI agent.

return $input.all().map((item) => {
  const m = item.json;
  const fromObj = (m.from && m.from.value && m.from.value[0]) || {};
  const text = String(m.text || m.textAsHtml || m.snippet || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    // Drop quoted history so the agent reads only the new message.
    .split(/\nOn .+wrote:\n/)[0]
    .slice(0, 4000);

  return {
    json: {
      message_id: m.id,
      thread_id: m.threadId,
      from_email: String(fromObj.address || '').toLowerCase(),
      from_name: String(fromObj.name || ''),
      subject: String(m.subject || '(no subject)').slice(0, 200),
      received_at: m.date || new Date().toISOString(),
      body: text,
    },
  };
});
