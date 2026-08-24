// One entry per version step. A migration receives the object at version N
// and returns the object at version N + 1. Add entries; never edit an old one.
export const migrations: Record<
  number,
  (raw: Record<string, unknown>) => Record<string, unknown>
> = {}

export function runMigrations(
  raw: Record<string, unknown>,
  from: number,
  to: number,
): Record<string, unknown> {
  let current = raw
  for (let version = from; version < to; version += 1) {
    const step = migrations[version]
    if (step) current = step(current)
  }
  return current
}
