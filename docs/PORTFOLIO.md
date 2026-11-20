# Portfolio copy for LeadPilot AI

Ready-to-paste text for your portfolio site, CV and LinkedIn. Replace the links once deployed.

---

## Portfolio card (short)

**LeadPilot AI: inbound lead automation**
An n8n + LangChain AI system that reads, scores, logs and answers every inbound lead in under ten seconds, with an AI agent that triages Gmail and a daily pipeline briefing.
n8n · LangChain · Groq / OpenAI API · AI Agents · Gmail · Google Sheets · Vercel · JavaScript
[Live demo](https://leadpilot-ai-lilac.vercel.app) | [Source](https://github.com/drico999/leadpilot-ai)

## Case study (long)

**The problem.** Small service businesses lose leads in the gap between "form submitted" and "someone replies". Enquiries sit in a shared inbox, nothing reaches the CRM and the best prospects wait as long as the worst.

**What I built.** Five n8n workflows that cover the lead lifecycle:

- **Lead intake.** A website form posts to a secured n8n webhook. An LLM (LangChain, GPT-OSS 120B on Groq, switchable to the OpenAI API) reads the message for intent, industry, pain points and fit, and drafts a personal reply. The workflow blends the AI score with deterministic signals (budget, timeline, business email) into one explainable 0–100 score, logs the lead to a Google Sheets CRM, saves the reply as a Gmail draft and emails the owner when a lead is hot.
- **Inbox triage agent.** An n8n AI Agent with three tools (CRM lookup, CRM update, Gmail draft) classifies incoming email, updates lead status and drafts threaded replies. It can draft but never send.
- **Morning briefing.** Every weekday the CRM is summarised into stats and an AI-written briefing listing the hot leads nobody has contacted.
- **CRM API and dashboard.** A read-only endpoint, masked for privacy, powers a public pipeline page.
- **Error alerts.** Any failure emails the failing node and a link to the execution.

**Engineering choices.**
- Human approval on every outbound email, to avoid turning a public form into a spam relay.
- Scoring rules live in one JavaScript module shared by the website, the n8n Code nodes and the test suite; workflow JSON is generated from readable sources.
- Credentials never reach the browser: a Vercel function validates input, limits bursts and calls n8n with a shared header key.
- Every non-critical step continues on error, so a lead is never lost; if the LLM is down or rate-limited the lead is scored on rules alone.
- 32 automated tests, including LLM failure, spam, HTML injection and empty-sheet cases.

**Result.** A visitor gets a scored, personalised response path in seconds; the owner gets a ready-to-send draft, a CRM row and, for hot leads, an alert, with no manual data entry.

## CV bullet points

- Built LeadPilot AI, an n8n + LangChain lead automation system: LLM qualification (Groq or OpenAI API), hybrid AI/rules scoring, Google Sheets CRM, Gmail drafts and hot-lead alerts, deployed with a Vercel front end.
- Designed an n8n AI Agent with CRM and Gmail tools that triages the inbox, updates lead status and drafts threaded replies with human approval.
- Generated n8n workflows from tested JavaScript sources (32 tests) and secured webhooks with header auth, rate limiting and PII masking.

## LinkedIn post

I built an AI automation that answers new leads before they go cold.

LeadPilot reads every enquiry from a website form, asks an AI model what the person actually wants, scores the lead (65% AI judgement, 35% hard rules like budget and timeline), logs it to a Google Sheets CRM and drafts a personal reply in Gmail. Hot leads trigger an alert. An AI agent also watches the inbox, checks the CRM and drafts replies, and every weekday morning I get a briefing of who to call first.

Built with n8n, LangChain, Groq (swappable for the OpenAI API), Gmail, Google Sheets and Vercel. Every email is a draft, so a person always approves what goes out.

Try the live demo: https://leadpilot-ai-lilac.vercel.app
Source: https://github.com/drico999/leadpilot-ai

#n8n #AIAutomation #LangChain #Groq #WorkflowAutomation #AIAgents

## DM reply to a recruiter (for the WorkAtlas post)

Hi Gurpreet, I saw your post about freelance AI Automation Specialists and would like to be considered.

I'm a software engineer in Gauteng focused on applied AI. My most recent project, LeadPilot AI, covers most of the skills you listed: n8n workflows, an AI agent with Gmail and Google Sheets tools, OpenAI API integration, CRM and lead-gen automation, and email automation.

Live demo: https://leadpilot-ai-lilac.vercel.app
Source and write-up: https://github.com/drico999/leadpilot-ai
LinkedIn: https://www.linkedin.com/in/andries-mokono

I'm available for remote, project-based work and happy to walk you through the build on a short call.

Kind regards,
Andries Mokono
