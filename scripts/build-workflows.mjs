#!/usr/bin/env node
// Generates importable n8n workflow JSON from readable sources:
//   lib/scoring.js + lib/prompts.js + n8n/code/*.js  ->  n8n/workflows/*.json
//
// Config comes from environment variables (or a .env file in the repo root):
//   OWNER_EMAIL   where alerts and briefings go          (default: you@example.com)
//   OWNER_NAME    name used to sign AI-drafted replies   (default: Andries Mokono)
//   SHEET_ID      Google Sheets CRM document id          (default: YOUR_GOOGLE_SHEET_ID)
//   OPENAI_MODEL  chat model for every AI step           (default: gpt-4.1-mini)
//   TIMEZONE      workflow timezone                      (default: Africa/Johannesburg)
//
// Usage: npm run build:workflows

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { QUALIFY_SYSTEM, QUALIFY_USER, INBOX_AGENT_SYSTEM, DIGEST_SYSTEM } from '../lib/prompts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency).
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const CONFIG = {
  ownerEmail: process.env.OWNER_EMAIL || 'you@example.com',
  ownerName: process.env.OWNER_NAME || 'Andries Mokono',
  sheetId: process.env.SHEET_ID || 'YOUR_GOOGLE_SHEET_ID',
  model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  timezone: process.env.TIMEZONE || 'Africa/Johannesburg',
};

// ---------- helpers ----------

const scoringLib = readFileSync(join(root, 'lib/scoring.js'), 'utf8')
  .replace(/^\/\/.*\n/gm, '')
  .replace(/^export\s+/gm, '')
  .trim();

function code(file) {
  let src = readFileSync(join(root, 'n8n/code', file), 'utf8');
  src = src.replace('/*__SCORING__*/', '// --- inlined from lib/scoring.js ---\n' + scoringLib + '\n// --- end lib/scoring.js ---');
  return fill(src);
}

function fill(s) {
  return s
    .replaceAll('__OWNER_EMAIL__', CONFIG.ownerEmail)
    .replaceAll('__OWNER_NAME__', CONFIG.ownerName)
    .replaceAll('__SHEET_ID__', CONFIG.sheetId);
}

// Stable UUID-shaped ids so re-builds produce clean diffs.
function uid(seed) {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function node(wf, name, type, typeVersion, position, parameters, extra = {}) {
  return { parameters, id: uid(wf + ':' + name), name, type, typeVersion, position, ...extra };
}

const cred = {
  sheets: { googleSheetsOAuth2Api: { id: 'leadpilotSheets01', name: 'Google Sheets account' } },
  gmail: { gmailOAuth2: { id: 'leadpilotGmail001', name: 'Gmail account' } },
  openai: { openAiApi: { id: 'leadpilotOpenAI01', name: 'OpenAI account' } },
  header: { httpHeaderAuth: { id: 'leadpilotHeader01', name: 'LeadPilot webhook key' } },
};

const doc = () => ({ __rl: true, value: CONFIG.sheetId, mode: 'id' });
const tab = (name) => ({ __rl: true, value: name, mode: 'name' });

const LEAD_COLUMNS = [
  'lead_id', 'received_at', 'name', 'email', 'company', 'website', 'budget', 'timeline', 'message',
  'score', 'tier', 'ai_score', 'rule_score', 'intent', 'industry', 'company_size', 'summary',
  'pain_points', 'automation_ideas', 'recommended_action', 'status', 'last_note', 'updated_at', 'source',
];
const INBOX_COLUMNS = ['logged_at', 'message_id', 'from', 'subject', 'category', 'priority', 'is_known_lead', 'actions_taken', 'summary'];

function schema(cols) {
  return cols.map((c) => ({
    id: c, displayName: c, required: false, defaultMatch: false, display: true,
    type: 'string', canBeUsedToMatch: true, removed: false,
  }));
}

function code2(wf, name, file, position, extra) {
  return node(wf, name, 'n8n-nodes-base.code', 2, position, { jsCode: code(file) }, extra);
}

function ifNode(wf, name, position, leftValue, operator, rightValue) {
  const condition = { id: uid(wf + name + 'c'), leftValue, operator };
  if (rightValue !== undefined) condition.rightValue = rightValue;
  return node(wf, name, 'n8n-nodes-base.if', 2.2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [condition],
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  });
}

