# Sakhi — What Was Built

A record of the work done on top of the original build, in the order it
happened, with what was measured rather than what was intended.

`README.md` describes the app **as it is now**. This file describes **what
changed and why** — including the things that were found broken along the way.

**Status:** nothing is committed. All of this is in the working tree for review.

---

## At a glance

| # | Work | State |
| --- | --- | --- |
| 0 | Secrets exposed in a public repo | **Fixed in-tree — keys still need rotating** |
| 1 | App connections over MCP | Built and verified end-to-end |
| 2 | UI visibility audit, light + dark | 3 real bugs found and fixed |
| 3 | Supervisor + specialist agents | Built, measured on a live model |
| 4 | Observe → Verify → Recover | Built, 7/7 tests |
| — | Five incidental bugs found while reading | Fixed |

**11 new files, 16 modified.** Both halves typecheck clean; the production
build passes.

---

## 0. The security problem (found first, still not finished)

`.gitignore` contained one line: `node_modules`. That meant these were tracked
and **pushed to a public GitHub repository** in commit `b636ce6`:

```
server/.env
server/.data/keys.vault        ← your encrypted API keys
server/.data/.seed             ← the key that decrypts them
server/prisma/.data/*.db
```

The vault and its seed were published together, which makes the encryption
worth nothing. Repo visibility was confirmed public (HTTP 200 on the public
API), and the commit confirmed present on `origin/main`.

**Done:** a real `.gitignore`; all four untracked with `git rm --cached` (local
files untouched); `dist/` untracked too.

**Not done, and yours to decide:**

1. **Rotate the exposed keys** — Gemini `AQ.Ab8…KavA` and OpenRouter
   `sk-or-…0ceb`, both confirmed live in the vault. Untracking does not remove
   them from history.
2. Purge history (`git filter-repo`) or make the repo private, then force-push.

I did not rewrite history or touch the remote — both are destructive and
outward-facing.

---

## 1. Connecting apps (MCP)

**The ask:** connect an app, have Sakhi work out what it can do, then act on it
by voice or chat.

Built on the **Model Context Protocol** — the standard Claude itself uses — so
the app describes its own actions and nothing app-specific is hardcoded.

```
connect  →  ask the app what it can do  →  its answer becomes Sakhi's tools
```

**New:** `server/src/mcp/{types,catalog,connection,manager}.ts`,
`src/components/Connections/`
**Changed:** `keystore.ts` (encrypted secrets vault), `tools/registry.ts`
(dynamic tools), `routes/index.ts` (7 endpoints), `openaiCompatible.ts`
(connected apps in the system prompt)

### Verified, not assumed

```
9 built-in tools
→ connected a real app
→ it described 14 actions
→ model's toolset: 9 → 23
→ invoked one through the normal gated path      ✓
→ restarted the server → auto-reconnected        ✓
→ removed it → back to 9                         ✓
```

Permissions come from the app's **own annotations**: of those 14, the 11
read-only ones run silently while `write_file`, `edit_file` and `move_file`
ask. An action that is *unlabelled* is treated as destructive — unknown
resolves to the safer side.

### The catalogue was checked against reality

Every entry was verified against the live npm registry rather than written from
memory. That mattered:

| Connector | Finding |
| --- | --- |
| filesystem, memory, everything, sequential-thinking | active |
| github, slack, postgres, puppeteer, brave-search | **deprecated** |

The deprecated ones moved to vendor-run remote servers, so the catalogue points
at those instead — GitHub, Notion and Sentry endpoints each confirmed live
(401 = exists, needs auth). A stale catalogue of `npx` commands that 404 would
have looked fine in code review and failed on first use.

**Credentials** go in the encrypted vault, never the JSON config; are injected
only at spawn; and are deleted with the connection. Connector subprocesses get
a **scoped** environment, so one connector cannot read another's token.

---

## 2. UI visibility, light and dark

Grep was not enough here. I built a contrast auditor that drives the real app
in Playwright, walks every visible text node, and computes the **painted**
contrast after cascade and inheritance.

That was the right call — grep produced three confident findings that were all
wrong: `.response-body-text` and `.chat-ai-text-content` are not rendered
anywhere (dead CSS), and `.as-code` sits on a `#171717` ground so its light
text is correct in both themes.

### Three real bugs, all light-theme

**1. The entire Settings modal was invisible — 1.03:1.**
The light-theme override targeted `.settings-modal`. No element has ever
carried that class; the card is `.settings-modal-card`. The rule was dead from
the day it was written, so the panel kept its dark background while the text
went near-black. Dark text on a dark panel.

**2. `--text-faint` failed WCAG AA at 2.60:1** (needs 4.5). Twenty-two nodes in
Planner alone — day headers, empty states, captions. A **global** token, so it
was quietly degrading every view. The whole ramp was retuned by measurement:

| Token | Before | After |
| --- | --- | --- |
| `--text-muted` | 4.83:1 | **6.1:1** |
| `--text-faint` | **2.60:1** | **4.5:1** |

**3. The "today" pink was 2.95:1 on white.** The one thing the eye should find
first was the hardest thing on the page to see. One value cannot serve both
grounds, so it is now theme-aware: `#EC6A9C` dark, `#C93B72` light.

Also found: **two `:root[data-theme='light']` blocks** defining the same 60
tokens, the later silently winning. Both are now in step and commented, so
editing the first no longer looks like a no-op.

### Result

**0 low-contrast text nodes and 0 invisible controls** across Home, Projects,
Planner, Settings and Connections — in both themes.

One fix to my own work: the Connections panel rendered an empty catalogue when
the backend was down, with no explanation. "You have no apps" and "I can't see
your apps" should not look identical.

---

## 3. Supervisor + specialist agents

