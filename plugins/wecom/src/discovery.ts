import type { JsonValue, WeComRunRequest, WeComRunResult } from './transport.ts'

/** JSON Schema subset emitted by wecom-cli schema get. */
export interface WeComJsonSchema {
  readonly type?: string
  readonly description?: string
  readonly properties?: Readonly<Record<string, WeComJsonSchema>>
  readonly required?: readonly string[]
  readonly items?: WeComJsonSchema
  readonly enum?: readonly JsonValue[]
  readonly oneOf?: readonly WeComJsonSchema[]
  readonly additionalProperties?: boolean | WeComJsonSchema
  readonly [key: string]: unknown
}

/** Fully expanded remote method ready for policy and tool adaptation. */
export interface DiscoveredMethod {
  readonly path: readonly string[]
  readonly description?: string
  readonly requestRef?: string
  readonly responseRef: string
  readonly schemas: Readonly<Record<string, WeComJsonSchema>>
}

interface Runner {
  run(request: WeComRunRequest): Promise<WeComRunResult>
}

function object(value: JsonValue, label: string): Record<string, JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`)
  return value as Record<string, JsonValue>
}

function ref(value: JsonValue | undefined, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined
  const record = object(value as JsonValue, 'schema reference')
  if (typeof record.$ref !== 'string' || record.$ref.length === 0) throw new Error('schema reference must contain $ref')
  return record.$ref
}

/** Expand schema list summaries with schema get for every advertised method. */
export async function discoverWeComMethods(runner: Runner): Promise<readonly DiscoveredMethod[]> {
  const catalog = (await runner.run({ path: ['schema', 'list'] })).value
  if (!Array.isArray(catalog)) throw new Error('wecom-cli schema list must return an array')
  const methods: DiscoveredMethod[] = []
  for (const serviceValue of catalog) {
    const service = object(serviceValue, 'service catalog entry')
    if (typeof service.name !== 'string' || !Array.isArray(service.methods)) throw new Error('invalid service catalog entry')
    for (const summaryValue of service.methods) {
      const summary = object(summaryValue, 'method summary')
      if (typeof summary.name !== 'string') throw new Error('method summary name must be a string')
      const requestedPath = summary.name.startsWith(`${service.name}.`)
        ? summary.name
        : `${service.name}.${summary.name}`
      const detail = object((await runner.run({ path: ['schema', 'get', requestedPath] })).value, 'method schema')
      if (detail.method !== requestedPath) throw new Error(`method path mismatch: expected ${requestedPath}`)
      const schemasRecord = object(detail.schemas, 'method schemas')
      const schemas = schemasRecord as unknown as Record<string, WeComJsonSchema>
      const requestRef = ref(detail.request, false)
      const responseRef = ref(detail.response, true) as string
      const description = typeof detail.description === 'string'
        ? detail.description
        : typeof summary.description === 'string' ? summary.description : undefined
      methods.push({
        path: requestedPath.split('.'),
        ...(description === undefined ? {} : { description }),
        ...(requestRef === undefined ? {} : { requestRef }),
        responseRef,
        schemas,
      })
    }
  }
  return methods
}
