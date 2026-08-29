# Handoff.ai "AI Teammate" Analysis + Jarvis Deep-Integration Spec

Companion doc to `buildertrend-parity-gap-analysis-and-ai-features-spec.md` (Part C of that doc already specced the AI Employees Hub — Conversation/Message/AgentTask models, the roster/Team Channel UI, the message→task→action pipeline). That work already shipped a real Jarvis: a standalone chat page at `/jarvis`, live and working as of 2026-08-29 (dashboard verification confirmed it loads and responds: "Ask Jarvis to look up a job, draft a change order, log a note, or queue an invoice or proposal to send — it can't send anything client-facing without your confirmation first.").

This doc answers a narrower question Damien asked directly: go look at how Handoff.ai's own AI ("Handy"/"AI Agent"/"AI Teammate" — Handoff uses several names for the same thing across their marketing site) is woven into their product, and figure out what "completely intertwined into the app" actually requires, beyond the chat-hub-with-a-nav-icon shape Jarvis has today. Written from a live browse of handoff.ai on 2026-08-29, not from memory or the earlier Part B research (which only covered their estimating flow specifically).

> **Editor's note (added when this doc was committed to the repo):** Part C's "AgentTask" model, the multi-agent roster (Heather/Duke/Hank/Vince/Neil as chat personas), and a "Team Channel" UI do not exist in this codebase — they appear to describe a planning document that was never actually written here. What *does* exist and plays the equivalent role: `JarvisConversation` / `JarvisMessage` / `JarvisPendingAction` (`prisma/schema.prisma`), the confirm-gated tool-calling loop in `src/lib/jarvis/{assistant,service,tools,pending-actions}.ts`, and the AI estimate-drafting pipeline in `src/lib/ai/estimate-assistant.ts` + `src/lib/ai/estimate-draft.ts` (referred to below as "Part B's `AIEstimateSession` pipeline" — the real equivalent is `draftEstimateFromNotes`). The names Duke/Heather/Hank/Vince/Neil that appear elsewhere in this codebase's history refer to per-persona *agent-facing API surfaces* (`/api/v1/...` scopes), not separate chat UIs. This phase is scoped against what's actually here, not the doc's assumed shape.

## Part 1 — What Handoff's AI actually does (live findings, 2026-08-29)

Handoff doesn't badge this feature as a single product — the marketing site calls it "AI Teammate," "AI Agent," and "Handoff AI" interchangeably depending on the page, and it's the same underlying assistant every time. Eight concrete patterns, each confirmed from a specific page:

1. **It's a persistent, always-reachable panel, not a page you navigate to.** The homepage's own in-app screenshot shows a slim left icon rail inside the product itself — "Ask AI" is the top icon (with a sparkle glyph), above "Projects" and "Invoices." It's docked chrome, available from wherever you are in the app, the same way a help button or search icon would be — not a nav item that takes you away from what you're doing.
2. **It executes real actions, not just chats.** From the AI Agent page directly: "Ask Handoff AI to send your invoices, create project scopes, update your CRM, and do much more." Onboarding copy literally tells the user to just ask it what it can do rather than learn a command syntax: "Simply open our app and ask Handoff AI teammate what it can do. Handoff will offer to generate invoices, update customer records, create estimates, change orders, and answer your general question."
3. **It's grounded in whatever files you hand it.** "Simply upload construction drawings, scopes of work, client notes, photos, videos or any other files relevant to your project. Handoff will analyze your files and provide detailed information about what you've uploaded. Ask away." This is the same mechanism that powers their estimating flow (upload a photo/plan/scope → AI extraction — already covered in Part B) but framed here as a general capability of the assistant itself, not a one-off feature of the Estimate builder.
4. **It has persistent, long-horizon memory.** "And it remembers what you told it yesterday, last week, or on the last job — so you're never starting from scratch." Not session memory — cross-session, cross-project memory scoped to the business.
5. **It chains multiple actions in one instruction.** "Using Handoff AI is like having a virtual teammate available at your fingertips 24/7. Handoff can perform multiple actions without skipping a beat." — explicitly marketed as multi-step, not single-tool-call.
6. **It enforces the org's own rules automatically, so output is always consistent without the user re-checking it.** From the AI Teammate page: "Set your rules once. Handoff applies them automatically across every estimate, proposal, and change order." The pitch is explicitly "stop double-checking every estimate your team sends" — the AI is trusted to apply markup rules and templates correctly every time, because those rules are stored data the AI reads, not something re-explained in every prompt.
7. **It's embedded per-module as a "first draft" step, not only as a generic chatbot.** Two concrete examples, each its own marketing page: AI Site Walkthrough — "Handoff turns your job site photos into accurate, professional estimates with an AI Teammate trained to your business. Document every detail in one connected space." AI Daily Logs — "Snap a photo. Add a note. Your AI Teammate logs the day, pulls in weather automatically, and keeps a clean record... AI Daily Logs capture it as you go, right there on site. Your AI Teammate does most of the work. Not you, at 10 PM, trying to piece it together." In both cases the pattern is identical: a human does the minimum physical input (snap a photo, jot a note), and the AI turns that into the structured record — not "open a chat and describe what happened."
8. **It's exposed externally too** — a dedicated "MCP Connection" feature page and a Zapier-based "AI Connected Workflows" page exist, meaning Handoff deliberately lets other tools/agents call into its AI teammate rather than keeping it walled inside their own UI.

