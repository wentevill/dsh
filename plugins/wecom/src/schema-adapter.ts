import type { JsonValue } from './transport.ts'
import type { WeComJsonSchema } from './discovery.ts'

/** DSH parameter declaration assembled without importing a Host runtime. */
export interface AdaptedParameter {
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  readonly required?: boolean
  readonly description?: string
  readonly enum?: readonly JsonValue[]
  readonly properties?: Readonly<Record<string, AdaptedParameter>>
  readonly items?: AdaptedParameter
  readonly additionalProperties?: boolean
}

/** Produce a stable model-facing name from a remote method path. */
export function normalizeToolName(path: readonly string[]): string {
  const segments = path.map(segment => segment.replace(/[^a-zA-Z0-9]+/gu, '_').replace(/^_+|_+$/gu, '').toLowerCase())
  if (segments.some(segment => segment.length === 0)) throw new Error('WeCom method path contains an empty tool-name segment')
  return `wecom_${segments.join('_')}`
}

function adaptNode(schema: WeComJsonSchema, required = false): AdaptedParameter {
  if ((schema.oneOf?.length ?? 0) > 0) throw new Error('unsupported oneOf in WeCom request schema')
  const rawType = schema.type === 'integer' ? 'number' : schema.type
  if (rawType !== 'string' && rawType !== 'number' && rawType !== 'boolean' && rawType !== 'object' && rawType !== 'array') {
    throw new Error(`unsupported WeCom schema type: ${String(schema.type)}`)
  }
  const type: AdaptedParameter['type'] = rawType
  const common = {
    type,
    ...(required ? { required: true } : {}),
    ...(schema.description === undefined ? {} : { description: schema.description }),
    ...(schema.enum === undefined ? {} : { enum: schema.enum }),
  }
  if (type === 'array') {
    if (schema.items === undefined) throw new Error('WeCom array schema requires items')
    return { ...common, items: adaptNode(schema.items) }
  }
  if (type === 'object') {
    const requiredKeys = new Set(schema.required ?? [])
    const properties = Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, child]) => [name, adaptNode(child, requiredKeys.has(name))]),
    )
    const additionalProperties = typeof schema.additionalProperties === 'boolean' ? schema.additionalProperties : false
    return { ...common, properties, additionalProperties }
  }
  return common
}

/** Resolve and convert one request schema into DSH root parameters. */
export function adaptRequestSchema(
  requestRef: string | undefined,
  schemas: Readonly<Record<string, WeComJsonSchema>>,
): Readonly<Record<string, AdaptedParameter>> {
  if (requestRef === undefined) return {}
  const root = schemas[requestRef]
  if (root === undefined) throw new Error(`missing WeCom request schema: ${requestRef}`)
  const adapted = adaptNode(root)
  if (adapted.type !== 'object') throw new Error('WeCom request root must be an object')
  return adapted.properties ?? {}
}
