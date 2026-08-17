# Sakhi

A desktop AI assistant that runs on your own machine. It talks, listens, and
actually does things — drives a browser, manages files, launches apps, works
inside the apps you connect to it.

The design goal it is built around: **you say what you want, not how to do it.**

---

## Running it

```bash
npm run setup      # installs both halves, generates the Prisma client, creates the DB
npm run dev:all    # UI on :5173, backend on :3007
```

| Command | What it does |
| --- | --- |
| `npm run dev:all` | Both halves together (what you usually want) |
| `npm run dev` | UI only |
| `npm run dev:server` | Backend only |
| `npm start` | Electron desktop app, dev mode |
| `npm run electron:start` | Build, then run as a packaged desktop app |

Add an API key under **Settings → AI Models** — Gemini, OpenAI, Anthropic or
OpenRouter — or point it at a local Ollama / LM Studio and pay nothing.

> Acting on your computer needs a model that supports tool calling. Sakhi checks
> before every turn and tells you plainly when the chosen model can answer but
> not act, rather than letting it narrate actions it never took.

---

## How a request actually flows

```
you ask
   ↓
planner.ts        conversation, memory, project brief, provider choice
   ↓
Supervisor        decides: answer directly, or delegate — and to whom
   ↓
 ┌─ fast path ──────────────┐   ┌─ delegate ───────────────────┐
 │ conversation / knowledge │   │ one or more specialists,     │
 │ → generalist, streamed   │   │   run in order               │
 └──────────────────────────┘   └──────────────────────────────┘
                                        ↓
                                 tools, permission-gated
                                        ↓
                                 Supervisor composes the answer
   ↓
answer streams to you over the event channel
```

**The frontend never invents progress.** It posts a message and then only
listens. Every stage, tool call and token arrives over the event stream from
the backend, so what you see on screen is what actually happened.

### The Supervisor

One coordinator decides who does the work. It does not do the work itself.

Conversation takes a **fast path** with no planning call in front of it — asked
the capital of Japan, Sakhi answers in about two seconds without touching a
tool. Anything that looks like an action gets a routing decision first, then
one or more specialists.

Measured on a live model:

| You ask | What runs | Time |
| --- | --- | --- |
| "What's the capital of Japan?" | fast path, no tools | ~2s |
| "Check my battery level." | Desktop agent → `terminal` | ~4s |
| "Look up the Node LTS version and check if mine matches." | Research → Desktop → composed | ~13s |

### The specialists

An agent is a **scope**, not a personality. What makes the Browser agent a
browser agent is that it can drive a browser and cannot delete your files.

| Agent | Handles | Tools it may use |
| --- | --- | --- |
| `browser` | Web pages, forms, search, video | browser, research |
| `desktop` | Launching apps, clipboard, system checks | desktop, clipboard, terminal, apps |
| `coding` | Reading and changing code, repos, editors | filesystem, files, apps, terminal |
| `research` | Questions needing current information | research, browser |
| `memory` | Recalling and recording durable facts | memory |
| `automation` | Work inside connected apps | every connected app's actions |
| `planner` | The generalist fallback | everything |

**Agents cannot talk to each other.** The task and result types contain no
field naming another agent, so a loop like A→B→C→A isn't discouraged — it
can't be expressed. One agent's finding only reaches another as context the
Supervisor chose to pass on, which is what keeps the Supervisor the single
source of truth.

When several agents run, the one that writes the final answer is given each
agent's **status**, not just its prose, and is told to report failed as failed.
A composer handed only prose narrates a clean success regardless of what
happened.

---

## Tools

Nine built-in capabilities. Every one runs through a single gated path, so the
timeline can't have a gap and a gated tool can't slip past the prompt.

| Tool | What it does | Asks first? |
| --- | --- | --- |
| `browser` | Drives a real browser you can watch | **yes** |
| `desktop` | Launches applications | **yes** |
| `files` | Read/write inside the Sakhi workspace | **yes** |
| `filesystem` | Real file management across your home folder | **yes** |
| `terminal` | Read-only system checks (battery, disk, uptime) | no |
| `clipboard` | Read or set the clipboard | no |
| `apps` | Detects installed dev tools, read-only git | no |
| `research` | Web search and page reading | no |
| `memory` | Stores and recalls facts about you | no |

The split is deliberate. Read-only actions that change nothing on your machine
don't prompt — gating them bought no safety and cost a lot, because prompts
that fire on harmless things train you to click Allow without looking.

When you decline, the backend states it in your transcript itself rather than
leaving it to the model, which has been observed replying "copied
successfully" after being refused.

### Actions are verified, not assumed

A tool reporting success has proved that the tool returned — not that anything
happened. `start chrome` exits 0 immediately whether or not Chrome ever
appears. So anything that changes your machine is checked afterwards **against
the world, never against its own report**:

| Action | What is actually observed |
| --- | --- |
| Launching an app | the process table, polled until it appears |
| Copying text | the clipboard, read straight back and compared |
| Writing a file | the file on disk, and that it isn't empty |
| Moving a file | the **destination** — checking the source would pass for a move that did nothing |
| Opening a page | the final hostname, to catch redirects to a login or error page |

When the check fails, a recovery is tried, said out loud, and re-verified. If
it still can't be confirmed, the tool is reported as **failed even though it
returned successfully**, and the model is told in as many words not to claim it
worked.

A verifier that throws is treated as "unknown", which counts as verified — the
alternative is telling you an app didn't open while it's on screen in front of
you.

---

## Connecting apps

**Settings → Connections.**

