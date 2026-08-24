import { runMigrations } from './migrations'

export const SETTINGS_KEY = 'xmt:settings'
export const SETTINGS_VERSION = 1

export type ThemeChoice = 'auto' | 'light' | 'dim' | 'lights-out'

export interface StoredSettings {
  version: number
  enabled: Record<string, boolean>
  tools: Record<string, Record<string, unknown>>
  ui: { theme: ThemeChoice }
}

export interface StorageArea {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  onChanged(cb: (key: string) => void): () => void
}

const THEMES: ThemeChoice[] = ['auto', 'light', 'dim', 'lights-out']

function fresh(): StoredSettings {
  return {
    version: SETTINGS_VERSION,
    enabled: {},
    tools: {},
    ui: { theme: 'auto' },
  }
}

export const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function migrate(raw: unknown): StoredSettings {
  if (!isDict(raw)) return fresh()
  const version = typeof raw.version === 'number' ? raw.version : 0
  // importConfig() already refuses a future version, so migrate() refuses it
  // too: no migration can read a shape it predates, and returning defaults
  // here would destroy real settings without telling the caller. Each caller
  // decides what to do; load() below chooses to start fresh.
  if (version > SETTINGS_VERSION) {
    throw new Error(
      'These settings come from a newer version of XMultiTool. Update the extension first.',
    )
  }

  const migrated = runMigrations(raw, version, SETTINGS_VERSION)
  const enabled = isDict(migrated.enabled) ? migrated.enabled : {}
  const tools = isDict(migrated.tools) ? migrated.tools : {}
  const ui = isDict(migrated.ui) ? migrated.ui : {}
  const theme = THEMES.includes(ui.theme as ThemeChoice)
    ? (ui.theme as ThemeChoice)
    : 'auto'

  return {
    version: SETTINGS_VERSION,
    enabled: Object.fromEntries(
      Object.entries(enabled).filter(([, v]) => typeof v === 'boolean'),
    ) as Record<string, boolean>,
    tools: Object.fromEntries(
      Object.entries(tools).filter(([, v]) => isDict(v)),
    ) as Record<string, Record<string, unknown>>,
    ui: { theme },
  }
}

export class SettingsStore {
  private state: StoredSettings = fresh()
  private readonly listeners = new Set<(state: StoredSettings) => void>()

  constructor(private readonly area: StorageArea) {}

  async load(): Promise<StoredSettings> {
    const raw = await this.area.get(SETTINGS_KEY)
    try {
      this.state = migrate(raw)
    } catch {
      // A downgraded extension reads storage a newer build wrote. The panel
      // must still open, so start fresh; nothing is written until a change.
      this.state = fresh()
    }
    return this.state
  }

  snapshot(): StoredSettings {
    return this.state
  }

  isEnabled(toolId: string): boolean {
    return this.state.enabled[toolId] === true
  }

  rawToolSettings(toolId: string): Record<string, unknown> {
    return this.state.tools[toolId] ?? {}
  }

  async setEnabled(toolId: string, on: boolean): Promise<void> {
    this.state = {
      ...this.state,
      enabled: { ...this.state.enabled, [toolId]: on },
    }
    await this.persist()
  }

  async patchTool(
    toolId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const merged = { ...this.rawToolSettings(toolId), ...patch }
    this.state = {
      ...this.state,
      tools: { ...this.state.tools, [toolId]: merged },
    }
    await this.persist()
  }

  async setTheme(theme: ThemeChoice): Promise<void> {
    this.state = { ...this.state, ui: { ...this.state.ui, theme } }
    await this.persist()
  }

  async replace(next: StoredSettings): Promise<void> {
    this.state = migrate(next)
    await this.persist()
  }

  subscribe(listener: (state: StoredSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async persist(): Promise<void> {
    await this.area.set(SETTINGS_KEY, this.state)
    for (const listener of this.listeners) {
      try {
        listener(this.state)
      } catch {
        // A subscriber failure must never break the broadcast to the others.
      }
    }
  }
}
