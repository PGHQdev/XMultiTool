type Step = (raw: Record<string, unknown>) => Record<string, unknown>

// One entry per version step. A migration receives the object at version N
// and returns the object at version N + 1. Add entries; never edit an old one.
export const migrations: Record<number, Step> = {}

// steps is a parameter so the runner can be exercised with sample steps
// without writing into the shipped map.
export function runMigrations(
  raw: Record<string, unknown>,
  from: number,
  to: number,
  steps: Record<number, Step> = migrations,
): Record<string, unknown> {
  let current = raw
  for (let version = from; version < to; version += 1) {
    const step = steps[version]
    if (step) current = step(current)
  }
  return current
}
