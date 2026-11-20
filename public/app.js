// LeadPilot demo page: submits the form, animates the route, renders the result.

const $ = (sel, root = document) => root.querySelector(sel);
const form = $('#lead-form');
const btn = $('#submit-btn');
const msg = $('#form-msg');
const route = $('#route');
const routeStatus = $('#route-status');
const stops = [...route.querySelectorAll('li')];
const STEPS = stops.map((li) => li.dataset.step);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STATUS_TEXT = {
  done: 'done',
  simulated: 'simulated in demo mode',
  skipped: 'skipped',
  failed: 'failed',
};

const SAMPLES = [
  {
    name: 'Thandi Nkosi', email: 'thandi@kasilogistics.co.za', company: 'Kasi Logistics', website: 'kasilogistics.co.za',
    budget: '5k-20k', timeline: 'asap',
    message: 'We get about 60 delivery enquiries a week through our website and Gmail. Replies take two or three days and none of it ends up in HubSpot. We want AI to sort the enquiries, draft answers and log every lead in our CRM automatically.',
  },
  {
    name: 'Marco Bellini', email: 'marco@bellavitafoods.com', company: 'Bellavita Foods', website: 'bellavitafoods.com',
    budget: '1k-5k', timeline: 'this-quarter',
    message: 'Our Shopify orders get copied into Google Sheets by hand every evening, then into Xero. Could you automate that with n8n or Zapier and send a daily summary email?',
  },
  {
    name: 'Lerato Dlamini', email: 'lerato.d@gmail.com', company: '', website: '',
    budget: 'unsure', timeline: 'exploring',
    message: 'Just curious what AI automation could do for a small design studio, maybe client reporting?',
  },
];
let sampleIndex = 0;

// ---------- mode banner ----------
fetch('/api/leads').then((r) => r.json()).then((d) => {
  if (d.mode === 'demo') showDemoNote();
}).catch(() => {});

function showDemoNote() {
  const note = $('#mode-note');
  note.textContent = 'Demo mode: the automation backend isn\'t connected on this deployment, so the AI model is replaced by a rules engine and the CRM, Gmail and alert steps are simulated.';
  note.hidden = false;
}

// ---------- route animation ----------
function setStop(step, state) {
  const li = stops[STEPS.indexOf(step)];
  if (!li) return;
  li.dataset.state = state;
  const reached = stops.filter((s) => ['done', 'simulated', 'skipped', 'failed'].includes(s.dataset.state)).length;
  route.style.setProperty('--progress', Math.max(0, (reached - 1) / (stops.length - 1)));
}
function resetRoute() {
  stops.forEach((li) => delete li.dataset.state);
  route.style.setProperty('--progress', 0);
}

let ticking = false;
async function runWaitingAnimation() {
  ticking = true;
  setStop('webhook', 'active');
  routeStatus.textContent = 'Lead received by the n8n webhook.';
  await wait(reduced ? 0 : 450);
  if (!ticking) return;
  setStop('webhook', 'done');
  setStop('validate', 'active');
  routeStatus.textContent = 'Checking the details.';
  await wait(reduced ? 0 : 450);
  if (!ticking) return;
  setStop('validate', 'done');
  setStop('ai', 'active');
  routeStatus.textContent = 'The AI is reading the message and scoring the lead.';
}

async function playActions(actions) {
  ticking = false;
  const byStep = Object.fromEntries(actions.map((a) => [a.step, a.status]));
  for (const step of STEPS) {
    const status = byStep[step] || 'skipped';
    setStop(step, 'active');
    await wait(reduced ? 0 : step === 'ai' ? 150 : 380);
    setStop(step, status);
    const label = stops[STEPS.indexOf(step)].querySelector('strong').textContent;
    routeStatus.textContent = `${label}: ${STATUS_TEXT[status] || status}.`;
  }
}

