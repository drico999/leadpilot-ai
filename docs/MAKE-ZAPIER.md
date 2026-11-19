# Building the same pipeline in Make or Zapier

LeadPilot runs on n8n, but the design is platform-neutral. This is how the lead intake workflow maps onto the other two tools the market asks for, and where each one makes you change the design.

## Module mapping

| LeadPilot step (n8n) | Make | Zapier |
|---|---|---|
| Lead webhook (Header Auth) | Webhooks → Custom webhook, check the key with a filter on the header | Webhooks by Zapier → Catch Hook (no header auth; put the key in the payload and add a Filter step) |
| Validate lead (Code) | Tools → Set variables + Filter, or a Custom JS app | Code by Zapier (JavaScript), paste `normalizeLead` from `lib/scoring.js` |
| Qualify with GPT (JSON mode) | OpenAI → Create a Completion, response format JSON, then JSON → Parse JSON | ChatGPT → Conversation, or OpenAI → Send Prompt, then Formatter → Utilities → JSON parse via Code step |
| Parse and score (Code) | Tools → Set variable with a formula for `0.65 × ai + 0.35 × rules` | Code by Zapier |
| Append lead to CRM | Google Sheets → Add a Row | Google Sheets → Create Spreadsheet Row |
| Is hot? | Router with a filter on `tier = hot` | Paths by Zapier |
| Alert owner | Gmail → Send an Email | Gmail → Send Email |
| Draft reply | Gmail → Create a Draft | Gmail → Create Draft |
| Respond to website | Webhooks → Webhook response | Not available: Catch Hook answers immediately, so the site would poll for the result or receive it by email |
| Inbox triage agent | OpenAI → Create a Completion with tools, or Make AI Agents | Zapier Agents with Google Sheets and Gmail actions |
| Morning briefing | Scheduler + Google Sheets → Search Rows + Array aggregator | Schedule by Zapier + Google Sheets Lookup + Formatter |
| Error alerts | Scenario error handler route | Zapier's built-in error notifications |

## Trade-offs

- **Synchronous response.** n8n and Make can hold the HTTP request open and return the score to the website. Zapier can't, which is why the live route animation is built on n8n.
- **Code.** n8n and Zapier run real JavaScript, so `lib/scoring.js` ports directly. Make prefers built-in functions; the scoring formula is short enough to express that way.
- **Cost model.** Zapier bills per task (every step), Make per operation, n8n per workflow execution. A 10-step pipeline costs 10× more on Zapier than on n8n at the same volume.
- **Self-hosting.** Only n8n can run on your own server, which matters when client data must stay in-country (POPIA in South Africa, GDPR in the EU).