function openAiModel(wf, name, position, { json = false, temperature = 0.3 } = {}) {
  const options = { temperature, timeout: 45000, maxRetries: 2 };
  if (json) options.responseFormat = 'json_object';
  return node(wf, name, '@n8n/n8n-nodes-langchain.lmChatOpenAi', 1.2, position, {
    model: { __rl: true, value: CONFIG.model, mode: 'list', cachedResultName: CONFIG.model },
    options,
  }, { credentials: cred.openai });
}

function gmailSend(wf, name, position, { to, subject, html }, extra = {}) {
  return node(wf, name, 'n8n-nodes-base.gmail', 2.1, position, {
    sendTo: to,
    subject,
    message: html,
    options: { appendAttribution: false, senderName: 'LeadPilot' },
  }, { credentials: cred.gmail, webhookId: uid(wf + name + 'hook'), ...extra });
}

function connect(pairs) {
  // pairs: [from, to, { type, outputIndex }]
  const out = {};
  for (const [from, to, opt = {}] of pairs) {
    const type = opt.type || 'main';
    const idx = opt.output || 0;
    out[from] ??= {};
    out[from][type] ??= [];
    while (out[from][type].length <= idx) out[from][type].push([]);
    out[from][type][idx].push({ node: to, type, index: 0 });
  }
  return out;
}

