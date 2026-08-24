import { isDict, migrate, SETTINGS_VERSION, type StoredSettings } from './store'

export interface ConfigFile {
  app: 'xmultitool'
  version: number
  exportedAt: string
  settings: StoredSettings
}

export function exportConfig(
  settings: StoredSettings,
  exportedAt: string,
): string {
  const file: ConfigFile = {
    app: 'xmultitool',
    version: SETTINGS_VERSION,
    exportedAt,
    settings,
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

export function importConfig(text: string): StoredSettings {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not a valid XMultiTool config.')
  }

  const file = parsed as Partial<ConfigFile>
  // null and arrays are objects to typeof, and migrate() turns both into
  // defaults, so a lax check reports success while wiping every setting.
  if (file?.app !== 'xmultitool' || !isDict(file.settings)) {
    throw new Error('This file is not a valid XMultiTool config.')
  }

  // A version that is not a whole number cannot be compared, so it would slip
  // past the guard below. Reject it rather than guess what the writer meant.
  const version = file.version
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('This file is not a valid XMultiTool config.')
  }

  if (version > SETTINGS_VERSION) {
    throw new Error(
      'This config comes from a newer version of XMultiTool. Update the extension first.',
    )
  }

  return migrate(file.settings)
}
