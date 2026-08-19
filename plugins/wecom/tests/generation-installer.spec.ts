import { describe, expect, it, vi } from 'vitest'
import { createGenerationInstaller } from '../src/generation-installer.ts'

describe('generation installer', () => {
  it('re-registers overlapping tools so refreshed schemas take effect and ignores stale disposal', () => {
    const active = new Map<string, number>()
    const disposed: string[] = []
    const install = createGenerationInstaller<{ name: string; value: number }>({
      name: item => item.name,
      activate: item => { active.set(item.name, item.value) },
      register: item => () => { disposed.push(item.name); active.delete(item.name) },
    })
    const oldDispose = install([{ name: 'a', value: 1 }])
    const currentDispose = install([{ name: 'a', value: 2 }, { name: 'b', value: 3 }])
    oldDispose()
    expect(active).toEqual(new Map([['a', 2], ['b', 3]]))
    expect(disposed).toEqual(['a'])
    currentDispose()
    expect(active.size).toBe(0)
    expect(disposed.sort()).toEqual(['a', 'a', 'b'])
  })

  it('rolls back newly registered names when candidate installation fails', () => {
    const disposeA = vi.fn()
    const install = createGenerationInstaller<{ name: string }>({
      name: item => item.name, activate: vi.fn(),
      register: item => item.name === 'bad' ? (() => { throw new Error('bad') })() : disposeA,
    })
    expect(() => install([{ name: 'a' }, { name: 'bad' }])).toThrow('bad')
    expect(disposeA).toHaveBeenCalledOnce()
  })
})
