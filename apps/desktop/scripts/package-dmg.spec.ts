import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditMountedDmg, buildFinderLayoutScript, createCustomizedDmg, packageDmg, prepareDmgSource } from './package-dmg.ts'

describe('DMG packaging', () => {
  it('creates a compressed image after applying the standard Finder layout', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-layout-'))
    const source = join(root, 'source')
    const output = join(root, 'DeepSeek Harness.dmg')
    mkdirSync(source)
    const commands: Array<{ command: string, args: string[] }> = []

    createCustomizedDmg(source, output, (command, args) => commands.push({ command, args }))

    expect(commands[0]).toMatchObject({
      command: 'hdiutil',
      args: expect.arrayContaining(['create', '-fs', 'HFS+', '-format', 'UDRW', '-srcfolder', source]),
    })
    expect(commands[1]).toMatchObject({
      command: 'hdiutil',
      args: expect.arrayContaining(['attach', '-readwrite', '-mountpoint']),
    })
    expect(commands[2]?.command).toBe('osascript')
    expect(commands[3]).toEqual({ command: 'sync', args: [] })
    expect(commands[4]).toMatchObject({ command: 'hdiutil', args: expect.arrayContaining(['detach']) })
    expect(commands[5]).toMatchObject({
      command: 'hdiutil',
      args: expect.arrayContaining(['convert', '-format', 'UDZO', '-o', output]),
    })

    const script = commands[2]?.args.at(-1) ?? ''
    expect(script).toContain('set bounds to {200, 200, 860, 600}')
    expect(script).toContain('set icon size to 128')
    expect(script).toContain('set position of item "DeepSeek Harness.app" of mountedFolder to {170, 190}')
    expect(script).toContain('set position of item "Applications" of mountedFolder to {490, 190}')
    expect(script).toContain('set background picture of theViewOptions to file "DeepSeek Harness.app:Contents:Resources:dmg-background.png"')
    expect(script).toContain('update item "Applications"')
  })

  it('resolves the private mount through its POSIX path', () => {
    const script = buildFinderLayoutScript('/private/tmp/DeepSeek Harness mount')

    expect(script).toContain('set mountedFolder to POSIX file "/private/tmp/DeepSeek Harness mount" as alias')
    expect(script).toContain('set mountedWindow to container window of mountedFolder')
    expect(script).not.toContain('tell disk')
  })

  it('removes temporary layout files when Finder customization fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-layout-failure-'))
    const source = join(root, 'source')
    mkdirSync(source)

    expect(() => createCustomizedDmg(source, join(root, 'output.dmg'), (command) => {
      if (command === 'osascript') throw new Error('Finder failed')
    })).toThrow('Finder failed')

    expect(readdirSync(root)).toEqual(['source'])
  })

  it('stages the application beside an Applications shortcut', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-'))
    const app = join(root, 'DeepSeek Harness.app')
    const source = join(root, 'source')
    mkdirSync(join(app, 'Contents/Resources'), { recursive: true })
    writeFileSync(join(app, 'marker'), 'application bundle')
    writeFileSync(join(app, 'Contents/Resources/dmg-background.png'), 'background')

    prepareDmgSource(app, source)

    expect(readFileSync(join(source, 'DeepSeek Harness.app/marker'), 'utf8')).toBe('application bundle')
    expect(readlinkSync(join(source, 'Applications'))).toBe('/Applications')
    expect(existsSync(join(source, '.background'))).toBe(false)
    expect(existsSync(join(source, '.fseventsd'))).toBe(false)
    expect(readFileSync(join(source, 'DeepSeek Harness.app/Contents/Resources/dmg-background.png'))).not.toHaveLength(0)
  })

  it('does not mutate the signed app while staging it', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-hidden-'))
    const app = join(root, 'DeepSeek Harness.app')
    const source = join(root, 'source')
    mkdirSync(app)

    prepareDmgSource(app, source)

    expect(readdirSync(source).sort()).toEqual(['Applications', 'DeepSeek Harness.app'])
  })

  it('rejects mounted images that expose metadata directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-mounted-audit-'))
    mkdirSync(join(root, 'DeepSeek Harness.app'))
    mkdirSync(join(root, 'DeepSeek Harness.app/Contents/Resources'), { recursive: true })
    writeFileSync(join(root, 'DeepSeek Harness.app/Contents/Resources/dmg-background.png'), 'background')
    writeFileSync(join(root, '.DS_Store'), 'layout')
    symlinkSync('/Applications', join(root, 'Applications'))
    mkdirSync(join(root, '.fseventsd'))

    expect(() => auditMountedDmg(root, {
      flags: () => [],
      app: () => undefined,
    })).toThrow(/must not contain \.fseventsd/)
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

  it('audits the completed image before publishing it', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-audit-'))
    const app = join(root, 'DeepSeek Harness.app')
    const output = join(root, 'DeepSeek Harness.dmg')
    mkdirSync(app)
    let audited = ''

    packageDmg(app, output, (_source, temporaryOutput) => {
      writeFileSync(temporaryOutput, 'complete image')
    }, image => {
      audited = image
      expect(readFileSync(image, 'utf8')).toBe('complete image')
    })

    expect(audited).toBe(output)
  })
})
