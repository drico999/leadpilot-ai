// n8n Code node: "Parse and score" (Run once for all items)
// Merges the validated lead with GPT's JSON and blends in rule-based signals.
// If the OpenAI call failed (node set to continue on error) we fall back to
// rules only, so the lead is never lost.
/*__SCORING__*/

const leads = $('Validate lead').all();

const list = (v, n) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).slice(0, 160)).slice(0, n);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

return $input.all().map((item, i) => {
  const lead = leads[i].json.lead;
  let ai = {};
  let aiOk = true;
  try {
    const out = item.json;
    if (out.error) throw new Error(String(out.error.message || out.error));
    // With JSON mode on, the LLM Chain returns the parsed object directly;
    // otherwise the reply arrives as a string in `text`.
    ai = typeof out.text === 'string' ? parseModelJson(out.text) : out;
    if (ai.ai_score === undefined && ai.intent === undefined) throw new Error('Model reply missing expected fields');
  } catch (err) {
    aiOk = false;
    ai = { summary: 'AI qualification unavailable; scored on rules only.', recommended_action: 'Review this lead manually.' };
  }

  const blended = blendScore(aiOk ? ai.ai_score : 40, lead);
  const fname = firstName(lead.name);
  const q = {
    score: ai.intent === 'spam' ? Math.min(blended.score, 9) : blended.score,
    tier: ai.intent === 'spam' ? 'cold' : blended.tier,
    ai_score: blended.aiScore,
    rule_score: blended.ruleScore,
    signals: blended.signals,
    intent: String(ai.intent || 'other'),
    industry: String(ai.industry || 'Unknown').slice(0, 60),
    company_size: String(ai.company_size || 'unknown'),
    summary: String(ai.summary || '').slice(0, 300),
    pain_points: list(ai.pain_points, 3),
    automation_ideas: list(ai.automation_ideas, 3),
    recommended_action: String(ai.recommended_action || '').slice(0, 200),
    reply_subject: String(ai.reply_subject || `Re: your automation enquiry`).slice(0, 140),
    reply_body: String(ai.reply_body || `Hi ${fname},\n\nThanks for getting in touch. I'll read your message properly and come back to you within one working day.\n\nBest regards,\n__OWNER_NAME__`),
  };

  const notify_html = `
<div style="font-family:Arial,sans-serif;max-width:560px;color:#13202e">
  <h2 style="margin:0 0 4px">Hot lead: ${esc(lead.name)}${lead.company ? ' at ' + esc(lead.company) : ''}</h2>
  <p style="margin:0 0 16px;color:#556270">Score ${q.score}/100. ${esc(q.recommended_action)}</p>
  <p><strong>Summary:</strong> ${esc(q.summary)}</p>
  <p><strong>Email:</strong> ${esc(lead.email)}<br><strong>Budget:</strong> ${esc(lead.budget)}<br><strong>Timeline:</strong> ${esc(lead.timeline)}<br><strong>Industry:</strong> ${esc(q.industry)}</p>
  <p><strong>Their message:</strong></p>
  <blockquote style="margin:0;padding:8px 12px;border-left:3px solid #1f7a6d;color:#33404e">${esc(lead.message).replace(/\n/g, '<br>')}</blockquote>
  <p style="margin-top:16px">A personalised reply is waiting in your Gmail drafts.</p>
  <p style="color:#556270;font-size:12px">Lead ${esc(lead.id)} received ${esc(lead.received_at)}</p>
</div>`;

  return { json: { lead, qualification: q, ai_ok: aiOk, notify_html } };
});
