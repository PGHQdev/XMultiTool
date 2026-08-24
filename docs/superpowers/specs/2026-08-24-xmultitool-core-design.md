# XMultiTool — Platform Core Design

Date: 2026-08-24
Status: Approved
Scope: Sub-project 0 (platform core). Modules 1–3 are specified separately.

## 1. Summary

XMultiTool is an open-source MV3 browser extension for X (x.com). It is a suite of
independent tools over one shared core. The core turns X's own GraphQL traffic into
stable `Post` records, pairs each record with its rendered DOM node, and hands both to
every registered tool. Tools declare settings and return verdicts. The core owns all
DOM writes, all storage and all browser APIs.

The extension makes no network request to any host except x.com. It sends no telemetry.

## 2. Goals

- Survive X's markup and schema changes with a single-file repair.
- Let a new tool ship without an edit to the core, the manifest or the settings UI.
- Contain a failing tool so the timeline keeps working.
- Look and feel like a part of X.
- Ship to the Chrome Web Store, with a Firefox target reachable without a rewrite.

## 3. Non-goals

- No automated posting, scheduling, following, liking or DM sending. These breach the
  X Terms of Service and risk account limits. The composer in module 3 prepares content;
  a human sends it.
- No server, no account, no sync service, no telemetry.
- No use of the official X API v2. It is paid, rate-limited, and cannot see the user's
  timeline as the site does.
- No support for the legacy twitter.com host beyond the redirect X already performs.

## 4. Sub-project decomposition

| # | Sub-project | Contents | Depends on |
|---|---|---|---|
| 0 | Platform core | Shell, adapter, tool registry, storage, bus, UI surfaces, design system | — |
| 1 | Reading control | Timeline filters, keyword/account mute, ad and bait removal, chronological lock | 0 |
| 2 | Data export | Bookmarks, likes, lists, followers → JSON/CSV/Markdown; local archive and search | 0 |
| 3 | Author tools | Thread composer, drafts, hotkeys, own-post analytics | 0 |

Build order is 0, 1, 2, 3. Each sub-project gets its own spec, plan and build cycle.

## 5. Stack

- WXT (Vite) for entrypoints, MAIN-world injection, HMR and multi-target builds.
- Svelte 5, TypeScript, Tailwind, BitsUI, Phosphor icons.
- Bun as the package manager and script runner.
- `idb` for IndexedDB access.
- Vitest for unit tests, Playwright for integration tests.

Each dependency is listed because an existing option does not cover it: WXT removes the
manifest, world-injection and dual-target build work; `idb` removes IndexedDB callback
handling; BitsUI supplies accessible primitives that Tailwind alone does not.

## 6. Architecture

```
 page world (MAIN)            isolated world                 service worker
 ┌──────────────────┐        ┌────────────────────┐        ┌──────────────────┐
 │ fetch/XHR patch  │ post   │ normalize.ts       │  bus   │ settings store   │
 │ GraphQL capture  │──────▶ │ dom.ts (observer)  │◀─────▶ │ export jobs      │
 └──────────────────┘Message │ PostStore (join)   │        │ IndexedDB        │
                             │ tool registry      │        └──────────────────┘
                             │ verdict applier    │                 ▲ bus
                             └────────────────────┘                 │
                                                            ┌──────────────────┐
                                                            │ side panel /     │
                                                            │ options (Svelte) │
                                                            └──────────────────┘
```

### 6.1 Page-world script

Entry: `entrypoints/injected.ts`, `world: "MAIN"`, `run_at: "document_start"`.

It wraps `window.fetch` and `XMLHttpRequest.prototype.open`/`send`. It matches URLs of
the form `/i/api/graphql/<hash>/<OperationName>`. For an operation named in the selector
registry it clones the response body and calls `window.postMessage` with
`{ tag: "xmt", op, url, payload }`.

Constraints:

- The wrapper is read-only. It never alters a request or a response body. Response
  blocking is a capability of one future tool and is out of core scope.
- A wrapper failure must not break x.com. Every hook body is inside a try/catch that
  falls through to the original function.
- The script preserves the original function identities and `toString` behaviour where
  cheap, to avoid breaking X's own checks.

### 6.2 Content script

Entry: `entrypoints/x.content.ts`, isolated world, matches `https://x.com/*`.

It validates each message (`event.source === window`, `data.tag === "xmt"`) and passes
the payload to the normalizer.

**`normalize.ts`** walks X's instruction and entry tree and emits `Post` records. It is
tolerant: an unknown entry type is skipped and counted, never thrown past the caller.

**`dom.ts`** runs a `MutationObserver` over the timeline container. For each post cell it
reads the status permalink to get the post id, and stores `Map<postId, HTMLElement>`.

