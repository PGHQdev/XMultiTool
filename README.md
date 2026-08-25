# XMultiTool

An open-source browser extension for X. Reading control, data export and author tools,
each one a toggle over one shared core.

## State

The platform core is in place: the adapter, the tool registry, the settings store and
the panel. The first reading tool ships with it. The timeline cleaner dims ads,
engagement bait, muted words, muted accounts and small accounts, and names the rule on
each post it dims. Data export and author tools follow as separate modules.

## Install for development

```bash
bun install
bun run dev
```

Then load `dist/chrome-mv3` as an unpacked extension.

## Commands

| Command | Effect |
|---|---|
| `bun run dev` | Chrome with hot reload |
| `bun run build` | Chrome production build |
| `bun run build:firefox` | Firefox build |
| `bun run test` | Unit tests |
| `bun run e2e` | End-to-end smoke |
| `bun run zip` | Store artefact |

## Privacy

The extension talks to no server. See `PRIVACY.md`.

## Licence

MIT.
