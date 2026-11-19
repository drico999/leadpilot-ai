import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLead, ruleSignals, blendScore, tierFor, parseModelJson, maskEmail, firstName } from '../lib/scoring.js';

const good = {
  name: '  Thandi   Nkosi ', email: 'Thandi@KasiLogistics.co.za', company: 'Kasi Logistics', website: 'kasilogistics.co.za',
  budget: '5k-20k', timeline: 'asap', message: 'We need AI to triage 60 enquiries a week and log them in HubSpot.',
};

test('normalizeLead cleans and accepts a valid lead', () => {
  const r = normalizeLead(good);
  assert.equal(r.ok, true);
  assert.equal(r.lead.name, 'Thandi Nkosi');
  assert.equal(r.lead.email, 'thandi@kasilogistics.co.za');
  assert.equal(r.lead.website, 'https://kasilogistics.co.za');
});

test('normalizeLead reports field errors', () => {
  const r = normalizeLead({ name: 'T', email: 'nope', message: 'hi' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'message', 'name']);
});

test('normalizeLead flags honeypot submissions as spam', () => {
  const r = normalizeLead({ ...good, company_url: 'http://spam.example' });
  assert.equal(r.ok, false);
  assert.equal(r.spam, true);
});

test('normalizeLead falls back to safe enum values', () => {
  const r = normalizeLead({ ...good, budget: 'a million', timeline: 'yesterday' });
  assert.equal(r.lead.budget, 'unsure');
  assert.equal(r.lead.timeline, 'exploring');
});

test('ruleSignals rewards business email, budget, urgency', () => {
  const { lead } = normalizeLead(good);
  const s = ruleSignals(lead);
  assert.ok(s.businessEmail);
  assert.ok(s.normalized > 70);
  const free = ruleSignals({ ...lead, email: 'x@gmail.com', budget: 'unsure', timeline: 'exploring', website: '' });
  assert.equal(free.businessEmail, false);
  assert.ok(free.normalized < 20);
});

test('blendScore weights AI 65% and rules 35%, clamps input', () => {
  const { lead } = normalizeLead(good);
  const rules = ruleSignals(lead).normalized;
  const b = blendScore(80, lead);
  assert.equal(b.score, Math.round(80 * 0.65 + rules * 0.35));
  assert.equal(blendScore(500, lead).aiScore, 100);
  assert.equal(blendScore('junk', lead).aiScore, 0);
});

test('tier thresholds', () => {
  assert.equal(tierFor(70), 'hot');
  assert.equal(tierFor(69), 'warm');
  assert.equal(tierFor(45), 'warm');
  assert.equal(tierFor(44), 'cold');
});

test('parseModelJson handles fences and stray text', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Sure! {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.deepEqual(parseModelJson({ a: 3 }), { a: 3 });
  assert.throws(() => parseModelJson('no json here'));
});

test('privacy helpers', () => {
  assert.equal(maskEmail('thandi@kasi.co.za'), 't•••@kasi.co.za');
  assert.equal(maskEmail('bad'), '');
  assert.equal(firstName('  Thandi Nkosi'), 'Thandi');
});