**`PostStore`** joins the two sides. A cell can render before or after its response
arrives, so both sides are buffered with a bounded LRU. A tool hook fires once, when the
record and the node are both present. A cell that never receives a record — X rendered it
from its own cache — gets a DOM-only record with the fields that can be read from markup
and `source: "dom"`. Tools must handle both sources.

### 6.3 Data model

```ts
type PostSource = 'graphql' | 'dom'

interface Post {
  id: string
  source: PostSource
  createdAt: string | null
  text: string
  lang: string | null
  author: {
    id: string | null
    handle: string
    displayName: string
    verifiedType: 'none' | 'blue' | 'business' | 'government' | null
    followedByUser: boolean | null
    followerCount: number | null
  }
  counts: { reply: number; repost: number; like: number; quote: number; view: number | null }
  media: Array<{ type: 'photo' | 'video' | 'gif'; url: string; alt: string | null }>
  links: string[]
  isPromoted: boolean
  isReply: boolean
  quotedId: string | null
  repostOfId: string | null
  raw?: unknown            // kept only while a diagnostics session is active
}
```

Every field that the DOM path cannot supply is nullable. A tool that needs a field must
check it, and may return `pass` when the data is absent.

### 6.4 Selector registry

`core/adapter/x-selectors.ts` holds every X-specific string in the project: test ids,
GraphQL operation names, JSON paths and cookie names. Nothing outside this file may
contain such a string; a lint rule enforces this.

Each selector carries an id and an expectation. A health check reports a selector that
matches nothing for 10 seconds while the relevant route is open. The result appears in
Settings → Diagnostics and marks affected tools "degraded".

### 6.5 Tool registry

```ts
type Verdict =
  | { action: 'pass' }
  | { action: 'hide'; reason: string }
  | { action: 'dim'; reason: string }
  | { action: 'badge'; reason: string; label: string }

interface Tool<S = unknown> {
  id: string
  name: string
  description: string
  module: 'core' | 'reading' | 'export' | 'author'
  settings: Schema<S>
  permissions?: string[]
  onInit?(ctx: ToolCtx<S>): void | Promise<void>
  onPost?(post: Post, node: HTMLElement, ctx: ToolCtx<S>): Verdict | void
  onRoute?(route: Route, ctx: ToolCtx<S>): void
  onCommand?(cmd: Command, ctx: ToolCtx<S>): void
}

interface ToolCtx<S> {
  settings: S                     // live snapshot, replaced on change
  storage: ToolStorage            // namespaced by tool id
  log: Logger                     // local diagnostics buffer
  bus: Bus                        // typed messaging to the worker
}
```

Supporting types:

- `Schema<S>` is a small declarative description of a settings object: one entry per
  field with a type (`boolean`, `number`, `string`, `enum`, `string[]`), a default, a
  label and a help string. It is hand-rolled in `core/settings/schema.ts`. A validation
  library is not added, because the schema also has to render controls, and no library
  covers both jobs.
- `Route` is the parsed x.com location: `{ kind: 'home' | 'profile' | 'post' | 'search'
  | 'bookmarks' | 'list' | 'other', params }`.
- `Command` is a user action sent from the side panel to a tool:
  `{ id: string; payload?: unknown }`.

Rules:

1. **The core owns the DOM.** A tool returns a verdict. It never calls `remove`, never
   sets a style, never adds a class. The core merges verdicts from all tools for a post,
   applies one class and one `data-xmt-reason` attribute, and re-applies them when X
   re-renders the node. `hide` beats `dim` beats `badge` beats `pass`. The reason string
   powers the "why was this hidden" badge at no extra cost.
2. **A tool is contained.** Every hook call is wrapped. Three throws in a session disable
   the tool, and the side panel names the tool and the error.
3. **The settings schema is the source of truth.** It generates the storage defaults, the
   side-panel controls, and the config export. A tool ships its UI without an edit to the
   options page.
4. **Optional permissions.** A tool that needs a permission beyond the base manifest
   declares it. The core requests it with `chrome.permissions.request` when the user
   enables the tool, and disables the tool if the user declines.

Tools run in registration order. Verdict merging is order-independent apart from the
precedence above.

The core ships one tool of its own, `core:diagnostics`, which proves the registry and
gives the health readout.

## 7. Storage

| Data | Store | Notes |
|---|---|---|
| Settings, tool state, rules | `chrome.storage.local` | Versioned. `migrations/NNN.ts` runs on version change |
| Archive: posts, bookmarks, followers | IndexedDB (`idb`) | Indexed by id, author, date |
| Per-tab runtime counters | Service-worker memory | Disposable |

`chrome.storage.sync` is not the primary store: its 8 KB per-item limit cannot hold rule
lists. Portability comes from an explicit config export and import as a JSON file. That
file also carries shareable filter rules.

Export jobs run in the service worker. Each job checkpoints its cursor to IndexedDB after
each page, so an MV3 worker shutdown costs one page. A `chrome.alarms` tick resumes an
interrupted job. Quota exhaustion stops the job and reports the number of stored records.

