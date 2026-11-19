// Runs the generated n8n Code node scripts in a small harness that mimics
// n8n's $input / $() helpers, so workflow logic is tested without n8n.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [join(root, 'scripts/build-workflows.mjs')], { stdio: 'ignore' });

function codeOf(file, nodeName) {
  const wf = JSON.parse(readFileSync(join(root, 'n8n/workflows', file), 'utf8'));
  const node = wf.nodes.find((n) => n.name === nodeName);
  assert.ok(node, `node ${nodeName} exists`);
  return node.parameters.jsCode;
}

// nodes: { 'Node name': [json, ...] }, executed: names considered executed
function run(code, input, nodes = {}, executed = Object.keys(nodes)) {
  const items = (arr) => arr.map((json) => ({ json }));
  const $input = { all: () => items(input), first: () => items(input)[0] };
  const $ = (name) => {
    if (!(name in nodes) && !executed.includes(name)) throw new Error(`Referenced node "${name}" not executed`);
    const list = items(nodes[name] || []);
    return { all: () => list, first: () => list[0], isExecuted: executed.includes(name) };
  };
  // eslint-disable-next-line no-new-func
  return new Function('$input', '$', `return (function(){ ${code} })();`)($input, $);
}

const lead = { name: 'Thandi Nkosi', email: 'thandi@kasilogistics.co.za', company: 'Kasi Logistics', website: 'https://kasilogistics.co.za', budget: '5k-20k', timeline: 'asap', message: 'We need AI to triage 60 enquiries a week and log them in HubSpot.', id: 'LP-1', received_at: new Date().toISOString(), source: 'website' };

test('Validate lead: accepts valid body and adds id', () => {
  const out = run(codeOf('1-lead-intake.json', 'Validate lead'), [{ body: { ...lead, id: undefined } }]);
  assert.equal(out[0].json.valid, true);
  assert.match(out[0].json.lead.id, /^LP-\d{14}-[A-Z0-9]{4}$/);
});

test('Validate lead: rejects bad body', () => {
  const out = run(codeOf('1-lead-intake.json', 'Validate lead'), [{ body: { email: 'x' } }]);
  assert.equal(out[0].json.valid, false);
  assert.ok(out[0].json.errors.email);
});

const ai = { ai_score: 82, intent: 'new_project', industry: 'Logistics', company_size: 'mid', summary: 'Wants inbox triage.', pain_points: ['Slow replies'], automation_ideas: ['Lead scoring'], recommended_action: 'Call today.', reply_subject: 'Hi', reply_body: 'Hello' };

test('Parse and score: JSON-mode object output (what n8n returns with json_object)', () => {
  const out = run(codeOf('1-lead-intake.json', 'Parse and score'), [ai], { 'Validate lead': [{ valid: true, lead }] });
  const q = out[0].json.qualification;
  assert.equal(out[0].json.ai_ok, true);
  assert.equal(q.tier, 'hot');
  assert.equal(q.ai_score, 82);
  assert.match(out[0].json.notify_html, /Hot lead: Thandi Nkosi/);
});

test('Parse and score: string output in text', () => {
  const out = run(codeOf('1-lead-intake.json', 'Parse and score'), [{ text: '```json\n' + JSON.stringify(ai) + '\n```' }], { 'Validate lead': [{ valid: true, lead }] });
  assert.equal(out[0].json.ai_ok, true);
});

test('Parse and score: falls back to rules when OpenAI failed', () => {
  const out = run(codeOf('1-lead-intake.json', 'Parse and score'), [{ error: 'Rate limit' }], { 'Validate lead': [{ valid: true, lead }] });
  assert.equal(out[0].json.ai_ok, false);
  assert.ok(out[0].json.qualification.reply_body.includes('Hi Thandi'));
});

test('Parse and score: spam is capped and cold', () => {
  const out = run(codeOf('1-lead-intake.json', 'Parse and score'), [{ ...ai, intent: 'spam', ai_score: 90 }], { 'Validate lead': [{ valid: true, lead }] });
  assert.equal(out[0].json.qualification.tier, 'cold');
  assert.ok(out[0].json.qualification.score <= 9);
});

test('Parse and score: escapes HTML in owner alert', () => {
  const evil = { ...lead, name: '<script>x</script>' };
  const out = run(codeOf('1-lead-intake.json', 'Parse and score'), [ai], { 'Validate lead': [{ valid: true, lead: evil }] });
  assert.ok(!out[0].json.notify_html.includes('<script>'));
});

