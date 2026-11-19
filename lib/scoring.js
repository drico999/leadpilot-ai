// LeadPilot AI — shared lead-scoring rules.
// Single source of truth: imported by the Vercel API (demo mode + tests) and
// inlined into the n8n Code nodes by scripts/build-workflows.mjs.
// Keep this file dependency-free and free of Node/Browser-only APIs.

export const FREE_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'live.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com', 'mail.com',
];

export const BUDGET_OPTIONS = ['under-1k', '1k-5k', '5k-20k', '20k-plus', 'unsure'];
export const TIMELINE_OPTIONS = ['asap', 'this-quarter', 'exploring'];

const BUDGET_POINTS = { 'under-1k': 0, '1k-5k': 6, '5k-20k': 12, '20k-plus': 18, unsure: 3 };
const TIMELINE_POINTS = { asap: 10, 'this-quarter': 6, exploring: 0 };
const RULE_MAX = 10 + 18 + 10 + 4 + 4; // sum of every rule's maximum

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Validate and normalise a raw form submission.
 * Returns { ok: true, lead } or { ok: false, errors: { field: message } }.
 */
export function normalizeLead(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const errors = {};

  // Honeypot: real people never fill the hidden "company_url" field.
  if (clean(input.company_url, 200)) {
    return { ok: false, spam: true, errors: { form: 'Submission rejected.' } };
  }

  const lead = {
    name: clean(input.name, 80),
    email: clean(input.email, 120).toLowerCase(),
    company: clean(input.company, 120),
    website: clean(input.website, 200),
    budget: BUDGET_OPTIONS.includes(input.budget) ? input.budget : 'unsure',
    timeline: TIMELINE_OPTIONS.includes(input.timeline) ? input.timeline : 'exploring',
    message: String(input.message == null ? '' : input.message).trim().slice(0, 2000),
  };

  if (lead.name.length < 2) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(lead.email)) errors.email = 'Enter a valid email address.';
  if (lead.message.length < 15) errors.message = 'Tell us a little more (at least 15 characters).';
  if (lead.website && !/^https?:\/\//i.test(lead.website)) lead.website = 'https://' + lead.website;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, lead };
}

/** Deterministic signals a sales team trusts, independent of the LLM. */
export function ruleSignals(lead) {
  const domain = (lead.email.split('@')[1] || '').toLowerCase();
  const businessEmail = domain !== '' && !FREE_EMAIL_DOMAINS.includes(domain);
  const signals = [];
  let points = 0;

  if (businessEmail) { points += 10; signals.push('Business email domain'); }
  const b = BUDGET_POINTS[lead.budget] ?? 0;
  if (b) { points += b; signals.push('Budget: ' + lead.budget); }
  const t = TIMELINE_POINTS[lead.timeline] ?? 0;
  if (t) { points += t; signals.push('Timeline: ' + lead.timeline); }
  if (lead.message.length >= 200) { points += 4; signals.push('Detailed brief'); }
  if (lead.website) { points += 4; signals.push('Website provided'); }

  return { points, max: RULE_MAX, normalized: Math.round((points / RULE_MAX) * 100), signals, businessEmail };
}

export function tierFor(score) {
  if (score >= 70) return 'hot';
  if (score >= 45) return 'warm';
  return 'cold';
}

/**
 * Blend the LLM's judgement (65%) with deterministic rules (35%).
 * The AI reads intent and fit; rules keep the score explainable and stable.
 */
export function blendScore(aiScore, lead) {
  const ai = Math.max(0, Math.min(100, Math.round(Number(aiScore) || 0)));
  const rules = ruleSignals(lead);
  const score = Math.round(ai * 0.65 + rules.normalized * 0.35);
  return { score, tier: tierFor(score), aiScore: ai, ruleScore: rules.normalized, signals: rules.signals };
}

/** Parse the model's JSON reply defensively (handles ```json fences and stray text). */
export function parseModelJson(text) {
  if (text && typeof text === 'object') return text;
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Model reply contained no JSON object');
  return JSON.parse(s.slice(start, end + 1));
}

export function makeLeadId(date) {
  const d = date || new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return 'LP-' + stamp + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

/** Hide personal data before anything leaves the CRM for the public dashboard. */
export function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!user || !domain) return '';
  return user.slice(0, 1) + '•••@' + domain;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
