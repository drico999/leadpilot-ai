// n8n Code node: "Format alert" (Run once for all items)
// Input comes from the Error Trigger.

const e = $input.first().json;
const wf = e.workflow || {};
const ex = e.execution || {};
const err = ex.error || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;color:#13202e">
  <h2 style="margin:0 0 8px;color:#b23a1f">LeadPilot workflow failed</h2>
  <p><strong>Workflow:</strong> ${esc(wf.name)}<br>
     <strong>Failed node:</strong> ${esc(ex.lastNodeExecuted || 'unknown')}<br>
     <strong>Mode:</strong> ${esc(ex.mode || '')}</p>
  <p><strong>Error:</strong> ${esc(err.message || 'No message')}</p>
  ${ex.url ? `<p><a href="${esc(ex.url)}">Open the execution in n8n</a></p>` : ''}
</div>`;

return [{ json: { subject: `LeadPilot alert: "${wf.name || 'workflow'}" failed`, html } }];
