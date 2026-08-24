# Contributing

Three rules keep this project repairable when X changes.

1. **Every X-specific string lives in `src/core/adapter/x-selectors.ts`.** Test ids,
   GraphQL operation names, JSON paths, cookie names. `tests/architecture/selectors.test.ts`
   fails the build when one appears elsewhere.
2. **Tools do not write to the DOM.** A tool returns a verdict. `src/core/tools/apply.ts`
   is the only writer. This is what lets several tools judge the same post without
   fighting each other or X's re-render.
3. **Tools do not call `chrome.*` or read storage.** They use the context object. All
   browser API access goes through `src/core/browser.ts`.

## Adding a tool

Create a file that exports a `Tool`, then add it to `src/core/tools/index.ts`. The
settings UI, the storage defaults and the config export follow from the schema. Nothing
else needs an edit.

## Tests

`bun run test` for logic, `bun run e2e` for the pages, and `docs/release-checklist.md`
by hand against the live site. A green CI run does not prove the live path works.

## Commits

Conventional Commits. One change per commit.