test('Build response: reports step statuses honestly', () => {
  const scored = run(codeOf('1-lead-intake.json', 'Parse and score'), [ai], { 'Validate lead': [{ valid: true, lead }] })[0].json;
  const out = run(codeOf('1-lead-intake.json', 'Build response'), [{}], {
    'Parse and score': [scored],
    'Append lead to CRM': [{ lead_id: 'LP-1' }],
    'Draft reply in Gmail': [{ error: 'invalid_grant' }],
  }, ['Parse and score', 'Append lead to CRM', 'Draft reply in Gmail']);
  const s = Object.fromEntries(out[0].json.actions.map((a) => [a.step, a.status]));
  assert.deepEqual(s, { webhook: 'done', validate: 'done', ai: 'done', crm: 'done', draft: 'failed', notify: 'skipped' });
});

const now = Date.now();
const rows = [
  { lead_id: 'A', received_at: new Date(now - 2 * 3600e3).toISOString(), name: 'Ann Lee', email: 'ann@x.com', company: 'X', tier: 'hot', score: '88', status: 'new', industry: 'Retail', summary: 's1' },
  { lead_id: 'B', received_at: new Date(now - 3 * 86400e3).toISOString(), name: 'Bob Ray', email: 'bob@y.com', company: 'Y', tier: 'warm', score: '60', status: 'new', industry: 'Retail', summary: 's2' },
  { lead_id: 'C', received_at: new Date(now - 10 * 86400e3).toISOString(), name: 'Cy', email: 'c@z.com', company: '', tier: 'cold', score: '20', status: 'replied', industry: 'Tech', summary: 's3' },
];

test('Pipeline stats: counts and call-first list', () => {
  const out = run(codeOf('3-morning-briefing.json', 'Pipeline stats'), rows);
  const s = out[0].json.stats;
  assert.equal(s.total_leads, 3);
  assert.equal(s.new_last_24h, 1);
  assert.equal(s.new_last_7d, 2);
  assert.deepEqual(s.tiers_last_7d, { hot: 1, warm: 1, cold: 0 });
  assert.equal(s.hot_leads_not_contacted[0].name, 'Ann Lee');
  assert.equal(s.warm_or_hot_waiting_over_48h, 1);
});

test('Pipeline stats: empty sheet does not crash', () => {
  const out = run(codeOf('3-morning-briefing.json', 'Pipeline stats'), [{}]);
  assert.equal(out[0].json.stats.total_leads, 0);
});

test('Briefing email builds subject and HTML', () => {
  const stats = run(codeOf('3-morning-briefing.json', 'Pipeline stats'), rows)[0].json;
  const out = run(codeOf('3-morning-briefing.json', 'Build briefing email'), [{ text: 'Call Ann first.' }], { 'Pipeline stats': [stats] });
  assert.match(out[0].json.subject, /1 new, 1 to call/);
  assert.match(out[0].json.html, /Call Ann first\./);
});

test('CRM API masks personal data', () => {
  const out = run(codeOf('4-crm-api.json', 'Mask and shape'), rows)[0].json;
  assert.equal(out.ok, true);
  assert.equal(out.leads[0].id, 'A');
  assert.equal(out.leads[0].name, 'Ann');
  const text = JSON.stringify(out);
  assert.ok(!text.includes('@'), 'no email addresses leak');
});

test('CRM API reports a failed sheet read', () => {
  const out = run(codeOf('4-crm-api.json', 'Mask and shape'), [{ error: 'invalid_grant' }])[0].json;
  assert.equal(out.ok, false);
});

test('Inbox: prepare strips quoted history', () => {
  const out = run(codeOf('2-inbox-agent.json', 'Prepare email'), [{ id: 'm1', threadId: 't1', from: { value: [{ address: 'Ann@X.com', name: 'Ann' }] }, subject: 'Re: call', text: 'Tuesday works.\nOn Mon, Andries wrote:\n> old stuff' }]);
  assert.equal(out[0].json.from_email, 'ann@x.com');
  assert.equal(out[0].json.body, 'Tuesday works.');
});

test('Inbox: parse agent JSON result', () => {
  const out = run(codeOf('2-inbox-agent.json', 'Parse agent result'), [{ output: 'Done. {"category":"lead_reply","priority":"high","is_known_lead":true,"actions_taken":["updated status","drafted reply"],"summary":"Ann agreed to Tuesday."}' }], { 'Prepare email': [{ message_id: 'm1', from_email: 'ann@x.com', subject: 'Re: call' }] });
  assert.equal(out[0].json.category, 'lead_reply');
  assert.equal(out[0].json.actions_taken, 'updated status; drafted reply');
  assert.equal(out[0].json.is_known_lead, 'yes');
});

test('Error alert formats message', () => {
  const out = run(codeOf('5-error-alerts.json', 'Format alert'), [{ workflow: { name: 'LeadPilot: 1' }, execution: { lastNodeExecuted: 'Qualify with GPT', error: { message: 'Boom <b>' }, url: 'https://n8n/x' } }]);
  assert.match(out[0].json.subject, /LeadPilot: 1/);
  assert.ok(out[0].json.html.includes('Boom &lt;b&gt;'));
});