**The finding that shaped this:** `selectAgent()` was cosmetic. It was called
twice — once to emit `agent.selected`, once to log it — and **nothing branched
on the result.** Every request ran the same generalist loop. So this was
net-new, not a refactor.

**New:** `server/src/agents/{types,registry,specialist,supervisor}.ts`
**Changed:** `planner/planner.ts` now handles per-turn setup and hands off; the
agentic loop moved to `specialist.ts` and runs once per agent.

### An agent is a scope, not a personality

What makes the Browser agent a browser agent is that it can drive a browser and
**cannot delete your files**. Seven specialists, each with a deliberately
narrow tool list.

### The topology is enforced by the types

`AgentTask` and `AgentResult` contain no field naming another agent. A loop
like A→B→C→A is not discouraged — it **cannot be expressed**. One agent's
finding reaches another only as `context` the Supervisor chose to pass on.

### Measured on a live model

| Request | Route | Time |
| --- | --- | --- |
| "What's the capital of Japan?" | fast path, no planning, no tools | **2.0s** |
| "Check my battery level." | Planning → Desktop → `terminal` | 4.4s |
| "Node LTS vs. mine?" | Planning → Research → Desktop → composed | 13.3s |

The multi-agent answer: *"LTS is 24.11.0, installed is v24.12.0. They do not
match."* — research's finding passed through the Supervisor to desktop, then
composed honestly.

Two things tuned **after** measuring, not before:

- a duplicated `Understanding Request` stage, emitted by both layers
- the generalist ran a web search before answering "Tokyo" — reversing that
  default took the fast path from **5.6s to 2.0s**

The composer is given each agent's **status**, not just its prose, and told to
report failed as failed. A composer handed only prose narrates a clean success
regardless of what happened.

---

## 4. Observe → Verify → Recover

The loop lives in `invoke()` — the one gated path every tool already ran
through — so it covers built-in tools and connected-app actions alike, with no
per-agent changes.

**New:** `server/src/tools/verify.ts`
**Changed:** `tools/registry.ts` (`verify` + `recoveries` on a tool)

### The rule that makes it worth having

**A verifier never reads the tool's own report.** It goes and looks.

`start chrome` exits 0 immediately whether or not Chrome ever appears. "The
launcher returned" and "the app is running" are different claims, and the model
was treating them as one.

| Action | Independently observed via |
| --- | --- |
| Launch app | the process table, polled until it appears |
| Copy text | the clipboard, read back and compared |
| Write file | `stat` on disk, and that it isn't empty |
| Move file | the **destination** — checking the source would pass for a move that did nothing |
| Open page | the final hostname, catching redirects to login/error pages |

When verification fails a recovery runs, is announced, and is re-verified. If
it still cannot be confirmed the tool is reported **failed even though `run()`
resolved**, with an explicit instruction to the model not to claim success.

### Tests — 7/7

```
an app that is not running is NOT verified   — No process matching Spotify.exe after 6s
explorer.exe IS verified                     — explorer.exe is running
a file never written is NOT verified         — does not exist
a copy that did not happen is NOT verified   — holds 15143 chars, expected 37
invoke() reports success:false despite run() resolving      ← the whole point
result is marked unverified
terminal (no verifier) still succeeds normally              ← no regression
```

End-to-end through the real gated path: launching notepad emitted *"Checking it
actually worked…"* then returned `verified: true, observed: "notepad.exe is
running."`

### Two deliberate calls

Both exist so the feature does not become its own failure mode:

- the launch verifier **polls for 6s** rather than checking once — an impatient
  verifier triggers recovery and opens a second window
- a verifier that **throws counts as verified** — better than telling you an app
  didn't open while it is on screen in front of you

---

## Incidental bugs found while reading

None of these were the task; all were fixed.

| Where | Bug |
| --- | --- |
| `desktop.ts` | `profile` sat **outside** `properties` in the schema, so the model never saw the parameter — Chrome kept opening without a profile, defeating the `list_profiles` feature |
| `apps.ts` | "Open in VS Code" broke for anyone without `code` on PATH: the fallback path contains spaces and `shell: true` re-split it |
| `apps.ts` | A `'run'` action declared in the type but never implemented or advertised |
| `index.css` | Two competing light-theme blocks (above) |
| `App.tsx` | `SYSTEM_PROCESSES` — fabricated telemetry ("Vite Dev Server 11.2%"). Dead code, never rendered; left in place and flagged |

---

## What is still open

Stated plainly so nobody plans around it.

**Next in the agreed order:**

- **User Model / personality** — preferences carry no confidence score
- **Preference confidence + learning**
- **Mood as a soft signal** — tone only, never permissions
- **Autonomy levels** — Manual / Assisted / Autonomous / Restricted
- **Task + calendar intelligence**

**Known gaps:**

- **The rest of the automation hierarchy.** Recovery has one rung per tool —
  wait-and-recheck, retry, reload. Accessibility-tree, keyboard and vision
  fallbacks are not built. A recovery log listing strategies that cannot run
  would defeat the purpose.
- **`src/backend/`** is dead code — a stale second copy of the planner,
  provider manager and tool registry that nothing imports. It still typechecks,
  so it reads as live.
- Several Settings tabs (Voice, Agents, Automation, Appearance) render controls
  wired to nothing. Verified, not assumed.
- **The encryption seed should move to the OS keychain** before the security
  model is called finished. Encrypted-at-rest is not protection from code
  already running as you, and the code says so.

**Blocked on you:**

- **Rotate the two exposed keys.** Everything else here is an improvement;
  this one is live exposure.
- The claude.ai connectors (Gmail, Google Calendar, Google Drive) need
  authorising in your claude.ai connector settings before Sakhi's MCP layer can
  reach them — relevant to the calendar work, and it needs no new code.
