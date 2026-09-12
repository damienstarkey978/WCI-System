# Connecting Claude and ChatGPT to WCI OS

Live at `main@86dc55b`. Everything below is built and tested; what remains is
clicking through each product's connector UI once.

**The URL, for both:**

```
https://app.worldconstructionjax.com/api/mcp
```

That is the only thing you paste. No API key, no client ID, no secret — the
connector discovers the rest itself and then sends you to a WCI OS sign-in page to
approve it.

---

## Claude (claude.ai)

1. Settings → Connectors → **Add custom connector**
2. Paste the URL above. Leave the advanced OAuth fields empty — they are for servers
   that cannot register themselves, and ours can.
3. Claude sends you to WCI OS. Sign in as yourself if you aren't already.
4. The approval screen names Claude, lists what it will be able to do, and says whose
   account it acts as. Read it, then **Connect**.

Claude Desktop is the same URL, added under Settings → Connectors.

## ChatGPT

1. Settings → Apps → Advanced settings → turn on **Developer mode** (Pro, Plus,
   Business, Enterprise or Edu; on Business/Enterprise an admin may have to allow it
   first).
2. Add a connector with the URL above. The `/api/mcp` path matters — that exact path,
   not the bare domain. It is the single most common setup mistake.
3. Same approval screen, same **Connect**.

---

## What it can do once connected

Ask it, in plain English, to draft a proposal:

> "Draft a proposal for the Phillips Highway lead — interior repaint, about 2,400
> square feet, two coats, we're at $1.85 a foot on labour and $0.40 on materials.
> 20% markup. Include a section on timeline and one on what's not included."

It will look up the lead, pull your cost code catalog, price the line items, and
create a **draft** proposal in WCI OS under Sales. Four tools:

| Tool | What it does |
|---|---|
| `list_leads` | Finds the lead, and flags one with no email — a proposal needs one |
| `list_cost_codes` | Your real catalog; it cannot invent a code |
| `create_proposal_for_lead` | Creates the estimate and the proposal together, as a DRAFT |
| `get_proposal` | Reads one back, with its option totals |

Plus read access to jobs and every financial report, so you can ask it things like
"which jobs are running over budget" without opening the app.

## What it cannot do

It **cannot send a proposal to a client.** That tool does not exist on this
connection — not gated, not disabled, absent. Same for moving money, approving a
bill, or changing a job. An assistant drafts; a person sends.

This is the same line emailed receipts already follow: a forwarded receipt becomes a
bill sitting in the Inbox, never an approved one.

## Who it acts as

Whoever approves it. Not a shared key — your name is on everything it does, and if
someone leaves, revoking their connection doesn't disturb anyone else's.

So each person connects their own Claude or ChatGPT. Don't share one connection
around; it would file everyone's work under one name.

---

## If something goes wrong

**"Could not connect" / it never reaches an approval screen.** Almost always the URL:
it has to end in `/api/mcp`. Check that first before anything else.

**It reaches the approval screen but the connection never completes.** Tell me — I
want the exact error text. The code and token exchange are tested end to end, so a
failure there is information I don't have yet.

**"This connection request isn't valid".** The client sent something WCI OS refused,
and the screen says which. Send me the line.

**It connects but sees no tools.** That means the token carries no scopes, which
shouldn't happen through this flow. Tell me.

**You want to disconnect it.** Remove the connector in Claude or ChatGPT. To cut it
off from the WCI OS side as well, tell me and I'll revoke the grant — the tokens stop
working immediately rather than at expiry.
