// Demo mode: used when the n8n backend isn't configured yet, so the site still
// works the moment it's deployed. Responses are clearly flagged mode: "demo".
import { blendScore, makeLeadId, firstName } from '../../lib/scoring.js';

const THEMES = [
  { re: /crm|hubspot|pipedrive|salesforce|lead/i, topic: 'lead follow-up', idea: 'Auto-enrich and route new leads into your CRM with an AI fit score', pain: 'Leads go stale before anyone follows up', industry: 'B2B services' },
  { re: /email|inbox|gmail|outlook|reply/i, topic: 'your inbox', idea: 'AI inbox triage that labels mail and drafts replies for approval', pain: 'Too much time spent in the inbox', industry: 'Professional services' },
  { re: /invoice|accounting|xero|quickbooks|payment/i, topic: 'invoice processing', idea: 'Invoice capture from email into your accounting system', pain: 'Manual data entry for invoices', industry: 'Finance & accounting' },
  { re: /shop|store|order|ecommerce|shopify|woo/i, topic: 'order handling', idea: 'Order-to-fulfilment sync with low-stock alerts', pain: 'Orders and stock handled by hand', industry: 'E-commerce' },
  { re: /chat|support|ticket|whatsapp|customer/i, topic: 'customer support', idea: 'AI support agent that answers FAQs and escalates edge cases', pain: 'Repetitive customer questions', industry: 'Customer service' },
  { re: /report|sheet|excel|dashboard|data/i, topic: 'reporting', idea: 'Scheduled reports from Google Sheets with an AI written summary', pain: 'Reporting takes hours every week', industry: 'Operations' },
  { re: /recruit|hiring|candidate|cv|resume/i, topic: 'candidate screening', idea: 'Candidate screening pipeline that scores CVs against the role', pain: 'Slow candidate screening', industry: 'Recruitment' },
];

function guessAiScore(lead) {
  let s = 35;
  const m = lead.message.toLowerCase();
  if (/budget|quote|price|cost|proposal/.test(m)) s += 15;
  if (/urgent|asap|this week|this month|deadline/.test(m)) s += 12;
  if (/automat|workflow|integrat|n8n|zapier|make\.com|ai agent|openai|gpt/.test(m)) s += 18;
  if (lead.company) s += 8;
  if (lead.message.length > 250) s += 7;
  if (/seo|backlink|crypto|casino|loan offer/.test(m)) s = 5;
  return Math.min(98, s);
}

export function mockQualify(lead) {
  const matched = THEMES.filter((t) => t.re.test(lead.message));
  const themes = matched.length ? matched : [THEMES[5]];
  const aiScore = guessAiScore(lead);
  const blended = blendScore(aiScore, lead);
  const spam = aiScore < 10;
  const fname = firstName(lead.name);
  const ideas = themes.slice(0, 3).map((t) => t.idea);
  const company = lead.company || 'your team';

  return {
    score: blended.score,
    tier: blended.tier,
    ai_score: blended.aiScore,
    rule_score: blended.ruleScore,
    signals: blended.signals,
    intent: spam ? 'spam' : /call|meet|chat|talk/i.test(lead.message) ? 'consultation' : 'new_project',
    industry: themes[0].industry,
    company_size: lead.company ? 'small' : 'unknown',
    summary: `${fname || 'This lead'} wants help automating work at ${company}: ${themes.map((t) => t.pain.toLowerCase()).slice(0, 2).join(' and ')}.`,
    pain_points: themes.slice(0, 3).map((t) => t.pain),
    automation_ideas: ideas,
    recommended_action: blended.tier === 'hot'
      ? 'Call within 2 hours and send the drafted reply.'
      : blended.tier === 'warm' ? 'Send the drafted reply today and offer a discovery call.' : 'Add to nurture list; reply within 48 hours.',
    reply_subject: `Automating ${themes[0].topic} at ${company}`,
    reply_body: `Hi ${fname || 'there'},\n\nThanks for reaching out about ${company}. From your message, the biggest win looks like this: ${ideas[0].charAt(0).toLowerCase() + ideas[0].slice(1)}. I've built similar flows with n8n and the OpenAI API, and they usually pay for themselves within weeks because the repetitive steps simply disappear.\n\nWould you be open to a 20-minute discovery call this week? I'll map your current process, point out the quickest automation wins, and give you a clear estimate before any work starts.\n\nBest regards,\nAndries Mokono`,
  };
}

export function mockLeadResponse(lead) {
  const q = mockQualify(lead);
  return {
    ok: true,
    mode: 'demo',
    lead: { id: makeLeadId(), name: lead.name, company: lead.company, received_at: new Date().toISOString() },
    qualification: q,
    actions: [
      { step: 'webhook', status: 'simulated' },
      { step: 'validate', status: 'done' },
      { step: 'ai', status: 'simulated' },
      { step: 'crm', status: 'simulated' },
      { step: 'draft', status: 'simulated' },
      { step: 'notify', status: q.tier === 'hot' ? 'simulated' : 'skipped' },
    ],
  };
}

const SAMPLE = [
  ['Thandi', 'Kasi Logistics', 'hot', 86, 'Logistics', 'new', 'Automate delivery-status emails from their TMS'],
  ['Marco', 'Bellavita Foods', 'warm', 64, 'Food & beverage', 'contacted', 'Sync Shopify orders to Google Sheets and Xero'],
  ['Priya', 'Northwind Dental', 'warm', 58, 'Healthcare', 'meeting_requested', 'WhatsApp booking assistant with reminders'],
  ['Jason', 'Ledgerly', 'hot', 91, 'Fintech', 'replied', 'AI triage for 400+ support emails a day'],
  ['Lerato', 'Studio Lumen', 'cold', 32, 'Creative agency', 'nurture', 'Exploring AI for client reporting'],
  ['Ahmed', 'Brightpath Recruit', 'warm', 69, 'Recruitment', 'new', 'Score CVs against job specs automatically'],
  ['Sofia', 'GreenGrid Solar', 'hot', 78, 'Energy', 'contacted', 'Lead routing from 3 web forms into HubSpot'],
  ['Kabelo', 'Freelance', 'cold', 21, 'Unknown', 'new', 'General question about pricing'],
];

export function mockPipeline() {
  const now = Date.now();
  const leads = SAMPLE.map(([name, company, tier, score, industry, status, summary], i) => ({
    id: 'LP-DEMO-' + String(i + 1).padStart(3, '0'),
    received_at: new Date(now - i * 7.3 * 3600e3).toISOString(),
    name, company, tier, score, industry, status, summary,
  }));
  return { ok: true, mode: 'demo', generated_at: new Date().toISOString(), leads };
}
