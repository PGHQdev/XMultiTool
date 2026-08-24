import type { Field } from '../../core/settings/schema'

export type ControlName = 'switch' | 'number' | 'text' | 'select' | 'list'

const BY_TYPE: Record<Field['type'], ControlName> = {
  boolean: 'switch',
  number: 'number',
  string: 'text',
  enum: 'select',
  stringList: 'list',
}

export function controlFor(field: Field): ControlName {
  return BY_TYPE[field.type]
}
