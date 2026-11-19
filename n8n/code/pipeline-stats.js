// n8n Code node: "Pipeline stats" (Run once for all items)
// Turns the raw CRM rows into the numbers the morning briefing needs.

const DAY = 24 * 3600 * 1000;
const now = Date.now();
const rows = $input.all().map((i) => i.json).filter((r) => r && r.lead_id);

const ts = (r) => Date.parse(r.received_at) || 0;
const last24 = rows.filter((r) => now - ts(r) < DAY);
const last7 = rows.filter((r) => now - ts(r) < 7 * DAY);
const byTier = (list) => ({
  hot: list.filter((r) => r.tier === 'hot').length,
  warm: list.filter((r) => r.tier === 'warm').length,
  cold: list.filter((r) => r.tier === 'cold').length,
});
const avg = (list) => (list.length ? Math.round(list.reduce((s, r) => s + (Number(r.score) || 0), 0) / list.length) : 0);
const open = (r) => !r.status || r.status === 'new';

const callFirst = rows
  .filter((r) => r.tier === 'hot' && open(r))
  .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
  .slice(0, 5)
  .map((r) => ({ name: r.name, company: r.company, score: Number(r.score), summary: r.summary, age_hours: Math.round((now - ts(r)) / 3600000) }));

const stale = rows.filter((r) => r.tier !== 'cold' && open(r) && now - ts(r) > 2 * DAY).length;

const industries = {};
last7.forEach((r) => { const k = r.industry || 'Unknown'; industries[k] = (industries[k] || 0) + 1; });
const topIndustries = Object.entries(industries).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`);

return [{
  json: {
    stats: {
      total_leads: rows.length,
      new_last_24h: last24.length,
      new_last_7d: last7.length,
      tiers_last_7d: byTier(last7),
      avg_score_last_7d: avg(last7),
      hot_leads_not_contacted: callFirst,
      warm_or_hot_waiting_over_48h: stale,
      top_industries_last_7d: topIndustries,
    },
  },
}];
