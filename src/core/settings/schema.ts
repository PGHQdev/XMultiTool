export interface FieldBase {
  label: string
  help?: string
}

export type Field =
  | (FieldBase & { type: 'boolean'; default: boolean })
  | (FieldBase & {
      type: 'number'
      default: number
      min?: number
      max?: number
    })
  | (FieldBase & { type: 'string'; default: string; placeholder?: string })
  | (FieldBase & {
      type: 'enum'
      default: string
      options: Array<{ value: string; label: string }>
    })
  | (FieldBase & { type: 'stringList'; default: string[] })

export type Schema<S> = { [K in keyof S]: Field }

function defaultOf(field: Field): unknown {
  return field.type === 'stringList' ? [...field.default] : field.default
}

export function defaultsOf<S>(schema: Schema<S>): S {
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema) as Array<[string, Field]>) {
    out[key] = defaultOf(field)
  }
  return out as S
}

function coerceField(field: Field, value: unknown): unknown {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : field.default
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return field.default
      const min = field.min ?? Number.NEGATIVE_INFINITY
      const max = field.max ?? Number.POSITIVE_INFINITY
      return Math.min(max, Math.max(min, value))
    }
    case 'string':
      return typeof value === 'string' ? value : field.default
    case 'enum':
      return field.options.some((o) => o.value === value)
        ? value
        : field.default
    case 'stringList':
      return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string')
        : [...field.default]
  }
}

export function coerce<S>(schema: Schema<S>, raw: unknown): S {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {}
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema) as Array<[string, Field]>) {
    out[key] =
      key in source ? coerceField(field, source[key]) : defaultOf(field)
  }
  return out as S
}
