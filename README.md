# XMultiTool

An open-source browser extension for X. Reading control, data export and author tools,
each one a toggle over one shared core.

## State

Sub-project 0, the platform core, is in progress. It ships the adapter, the tool
registry, the settings store and the side panel. Reading control, data export and author
tools follow as separate modules.

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
