# Deploying LeadPilot AI

Plan for about 60–90 minutes the first time. You'll end up with:

- the website on Vercel (free Hobby plan is enough), and
- the automation backend on n8n, connected to OpenAI, Gmail and Google Sheets.

You can do part A alone first: the site works in **demo mode** until n8n is connected.

---

## A. Put the website live (10 minutes)

1. Create a GitHub repository called `leadpilot-ai` at github.com/new (leave it empty: no README or license), then push this folder:
   ```bash
   git init && git add . && git commit -m "LeadPilot AI"
   git branch -M main
   git remote add origin https://github.com/drico999/leadpilot-ai.git
   git push -u origin main
   ```
2. Go to vercel.com → **Add New → Project** → import the repository. Framework preset: **Other**. Leave build settings empty (the `vercel.json` already sets `public/` as the output). Deploy.
3. Open the URL. You should see the demo-mode note under the headline, and the form should return a score.

## B. Run n8n

Pick one:

- **n8n Cloud.** Easiest. Sign up at n8n.io (there is a free trial; paid plans after that). Your webhook base URL looks like `https://<name>.app.n8n.cloud/`.
- **Self-host with Docker** on any small VPS (1 GB RAM is fine):
  ```bash
  cp .env.example .env      # set N8N_ENCRYPTION_KEY, N8N_HOST and WEBHOOK_URL
  docker compose up -d
  ```
  Put it behind HTTPS (Caddy, Nginx or Cloudflare Tunnel). Webhooks must be reachable from Vercel over HTTPS.

> The inbox agent polls Gmail every minute. Polls that find no mail don't create executions, but on a capped Cloud plan you may prefer every 5 minutes (open the **New email** trigger and change the poll time).

## C. Create the Google Sheet CRM

1. Create a new Google Sheet named **LeadPilot CRM**.
2. Rename the first tab to **Leads** and paste the header row from `n8n/sheets-template/Leads.csv` into row 1.
3. Add a second tab named **Inbox Log** with the header row from `n8n/sheets-template/Inbox Log.csv`.
4. Copy the sheet ID from the URL: `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`.

## D. Generate and import the workflows

1. In `.env`, set:
   ```
   OWNER_EMAIL=you@yourdomain.com
   OWNER_NAME=Andries Mokono
   SHEET_ID=<the id from step C>
   OPENAI_MODEL=gpt-4.1-mini
   ```
   Any current OpenAI chat model that supports JSON mode works; change `OPENAI_MODEL` if you prefer another.
2. Build:
   ```bash
   npm run build:workflows
   ```
3. Tip: create the four credentials in step E first. n8n then links them to the imported nodes by name.
4. In n8n: **Create workflow → ⋯ → Import from file**, once for each file in `n8n/workflows/` (1 to 5). Save each one.

## E. Connect credentials in n8n

Open **Credentials → Add credential** and create these four. Use exactly these names and n8n links them to the imported nodes automatically. If a node still shows a warning, open it and pick the credential from the list.

| Credential name | Type | What to enter |
|---|---|---|
| `OpenAI account` | OpenAI | API key from platform.openai.com (add a small spend limit) |
| `Gmail account` | Gmail OAuth2 | Sign in with Google (on self-hosted n8n you need a Google Cloud OAuth client first; see n8n's Google credentials docs) |
| `Google Sheets account` | Google Sheets OAuth2 | Same Google account |
| `LeadPilot webhook key` | Header Auth | Name: `X-LeadPilot-Key`, Value: a long random string (`openssl rand -hex 24`) |

Then set the error workflow: open workflows 1–4 → **Settings → Error workflow → LeadPilot: 5. Error alerts**.

## F. Publish and connect the website

1. Publish (activate) workflows 1, 2, 3 and 4. Workflow 5 runs only when called as an error workflow.
2. Open workflow 1's **Lead webhook** node and copy the **Production URL** (ends in `/webhook/leadpilot/lead`). Do the same for workflow 4 (`/webhook/leadpilot/leads`).
3. In Vercel → Project → **Settings → Environment Variables**, add:
   ```
   N8N_LEAD_WEBHOOK_URL   = <production URL from workflow 1>
   N8N_LEADS_WEBHOOK_URL  = <production URL from workflow 4>
   N8N_WEBHOOK_SECRET     = <same value as the Header Auth credential>
   ```
4. **Deployments → Redeploy.** The demo-mode note disappears.

## G. Test checklist

- [ ] Submit the sample lead on your site. All six route steps turn solid green.
- [ ] A new row appears in the **Leads** tab.
- [ ] A draft reply appears in Gmail **Drafts**, addressed to the lead.
- [ ] For a hot lead (try budget $5k–$20k, timeline ASAP, business email), the owner alert arrives.
- [ ] `/dashboard` shows the lead with a first name only.
- [ ] Send yourself an email from another account. Within a minute, a row appears in **Inbox Log** and, for an enquiry, a threaded draft reply.
- [ ] Run workflow 3 manually (**Execute workflow**). The briefing email arrives.
- [ ] Break something on purpose (e.g. wrong sheet name), submit a lead and confirm the error alert email.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says "Automation backend returned 403" | The header key in Vercel doesn't match the n8n Header Auth credential. |
| "Automation backend returned 404" | Workflow 1 isn't published, or you used the Test URL instead of the Production URL. |
| Route shows "Logged to CRM: failed" | Tab names must be exactly `Leads` and `Inbox Log`; check `SHEET_ID` and the Sheets credential. |
| "Read by GPT: failed" | Check the OpenAI key, billing and model name. Leads are still saved, scored on rules only. |
| Gmail steps fail on self-hosted n8n | Enable the Gmail API in your Google Cloud project and add your account as a test user. |

## Costs

Vercel Hobby and a Google account are free. OpenAI usage for this pipeline is a fraction of a US cent per lead with a mini model. n8n is free to self-host (you pay for the server) or a monthly plan on n8n Cloud.