Connect an app and Sakhi asks it what it can do. The app answers with its
actions — each with a description and an argument schema — and *that reply is
how Sakhi learns the app*. Those actions join its toolset, so from then on you
just say what you want:

> "make a GitHub issue about the login bug and link the Notion spec"

Nothing about any specific app is hardcoded. This runs on the **Model Context
Protocol**, the open standard Claude and other assistants use, so any MCP
server works — including ones written after this was built.

Built in: a local folder, GitHub, Notion, Sentry, a persistent knowledge graph,
sequential thinking, and a test connector for checking the pipeline. Anything
else connects through **Something else…** with a command or URL — the same
config you'd paste into any other MCP client.

**How much a connected app is allowed to do.** Actions it marks read-only run
silently. Anything that writes, deletes, or is *unlabelled* asks you first. An
app that doesn't describe its actions honestly gets treated as the riskier
case, not the safer one.

Connecting a local folder discovers 14 actions; 11 read-only ones run silently,
while `write_file`, `edit_file` and `move_file` ask.

---

## Memory and projects

Sakhi remembers across conversations. Preferences, likes and dislikes are
pulled ahead of general facts, because they change how an answer should be
written and not just what's in it.

A **project** is a workspace with its own memory, plus a standing brief and
knowledge documents that apply to every conversation inside it. Deleting a
project cascades to its memories — that's the point: work you've finished
shouldn't keep colouring later answers.

Memories are recorded silently while answering. Credentials are never stored.

---

## Voice

Speech runs locally: **Kokoro 82M** for synthesis, **Moonshine** offline or
**NVIDIA Parakeet** online for recognition. Audio crosses the boundary as raw
16 kHz mono float PCM rather than a container, so neither side needs a codec.

Voice and chat are two interfaces to the same session — ask by voice, follow up
by typing, and the context carries.

---

## Theming

Light and dark, driven by a single `data-theme` attribute with one writer.
"System" follows your OS and keeps following it.

The colour ramp is set by **measured contrast**, not by eye. Every text token
clears the WCAG AA 4.5:1 floor against its background in both themes, verified
by rendering the real app and computing the painted result for every visible
text node. Current state: zero low-contrast text and zero invisible controls
across every view, in both themes.

---

## Layout

```
src/                   React UI
  components/
    Chat/              composer, message list, thinking timeline
    Connections/       the app-connection panel
  SettingsView.tsx     General · AI Models · Connections · Voice · Agents ·
                       Automation · Memory · Appearance · Privacy · Developer
  PlannerView.tsx      tasks and calendar as one page
  ProjectsView.tsx     project workspaces
  theme.ts             the single writer of the theme attribute

server/src/
  agents/              Supervisor, specialists, and the contract between them
  planner/             per-turn setup: memory, project brief, provider choice
  orchestrator/        request lifecycle, cancellation, event ordering
  tools/               built-in capabilities and the one gated path they run through
  mcp/                 app connections — discovery, transport, credentials
  providers/           model backends behind one interface
  audio/               Kokoro TTS, Moonshine/Parakeet STT
  events/              the event protocol, mirrored in src/events.ts
```

The event protocol is duplicated between `server/src/events/protocol.ts` and
`src/events.ts` rather than shared. The two are separate TypeScript projects
with separate builds; the duplication is the seam. **Change one, change the
other in the same commit.**

---

## HTTP API

Backend on `:3007`. Content never comes back as an HTTP response body — the
event stream is the transport.

```
GET  /api/health                     uptime, clients, DB status
GET  /api/events                     SSE stream  (ws://…/events also available)
POST /api/chat                       returns a requestId; the answer streams
POST /api/chat/cancel                Stop really aborts the upstream fetch
POST /api/chat/permission            answers a permission.required event

GET  /api/providers                  configured models and masked key status
POST /api/providers/:id/key          stores a key, then proves it works
GET  /api/connections                connected apps + the catalogue
POST /api/connections/catalog/:id    connect from the catalogue
POST /api/connections/:id/refresh    ask an app again what it can do
GET  /api/tools                      every tool, and where it came from
GET  /api/projects · /api/system · /api/stt · /api/tts · /api/speech/status
```

---

## Security

Credentials are AES-256-GCM encrypted at rest in `server/.data/`, injected into
a connector only at launch, and deleted with the connection. They are never
returned by any route — only a masked form is.

Being honest about the threat model: this protects against disk inspection,
backups and log leakage. It does **not** protect against code already running
as you, which can read the seed. The OS keychain is the intended upgrade.

Connector subprocesses get a scoped environment, not your whole one, so a
third-party connector can't read another app's token.

> **`server/.data/` and `server/.env` hold live credentials and are gitignored.**
> Never commit them. `.seed` is the key that decrypts `keys.vault` beside it —
> publishing the pair publishes every key in it.

---

## Not built yet

Stated plainly so nobody plans around it:

- **The rest of the automation hierarchy.** Verification is in (see below), but
  recovery currently has one rung per tool — wait-and-recheck, retry, reload.
  The accessibility-tree, keyboard and vision fallbacks are not built, and
  nothing pretends otherwise.
- **Personality, mood and autonomy levels.** Preferences are stored but carry
  no confidence score, tone doesn't adapt, and there is no
  Manual/Assisted/Autonomous/Restricted setting.
- **`src/backend/`** is dead code — a stale second copy of the planner, provider
  manager and tool registry that nothing imports. It still typechecks, so it
  reads as live. Delete it or don't edit it.
- Several Settings tabs (Voice, Agents, Automation, Appearance) render controls
  that are not yet wired to the backend.
