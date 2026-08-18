import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const client = resolve(root, 'lib/client.js')
writeFileSync(client, readFileSync(client, 'utf8').replace(/[\t ]+$/gmu, ''))