// ---------- form ----------
function showFieldErrors(fields = {}) {
  form.querySelectorAll('.err').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  let first;
  for (const [name, text] of Object.entries(fields)) {
    const input = form.elements[name];
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const span = document.createElement('span');
    span.className = 'err';
    span.textContent = text;
    input.insertAdjacentElement('afterend', span);
    first ??= input;
  }
  first?.focus();
}

function clientCheck(data) {
  const f = {};
  if ((data.name || '').trim().length < 2) f.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((data.email || '').trim())) f.email = 'Enter a valid email address.';
  if ((data.message || '').trim().length < 15) f.message = 'Tell us a little more (at least 15 characters).';
  return f;
}

$('#sample-btn').addEventListener('click', () => {
  const s = SAMPLES[sampleIndex++ % SAMPLES.length];
  for (const [k, v] of Object.entries(s)) form.elements[k].value = v;
  showFieldErrors();
  form.elements.message.focus();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  const data = Object.fromEntries(new FormData(form).entries());
  const errs = clientCheck(data);
  showFieldErrors(errs);
  if (Object.keys(errs).length) return;

  btn.disabled = true;
  btn.textContent = 'Running…';
  $('#result').hidden = true;
  resetRoute();
  const anim = runWaitingAnimation();

  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({ ok: false, error: 'The server sent an unreadable response.' }));
    await anim;
    if (!res.ok || !body.ok) {
      ticking = false;
      resetRoute();
      routeStatus.textContent = 'The pipeline stopped before scoring.';
      if (body.fields) showFieldErrors(body.fields);
      msg.textContent = body.error || `Request failed (${res.status}).`;
      return;
    }
    if (body.mode === 'demo') showDemoNote();
    await playActions(body.actions || []);
    renderResult(body);
  } catch (err) {
    ticking = false;
    resetRoute();
    routeStatus.textContent = 'Waiting for a lead.';
    msg.textContent = 'Could not reach the server. Check your connection and run it again.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run the pipeline';
  }
});

// ---------- result ----------
const TIER_LABEL = { hot: 'Hot lead', warm: 'Warm lead', cold: 'Cold lead' };
const INTENT_LABEL = {
  new_project: 'New project', consultation: 'Consultation', support: 'Support', partnership: 'Partnership',
  job_application: 'Job application', spam: 'Spam', other: 'Other',
};

function list(el, items, empty) {
  el.replaceChildren(...(items.length ? items : [empty]).map((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  }));
}

function renderResult({ lead, qualification: q, mode, actions = [] }) {
  const section = $('#result');
  const scoreEl = $('#score');
  scoreEl.dataset.tier = q.tier;
  $('#tier-label').textContent = TIER_LABEL[q.tier] || q.tier;
  $('#summary').textContent = q.summary;
  $('#action').textContent = q.recommended_action;

  const facts = $('#facts');
  const rows = [
    ['Intent', INTENT_LABEL[q.intent] || q.intent],
    ['Industry', q.industry],
    ['AI score', `${q.ai_score} / 100`],
    ['Rules score', `${q.rule_score} / 100`],
  ];
  facts.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  list($('#signals'), q.signals || [], 'No rule-based signals');
  list($('#ideas'), q.automation_ideas || [], 'None suggested');
  list($('#pains'), q.pain_points || [], 'None identified');
  $('#email-subject').textContent = q.reply_subject;
  $('#email-body').textContent = q.reply_body;
  const crm = (actions.find((x) => x.step === 'crm') || {}).status;
  const stored = mode === 'demo' ? ' (demo, not stored)' : crm === 'done' ? ' saved to the CRM sheet' : ' could not be saved to the CRM sheet';
  $('#lead-id').textContent = `Lead ${lead.id}${stored}.`;

  section.hidden = false;
  const arc = $('#score-arc');
  const num = $('#score-num');
  const C = 326.7;
  arc.style.strokeDashoffset = C;
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = C * (1 - q.score / 100); }));
  if (reduced) num.textContent = q.score;
  else {
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      num.textContent = Math.round(q.score * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  $('#result-title').setAttribute('tabindex', '-1');
  $('#result-title').focus({ preventScroll: true });
}
