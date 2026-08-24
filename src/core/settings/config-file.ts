import { migrate, SETTINGS_VERSION, type StoredSettings } from './store'

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
  if (file?.app !== 'xmultitool' || typeof file.settings !== 'object') {
    throw new Error('This file is not a valid XMultiTool config.')
  }

  if (typeof file.version === 'number' && file.version > SETTINGS_VERSION) {
    throw new Error(
      'This config comes from a newer version of XMultiTool. Update the extension first.',
    )
  }

  return migrate(file.settings)
}