None of this is a fundamentally different architecture from what Part C already specced (message → task → action, with an approval gate on anything sensitive) — it's the same shape. What Handoff does differently is where the entry points live and how much typing a human has to do before the AI is useful. That's the actual gap.

## Part 2 — Where Jarvis is today (live-checked 2026-08-29)

* Reached via a sparkle icon in the top nav → lands on a standalone `/jarvis` page, not a docked panel. Leaving that page loses the assistant entirely until you navigate back.
* The page is a classic chat-app shell: a conversation list sidebar ("+ New chat" / "No conversations yet") and a single composer ("Ask Jarvis anything...").
* The placeholder copy already describes real action capability — "Ask Jarvis to look up a job, draft a change order, log a note, or queue an invoice or proposal to send — it can't send anything client-facing without your confirmation first" — consistent with Part C's message→task→action pipeline and its hard approval gate on sensitive actions. Good: this means the backend contract (`AgentTask`, `requiresApprovalFrom`, `structuredActions`) is presumably already there or close to it; this doc does not need to redesign that part.
* What wasn't visible in this check: a roster view of the other five agents (Heather, Duke, Hank, Vince, Neil), a Team Channel, or an agent profile page — Part C.2 specced all three. Whichever session picks up the prompt below should check current state first rather than assume any of those three are missing or present.
* No page anywhere else in the app (a job's Overview, a Daily Log entry, an Estimate, a Change Order) has any AI entry point on it. Getting Jarvis to do something today means leaving the page you're on, going to `/jarvis`, and typing out which job/record you mean by hand — Jarvis has no idea what you were just looking at.

That last point is the whole gap. Handoff's AI isn't more capable in the abstract — Jarvis already has the harder infrastructure (multi-agent roster, task pipeline, approval gates, webhook plumbing). Handoff's AI is just closer to the work at every moment: docked instead of a destination, context-aware instead of context-blind, and wired into specific record types as a first-draft generator instead of only a general-purpose chat partner.

## Part 3 — What "completely intertwined" means, concretely

Five changes, each mapped to a Handoff pattern from Part 1, each additive to the existing Part C architecture (no rip-and-replace):

### 3.1 Global docked launcher (Handoff pattern #1)

Replace "click the sparkle icon, navigate to `/jarvis`" with a persistent floating launcher (bottom-right, like the Intercom-style widget visible on Handoff's own marketing site, or a slide-out panel anchored to the existing sparkle icon) available on every authenticated route — job pages, lists, settings, everywhere. Opening it slides in a chat panel over the current page rather than navigating away; closing it returns you exactly where you were. The full `/jarvis` page can still exist for conversation history/search, but it should stop being the only way in.

### 3.2 Automatic context injection (Handoff pattern #2 + the core gap from Part 2)

Every time the launcher opens, it silently attaches a `context` object describing the current route: `{ page: "job_detail", jobId, jobName, visibleTab }` on a job page, `{ page: "estimate_builder", estimateId, jobId }` on an Estimate, `{ page: "daily_log_form", jobId, draftLogId }` on a Daily Log entry form, and so on. This gets passed alongside the user's message so "draft a change order for this" or "log what I just described for this job" resolves without the user having to say which job/record they mean — mirroring Handoff's memory pitch ("never starting from scratch") but scoped to what's currently on screen, which is the more immediate version of that same idea. Store it on the `Message` (or `Conversation`) row so the action-card audit trail also shows what page a given request was made from.

### 3.3 Per-module "AI draft" entry points (Handoff pattern #7 — the highest-leverage change)

This is the one that actually earns the word "intertwined." Instead of routing every AI interaction through the chat panel, put a small "Draft with AI" / "Ask Jarvis" affordance directly inside specific record-creation UIs, matching Handoff's Daily Log and Site Walkthrough pattern of "human gives minimal input, AI produces the structured draft":

* **Daily Log form**: an upload-photo-and-jot-a-note flow where Jarvis drafts the structured log entry (title, description, weather auto-fill — WCI already does weather auto-fill per the existing `DailyLog` import work) from the photo + note, and the human reviews/edits before saving. Reuses the existing `DailyLog` model; no new table needed, just a Jarvis-assisted creation path alongside the existing manual form.
* **Change Order / Estimate line items**: a "describe what changed, let Jarvis draft the line items" entry point feeding the existing Estimate/EstimateLineItem and ChangeOrder models — this is explicitly the same mechanism as the already-specced Part B AI Estimating flow (`AIEstimateSession`), so Part B's pipeline should be the one reused/extended here rather than building a second parallel drafting mechanism.
* **Proposal follow-ups / lead correspondence**: a "draft a follow-up" button on a Lead or Opportunity that opens Jarvis pre-filled with that lead's context, mirroring Handoff's "capture walkthrough details automatically and respond same-day" pitch.

Each of these is UI wiring, not new AI infrastructure — they all funnel into the same message→task→action pipeline Part C already built, just launched from inline buttons with pre-filled context instead of requiring the user to open Jarvis cold and describe everything by hand.

### 3.4 File-grounded Q&A as a standing capability, not a one-off (Handoff pattern #3)

Handoff frames "upload a file, ask questions about it" as a general assistant capability available any time, not something bolted only onto estimating. Jarvis should accept file attachments directly in the chat panel/launcher (photos, PDFs, drawings) and answer questions grounded in them using the same vision-capable extraction Part B already specs for `AIEstimateSession` — the model call pattern is identical, this just exposes it as a first-class Jarvis capability rather than something only reachable through the Estimate flow.

### 3.5 Discoverability + consistency (Handoff patterns #2 and #6)

* **Self-describing onboarding**: an empty Jarvis conversation should proactively suggest what it can do ("Ask me to look up a job, draft a change order, log today's site visit, or queue an invoice") rather than showing a bare empty state — Handoff explicitly tells users to just ask what the AI can do, and backs that with the AI actually answering well.
* **Stored org rules for consistency**: Handoff's "set your rules once, applied automatically" pitch maps directly onto WCI's existing markup-rate/cost-catalog data — Jarvis-drafted Estimates/Change Orders/Proposals should already be reading the org's real markup rules and CostCode catalog (Part B.2 step 3 already specs "prompted with the org's actual CostCode catalog, to extract... and map them to real CostCodes" — this just needs to be true for every Jarvis-drafted financial document, not only ones that went through the dedicated AI Estimating flow).

### 3.6 What NOT to build

* Don't build a second memory/context system parallel to the existing `Conversation`/`Message` models — `context` is a field on those, not a new subsystem.
* Don't build a second file-analysis pipeline — reuse Part B's Claude-vision extraction call pattern for the general Q&A case in 3.4 rather than inventing a new one.
* Don't wire "Draft with AI" buttons into every module in one pass — Daily Logs and Change Orders/Estimates are the two highest-value, lowest-risk starting points (matching Handoff's own most-marketed features); expand to Proposals/RFIs/Submittals once those two are proven out.
* Don't build an MCP server or Zapier-style external connector for Jarvis in this phase (Handoff pattern #8) — that's a real capability worth having eventually, but it's a distinct, externally-facing surface with its own auth/security surface, and nothing about "intertwined into the app" requires it. Flag it as a future phase, not part of this one.

## Sources

* [Handoff — homepage](https://www.handoff.ai/) — "Meet the AI Teammate Built for Residential Construction"; in-app screenshot showing the docked "Ask AI" icon.
* [Handoff — AI Teammate (Solutions)](https://www.handoff.ai/ai-teammate) — "Set your rules once. Handoff applies them automatically across every estimate, proposal, and change order."
* [Handoff — AI Agent](https://www.handoff.ai/ai-agent) — "Ask Handoff AI to send your invoices, create project scopes, update your CRM"; file upload Q&A; multi-action chaining; persistent memory ("remembers what you told it yesterday, last week, or on the last job").
* [Handoff — AI Site Walkthrough](https://www.handoff.ai/ai-site-walkthrough) — photo-to-estimate pattern.
* [Handoff — AI Daily Logs](https://www.handoff.ai/daily-logs) — photo+note-to-structured-log pattern, auto-weather.
* [Handoff — AI Connected Workflows (Zapier)](https://www.handoff.ai/zapier-integration) and MCP Connection (`/mcp-connection`, linked from the site footer) — external-agent connectivity, flagged as a future phase, not part of this one.
* Prior research already in the project: `buildertrend-parity-gap-analysis-and-ai-features-spec.md` (Part B: AI Estimating Platform; Part C: AI Employees Hub — the architecture this doc builds on top of), `deployment-status.md` item 10 (2026-08-29 live verification: Jarvis confirmed working).
* Live verification pass against the deployed WCI OS app (idyllic-faun-929087.netlify.app/jarvis), performed directly with browser automation on August 29 2026.
