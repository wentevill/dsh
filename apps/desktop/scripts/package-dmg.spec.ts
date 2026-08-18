import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packageDmg, prepareDmgSource } from './package-dmg.ts'

describe('DMG packaging', () => {
  it('stages the application beside an Applications shortcut', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-'))
    const app = join(root, 'DeepSeek Harness.app')
    const source = join(root, 'source')
    mkdirSync(app)
    writeFileSync(join(app, 'marker'), 'application bundle')

    prepareDmgSource(app, source)

    expect(readFileSync(join(source, 'DeepSeek Harness.app/marker'), 'utf8')).toBe('application bundle')
    expect(readlinkSync(join(source, 'Applications'))).toBe('/Applications')
  })

  it('preserves the previous image when image creation fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-failure-'))
    const app = join(root, 'DeepSeek Harness.app')
    const output = join(root, 'DeepSeek Harness.dmg')
    mkdirSync(app)
    writeFileSync(output, 'previous image')

    expect(() => packageDmg(app, output, (_source, temporaryOutput) => {
      writeFileSync(temporaryOutput, 'partial image')
      throw new Error('hdiutil failed')
    })).toThrow('hdiutil failed')

    expect(readFileSync(output, 'utf8')).toBe('previous image')
  })
})
