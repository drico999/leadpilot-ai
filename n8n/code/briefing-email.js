// n8n Code node: "Build briefing email" (Run once for all items)

const stats = $('Pipeline stats').first().json.stats;
const item = $input.first().json;
const text = item.text || (item.error ? 'The AI summary could not be generated today; numbers below are still accurate.' : '');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const rows = stats.hot_leads_not_contacted.map((l) => `
  <tr>
    <td style="padding:6px 8px;border-bottom:1px solid #e3e7ec"><strong>${esc(l.name)}</strong><br><span style="color:#556270">${esc(l.company || '')}</span></td>
    <td style="padding:6px 8px;border-bottom:1px solid #e3e7ec;text-align:right">${l.score}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #e3e7ec;color:#33404e">${esc(l.summary)}</td>
  </tr>`).join('');

const t = stats.tiers_last_7d;
const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;color:#13202e">
  <h2 style="margin:0 0 12px">Your pipeline this morning</h2>
  <p style="font-size:15px;line-height:1.5">${esc(text).replace(/\n/g, '<br>')}</p>
  <p style="color:#556270">Last 24h: <strong>${stats.new_last_24h}</strong> new. Last 7 days: <strong>${stats.new_last_7d}</strong> (${t.hot} hot, ${t.warm} warm, ${t.cold} cold), average score ${stats.avg_score_last_7d}. Waiting over 48h: <strong>${stats.warm_or_hot_waiting_over_48h}</strong>.</p>
  ${rows ? `<h3 style="margin:20px 0 6px">Call these first</h3><table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>` : '<p>No uncontacted hot leads. Nice.</p>'}
  <p style="color:#8a94a3;font-size:12px;margin-top:20px">Sent by LeadPilot. Open the CRM: https://docs.google.com/spreadsheets/d/__SHEET_ID__</p>
</div>`;

const d = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
return [{ json: { subject: `Pipeline briefing for ${d}: ${stats.new_last_24h} new, ${stats.hot_leads_not_contacted.length} to call`, html } }];
