// Pipeline page: renders /api/leads.

const rowsEl = document.getElementById('rows');
const STATUS = { new: 'New', contacted: 'Contacted', replied: 'Replied', meeting_requested: 'Meeting requested', nurture: 'Nurture', not_interested: 'Not interested' };

function cell(text, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hours = (Date.now() - d.getTime()) / 3.6e6;
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.round(hours)} h ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function state(text) {
  const tr = document.createElement('tr');
  const td = cell(text, 'dash-state');
  td.colSpan = 7;
  tr.append(td);
  rowsEl.replaceChildren(tr);
}

async function load() {
  let data;
  try {
    const r = await fetch('/api/leads');
    data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || `Request failed (${r.status})`);
  } catch (err) {
    state(`The pipeline couldn't be loaded: ${err.message.replace(/\.$/, '')}. Refresh to try again.`);
    return;
  }

  if (data.mode === 'demo') {
    const note = document.getElementById('mode-note');
    note.textContent = 'Demo mode: these are sample leads. Connect the n8n backend to show the real CRM.';
    note.hidden = false;
  }

  const leads = data.leads || [];
  const count = (t) => leads.filter((l) => l.tier === t).length;
  const totals = { hot: count('hot'), warm: count('warm'), cold: count('cold') };
  document.getElementById('t-total').textContent = leads.length;
  document.getElementById('t-hot').textContent = totals.hot;
  document.getElementById('t-warm').textContent = totals.warm;
  document.getElementById('t-cold').textContent = totals.cold;
  const bar = document.getElementById('bar');
  bar.replaceChildren(...['hot', 'warm', 'cold'].map((t) => {
    const i = document.createElement('i');
    i.className = t;
    i.style.width = leads.length ? `${(totals[t] / leads.length) * 100}%` : '0';
    return i;
  }));

  if (!leads.length) {
    state('No leads yet. Run one through the live demo and it will appear here.');
    return;
  }

  rowsEl.replaceChildren(...leads.map((l) => {
    const tr = document.createElement('tr');
    const lead = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = l.name || 'Unknown';
    lead.append(strong);
    if (l.company) {
      const span = document.createElement('div');
      span.className = 'muted';
      span.textContent = l.company;
      lead.append(span);
    }
    const tier = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `tier ${l.tier}`;
    pill.textContent = l.tier;
    tier.append(pill);
    tr.append(
      cell(when(l.received_at), 'muted'), lead, tier, cell(String(l.score), 'num'),
      cell(l.industry || ''), cell(STATUS[l.status] || l.status || 'New'), cell(l.summary || ''),
    );
    return tr;
  }));
}

load();