## 8. Messaging

`core/bus.ts` wraps `chrome.runtime` with typed request/response and typed events.
Settings live in the worker. A content script receives a snapshot at init and a broadcast
on change, so no hook reads storage during timeline processing.

## 9. UI surfaces

One Svelte 5 app, two entrypoints, shared routes. The side panel (`chrome.sidePanel`) is
primary. `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` makes the toolbar
icon open it, so there is no popup. The options page renders the same routes at full
width for the archive tables.

| Route | Contents | Module |
|---|---|---|
| Status | This tab: posts seen, posts hidden, and the tool that hid each one | 0 |
| Tools | Tools grouped by module. Toggle plus settings rendered from the schema | 0 |
| Archive | Export jobs, progress, local search | 2 |
| Compose | Drafts and thread composer | 3 |
| Settings | Theme, config import/export, diagnostics, selector health | 0 |

In-page additions are limited to two, both owned by module 1: the reason badge on a
hidden post, and a "mute this" entry in the post's own menu.

`core/browser.ts` wraps the APIs that differ across targets: side panel against Firefox's
`sidebar_action`, and MAIN-world injection.

## 10. Design language

The extension must read as a part of X.

`core/ui/tokens.css` defines three themes that mirror X's own: Default, Dim, Lights out.
The content script reads X's theme from the page — the `night_mode` cookie, with the
rendered background colour as the fallback — and the panel follows it. If detection
fails, the panel follows the system theme.

- Surfaces: white, `#15202B` dim, pure black. Hairline borders at low contrast. No
  shadows and no elevated cards.
- Accent: X blue, for primary actions only.
- Type: 15 px base, 13 px secondary, weight 700 for names and headings. X's Chirp font is
  proprietary and cannot ship, so the stack falls back to the same system fonts X uses.
- Shape: pill buttons at `9999px`. Full-bleed rows with a hover tint.
- Density: rows, dividers and a left icon rail, matching X's navigation and settings.
- Motion: 120 ms fades only.

Injected elements inherit from X's computed styles rather than from the token file, so a
redesign carries them along.

## 11. Error handling

| Failure | Detection | Response |
|---|---|---|
| X changed markup or schema | Selector health check; normalizer counts unknown entry types | Degrade to the DOM-only path, mark tools "degraded", record the shape in local diagnostics |
| A tool throws | Try/catch on every hook | Disable after 3 throws in a session, name the tool in the panel |
| Storage or job failure | Job checkpoints; quota errors | Resume from cursor; on quota exhaustion stop and report the record count |
| Page-world wrapper failure | Try/catch inside the wrapper | Fall through to the original `fetch`/XHR; x.com keeps working |

Diagnostics stay on the device and are shown in Settings. The user copies them into an
issue by hand.

## 12. Testing

- **Unit (Vitest):** normalizer against captured GraphQL fixtures with account data
  scrubbed; verdict merging; settings migrations; selector registry lint. The fixtures
  are the regression net for X's schema changes.
- **Integration (Playwright, persistent context with the extension loaded):** tools run
  against saved timeline HTML. No login in CI.
- **Live smoke:** a manual checklist against the real site before each release. CI cannot
  log in to X. A green CI run does not prove the live path works, and the release
  checklist is what covers it.

## 13. Repository

- Licence: MIT.
- Conventional Commits.
- CI on push: typecheck, lint, unit tests, build.
- Release: a Chrome Web Store zip and a Firefox build from the same source.
- `CONTRIBUTING.md` states the rule that keeps the project repairable: X-specific strings
  belong in the selector registry, and tools do not write to the DOM.

## 14. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| X changes GraphQL operation names or shapes | Tools lose data | Selector registry, DOM fallback path, fixture tests |
| X ships anti-tamper checks on `fetch` | Interception stops | Wrapper preserves function identity where cheap; DOM path continues to work |
| Chrome Web Store review rejects the extension | No store distribution | Narrow host permissions, no remote code, clear privacy statement; GitHub release as fallback |
| MV3 worker shutdown during a long export | Lost progress | Cursor checkpoints and alarm-driven resume |
| Scope creep across modules 1–3 | Slipping core | Each module has its own spec and cycle; the core takes no module-specific code |

## 15. Deliverables for sub-project 0

1. WXT project skeleton with Chrome build and a Firefox target.
2. Page-world interceptor with the GraphQL capture.
3. Normalizer, DOM observer, PostStore.
4. Selector registry and health check with the lint rule.
5. Tool registry, verdict applier, containment.
6. Settings store with schema, defaults, migrations, config export and import.
7. Typed bus.
8. Side panel and options app with the Status, Tools and Settings routes.
9. Token file with the three themes and X theme detection.
10. `core:diagnostics` tool.
11. Test setup with fixtures, unit tests, Playwright harness, CI.