function workflow(name, nodes, connections) {
  return {
    name,
    nodes,
    pinData: {},
    connections,
    active: false,
    settings: { executionOrder: 'v1', timezone: CONFIG.timezone, saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
    meta: { templateCredsSetupCompleted: false, generatedBy: 'leadpilot-ai/scripts/build-workflows.mjs' },
  };
}

// ---------- 1. Lead intake & qualification ----------

function leadIntake() {
  const W = 'intake';
  const P = "$('Parse and score').first().json";
  const nodes = [
    node(W, 'Lead webhook', 'n8n-nodes-base.webhook', 2.1, [0, 300], {
      httpMethod: 'POST',
      path: 'leadpilot/lead',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    }, { credentials: cred.header, webhookId: uid(W + 'webhook') }),
    code2(W, 'Validate lead', 'validate-lead.js', [220, 300]),
    ifNode(W, 'Is valid?', [440, 300], '={{ $json.valid }}', { type: 'boolean', operation: 'true', singleValue: true }),
    node(W, 'Reject invalid lead', 'n8n-nodes-base.respondToWebhook', 1.4, [660, 520], {
      respondWith: 'json',
      responseBody: '={{ { ok: false, error: "Some fields need attention.", fields: $json.errors } }}',
      options: { responseCode: 422 },
    }),
    node(W, 'Qualify with GPT', '@n8n/n8n-nodes-langchain.chainLlm', 1.7, [680, 280], {
      promptType: 'define',
      text: '=' + QUALIFY_USER,
      messages: { messageValues: [{ message: QUALIFY_SYSTEM }] },
    }, { onError: 'continueRegularOutput' }),
    openAiModel(W, 'OpenAI chat model', [680, 480], { json: true, temperature: 0.3 }),
    code2(W, 'Parse and score', 'parse-and-score.js', [1000, 300]),
    node(W, 'Append lead to CRM', 'n8n-nodes-base.googleSheets', 4.6, [1220, 300], {
      operation: 'append',
      documentId: doc(),
      sheetName: tab('Leads'),
      columns: {
        mappingMode: 'defineBelow',
        value: {
          lead_id: '={{ $json.lead.id }}',
          received_at: '={{ $json.lead.received_at }}',
          name: '={{ $json.lead.name }}',
          email: '={{ $json.lead.email }}',
          company: '={{ $json.lead.company }}',
          website: '={{ $json.lead.website }}',
          budget: '={{ $json.lead.budget }}',
          timeline: '={{ $json.lead.timeline }}',
          message: '={{ $json.lead.message }}',
          score: '={{ $json.qualification.score }}',
          tier: '={{ $json.qualification.tier }}',
          ai_score: '={{ $json.qualification.ai_score }}',
          rule_score: '={{ $json.qualification.rule_score }}',
          intent: '={{ $json.qualification.intent }}',
          industry: '={{ $json.qualification.industry }}',
          company_size: '={{ $json.qualification.company_size }}',
          summary: '={{ $json.qualification.summary }}',
          pain_points: "={{ $json.qualification.pain_points.join('; ') }}",
          automation_ideas: "={{ $json.qualification.automation_ideas.join('; ') }}",
          recommended_action: '={{ $json.qualification.recommended_action }}',
          status: 'new',
          last_note: '',
          updated_at: '={{ $json.lead.received_at }}',
          source: '={{ $json.lead.source }}',
        },
        matchingColumns: [],
        schema: schema(LEAD_COLUMNS),
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: { cellFormat: 'RAW' },
    }, { credentials: cred.sheets, onError: 'continueRegularOutput' }),
    ifNode(W, 'Is hot?', [1440, 300], `={{ ${P}.qualification.tier }}`, { type: 'string', operation: 'equals' }, 'hot'),
    gmailSend(W, 'Alert owner', [1660, 180], {
      to: CONFIG.ownerEmail,
      subject: `=Hot lead ({{ ${P}.qualification.score }}): {{ ${P}.lead.name }}{{ ${P}.lead.company ? ' at ' + ${P}.lead.company : '' }}`,
      html: `={{ ${P}.notify_html }}`,
    }, { onError: 'continueRegularOutput' }),
    ifNode(W, 'Worth a reply?', [1880, 300], `={{ ${P}.qualification.intent }}`, { type: 'string', operation: 'notEquals' }, 'spam'),
    node(W, 'Draft reply in Gmail', 'n8n-nodes-base.gmail', 2.1, [2100, 220], {
      resource: 'draft',
      subject: `={{ ${P}.qualification.reply_subject }}`,
      emailType: 'text',
      message: `={{ ${P}.qualification.reply_body }}`,
      options: { sendTo: `={{ ${P}.lead.email }}` },
    }, { credentials: cred.gmail, onError: 'continueRegularOutput' }),
    code2(W, 'Build response', 'build-response.js', [2320, 300]),
    node(W, 'Respond to website', 'n8n-nodes-base.respondToWebhook', 1.4, [2540, 300], {
      respondWith: 'json',
      responseBody: '={{ $json }}',
      options: {},
    }),
    node(W, 'Note', 'n8n-nodes-base.stickyNote', 1, [-40, -40], {
      content: '## Lead intake and qualification\nCalled by the website through `/api/lead` with the `X-LeadPilot-Key` header.\n\n1. Validate input (shared rules from `lib/scoring.js`)\n2. GPT reads intent and fit, writes a reply\n3. Score = 65% AI + 35% rules\n4. Append to the **Leads** tab, alert owner if hot, save a Gmail **draft**\n5. Answer the website with an honest step trace\n\nCRM and Gmail steps continue on error so a lead is never lost.',
      height: 300, width: 520, color: 4,
    }),
  ];
  const connections = connect([
    ['Lead webhook', 'Validate lead'],
    ['Validate lead', 'Is valid?'],
    ['Is valid?', 'Qualify with GPT', { output: 0 }],
    ['Is valid?', 'Reject invalid lead', { output: 1 }],
    ['OpenAI chat model', 'Qualify with GPT', { type: 'ai_languageModel' }],
    ['Qualify with GPT', 'Parse and score'],
    ['Parse and score', 'Append lead to CRM'],
    ['Append lead to CRM', 'Is hot?'],
    ['Is hot?', 'Alert owner', { output: 0 }],
    ['Is hot?', 'Worth a reply?', { output: 1 }],
    ['Alert owner', 'Worth a reply?'],
    ['Worth a reply?', 'Draft reply in Gmail', { output: 0 }],
    ['Worth a reply?', 'Build response', { output: 1 }],
    ['Draft reply in Gmail', 'Build response'],
    ['Build response', 'Respond to website'],
  ]);
  return workflow('LeadPilot: 1. Lead intake and qualification', nodes, connections);
}

// ---------- 2. Inbox triage AI agent ----------

function inboxAgent() {
  const W = 'inbox';
  const nodes = [
    node(W, 'New email', 'n8n-nodes-base.gmailTrigger', 1.2, [0, 300], {
      pollTimes: { item: [{ mode: 'everyMinute' }] },
      simple: false,
      filters: { labelIds: ['INBOX'], q: '-from:me -category:promotions -category:social -category:updates', readStatus: 'unread' },
      options: {},
    }, { credentials: cred.gmail }),
    code2(W, 'Prepare email', 'inbox-prepare.js', [220, 300]),
    node(W, 'Inbox agent', '@n8n/n8n-nodes-langchain.agent', 2.2, [480, 300], {
      promptType: 'define',
      text: '=New email to triage.\nFrom: {{ $json.from_name }} <{{ $json.from_email }}>\nSubject: {{ $json.subject }}\nThread ID (use for Draft reply): {{ $json.thread_id }}\nReceived: {{ $json.received_at }}\n\nBody:\n"""\n{{ $json.body }}\n"""',
      options: { systemMessage: fill(INBOX_AGENT_SYSTEM), maxIterations: 8 },
    }),
    openAiModel(W, 'OpenAI chat model', [340, 520], { temperature: 0.2 }),
    node(W, 'Find lead in CRM', 'n8n-nodes-base.googleSheetsTool', 4.6, [500, 520], {
      descriptionType: 'manual',
      toolDescription: 'Look up a lead in the CRM by email address. Returns the matching row (name, company, tier, score, status, summary) or nothing if the sender is unknown.',
      documentId: doc(),
      sheetName: tab('Leads'),
      filtersUI: { values: [{ lookupColumn: 'email', lookupValue: "={{ $fromAI('email', 'Sender email address, lowercase', 'string') }}" }] },
      options: {},
    }, { credentials: cred.sheets }),
    node(W, 'Update lead status', 'n8n-nodes-base.googleSheetsTool', 4.6, [660, 520], {
      descriptionType: 'manual',
      toolDescription: 'Create or update a lead row matched on email. Use to record a new status (new, replied, meeting_requested, not_interested) and a one-line note.',
      operation: 'appendOrUpdate',
      documentId: doc(),
      sheetName: tab('Leads'),
      columns: {
        mappingMode: 'defineBelow',
        value: {
          email: "={{ $fromAI('email', 'Lead email address, lowercase', 'string') }}",
          status: "={{ $fromAI('status', 'One of: new, replied, meeting_requested, not_interested', 'string') }}",
          last_note: "={{ $fromAI('note', 'One-line note about this email', 'string') }}",
          updated_at: '={{ $now.toISO() }}',
        },
        matchingColumns: ['email'],
        schema: schema(LEAD_COLUMNS),
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: {},
    }, { credentials: cred.sheets }),
    node(W, 'Draft reply', 'n8n-nodes-base.gmailTool', 2.1, [820, 520], {
      descriptionType: 'manual',
      toolDescription: 'Save a reply as a Gmail draft in the same thread. A person reviews and sends it. Never claim the email was sent.',
      resource: 'draft',
      subject: "={{ $fromAI('subject', 'Reply subject, usually Re: original subject', 'string') }}",
      emailType: 'text',
      message: `={{ $fromAI('body', 'Plain-text reply body, signed ${CONFIG.ownerName}', 'string') }}`,
      options: {
        threadId: "={{ $fromAI('thread_id', 'Thread ID from the email details', 'string') }}",
        sendTo: "={{ $fromAI('to', 'Recipient email address', 'string') }}",
      },
    }, { credentials: cred.gmail, webhookId: uid(W + 'draft') }),
    code2(W, 'Parse agent result', 'inbox-parse.js', [820, 300]),
    node(W, 'Log to Inbox Log', 'n8n-nodes-base.googleSheets', 4.6, [1040, 300], {
      operation: 'append',
      documentId: doc(),
      sheetName: tab('Inbox Log'),
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        matchingColumns: [],
        schema: schema(INBOX_COLUMNS),
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: { cellFormat: 'RAW' },
    }, { credentials: cred.sheets, onError: 'continueRegularOutput' }),
    node(W, 'Note', 'n8n-nodes-base.stickyNote', 1, [-40, -20], {
      content: '## Inbox triage agent\nPolls Gmail every minute for unread inbox mail (not from you, not promotions).\n\nThe AI agent has three tools: **Find lead in CRM**, **Update lead status** and **Draft reply**. It can draft but never send. Every decision is logged to the **Inbox Log** tab.',
      height: 260, width: 480, color: 5,
    }),
  ];
  const connections = connect([
    ['New email', 'Prepare email'],
    ['Prepare email', 'Inbox agent'],
    ['OpenAI chat model', 'Inbox agent', { type: 'ai_languageModel' }],
    ['Find lead in CRM', 'Inbox agent', { type: 'ai_tool' }],
    ['Update lead status', 'Inbox agent', { type: 'ai_tool' }],
    ['Draft reply', 'Inbox agent', { type: 'ai_tool' }],
    ['Inbox agent', 'Parse agent result'],
    ['Parse agent result', 'Log to Inbox Log'],
  ]);
  return workflow('LeadPilot: 2. Inbox triage agent', nodes, connections);
}

// ---------- 3. Morning pipeline briefing ----------

function readLeads(W, name, position, extra = {}) {
  return node(W, name, 'n8n-nodes-base.googleSheets', 4.6, position, {
    documentId: doc(),
    sheetName: tab('Leads'),
    options: {},
  }, { credentials: cred.sheets, alwaysOutputData: true, ...extra });
}

function briefing() {
  const W = 'digest';
  const nodes = [
    node(W, 'Weekdays 07:30', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 300], {
      rule: { interval: [{ field: 'cronExpression', expression: '30 7 * * 1-5' }] },
    }),
    readLeads(W, 'Read CRM', [220, 300]),
    code2(W, 'Pipeline stats', 'pipeline-stats.js', [440, 300]),
    node(W, 'Write briefing', '@n8n/n8n-nodes-langchain.chainLlm', 1.7, [660, 300], {
      promptType: 'define',
      text: '={{ JSON.stringify($json.stats, null, 2) }}',
      messages: { messageValues: [{ message: DIGEST_SYSTEM }] },
    }, { onError: 'continueRegularOutput' }),
    openAiModel(W, 'OpenAI chat model', [660, 500], { temperature: 0.5 }),
    code2(W, 'Build briefing email', 'briefing-email.js', [960, 300]),
    gmailSend(W, 'Send briefing', [1180, 300], { to: CONFIG.ownerEmail, subject: '={{ $json.subject }}', html: '={{ $json.html }}' }),
  ];
  const connections = connect([
    ['Weekdays 07:30', 'Read CRM'],
    ['Read CRM', 'Pipeline stats'],
    ['Pipeline stats', 'Write briefing'],
    ['OpenAI chat model', 'Write briefing', { type: 'ai_languageModel' }],
    ['Write briefing', 'Build briefing email'],
    ['Build briefing email', 'Send briefing'],
  ]);
  return workflow('LeadPilot: 3. Morning pipeline briefing', nodes, connections);
}

// ---------- 4. CRM API (public dashboard feed) ----------

function crmApi() {
  const W = 'crmapi';
  const nodes = [
    node(W, 'Leads webhook', 'n8n-nodes-base.webhook', 2.1, [0, 300], {
      httpMethod: 'GET',
      path: 'leadpilot/leads',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    }, { credentials: cred.header, webhookId: uid(W + 'webhook') }),
    readLeads(W, 'Read CRM', [220, 300], { onError: 'continueRegularOutput' }),
    code2(W, 'Mask and shape', 'crm-api.js', [440, 300]),
    node(W, 'Respond with leads', 'n8n-nodes-base.respondToWebhook', 1.4, [660, 300], {
      respondWith: 'json',
      responseBody: '={{ $json }}',
      options: {},
    }),
  ];
  const connections = connect([
    ['Leads webhook', 'Read CRM'],
    ['Read CRM', 'Mask and shape'],
    ['Mask and shape', 'Respond with leads'],
  ]);
  return workflow('LeadPilot: 4. CRM API', nodes, connections);
}

// ---------- 5. Error alerts ----------

function errorAlerts() {
  const W = 'errors';
  const nodes = [
    node(W, 'On workflow error', 'n8n-nodes-base.errorTrigger', 1, [0, 300], {}),
    code2(W, 'Format alert', 'error-alert.js', [220, 300]),
    gmailSend(W, 'Email owner', [440, 300], { to: CONFIG.ownerEmail, subject: '={{ $json.subject }}', html: '={{ $json.html }}' }),
  ];
  const connections = connect([
    ['On workflow error', 'Format alert'],
    ['Format alert', 'Email owner'],
  ]);
  return workflow('LeadPilot: 5. Error alerts', nodes, connections);
}

// ---------- write ----------

const outDir = join(root, 'n8n/workflows');
mkdirSync(outDir, { recursive: true });
const files = {
  '1-lead-intake.json': leadIntake(),
  '2-inbox-agent.json': inboxAgent(),
  '3-morning-briefing.json': briefing(),
  '4-crm-api.json': crmApi(),
  '5-error-alerts.json': errorAlerts(),
};
for (const [file, wf] of Object.entries(files)) {
  writeFileSync(join(outDir, file), JSON.stringify(wf, null, 2) + '\n');
  console.log(`wrote n8n/workflows/${file}  (${wf.nodes.length} nodes)`);
}
console.log(`config: owner=${CONFIG.ownerEmail} sheet=${CONFIG.sheetId} model=${CONFIG.model}`);
