// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginManagerTab, type PluginManagerTabProps } from '../src/client/PluginManagerTab.tsx'
import { en, type PluginManagerLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: PluginManagerLocaleKey): string => en[key]) as PluginManagerTabProps['t']

function props(overrides: Partial<PluginManagerTabProps> = {}): PluginManagerTabProps {
  return {
    t,
    list: async () => ({ entries: [
      { packageName: 'dsh-mail', version: '0.2.3', canUninstall: true },
      { packageName: 'dsh-plugin-manager', version: '0.1.0', canUninstall: false },
    ] }),
    install: async () => ({ action: 'install', packageName: 'dsh-example', version: '1.0.0', requiresRestart: true }),
    uninstall: async entry => ({ packageName: entry.packageName, version: entry.version, requiresRestart: true }),
    ...overrides,
  }
}

describe('PluginManagerTab', () => {
  it('uses Plugin-list cards with versions in the trailing status position and uninstall in details', async () => {
    render(<PluginManagerTab {...props()} />)
    const mail = await screen.findByRole('button', { name: 'dsh-mail, 0.2.3' })
    expect(mail.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: en.uninstall })).toBeNull()
    fireEvent.click(mail)
    expect(mail.getAttribute('aria-expanded')).toBe('true')
    expect((screen.getByRole('button', { name: en.uninstall }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'dsh-plugin-manager, 0.1.0' }))
    expect((screen.getByRole('button', { name: en.uninstall }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(en.managerProtected)).toBeTruthy()
  })

  it('rejects multiple dropped files before starting an install', async () => {
    const install = vi.fn(props().install)
    render(<PluginManagerTab {...props({ install })} />)
    const zone = screen.getByTestId('plugin-drop-zone')
    const files = [new File(['a'], 'a.tgz'), new File(['b'], 'b.tgz')]
    fireEvent.drop(zone, { dataTransfer: { files } })
    expect((await screen.findByRole('alert')).textContent).toContain(en.singleFileError)
    expect(install).not.toHaveBeenCalled()
  })

  it('does not bubble plugin package drops to the page-wide image intake', async () => {
    const install = vi.fn(props().install)
    const pageDrop = vi.fn()
    document.addEventListener('drop', pageDrop, true)
    render(<PluginManagerTab {...props({ install })} />)
    const zone = screen.getByTestId('plugin-drop-zone')

    fireEvent.dragEnter(zone, { dataTransfer: { files: [new File(['plugin'], 'plugin.tgz')], types: ['Files'] } })
    expect(zone.getAttribute('data-drag-active')).toBe('true')

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['plugin'], 'plugin.tgz')], types: ['Files'] },
    })

    await waitFor(() => { expect(install).toHaveBeenCalledOnce() })
    expect(pageDrop).not.toHaveBeenCalled()
    document.removeEventListener('drop', pageDrop, true)
  })

  it('installs one selected tgz and announces manual restart', async () => {
    const install = vi.fn(props().install)
    render(<PluginManagerTab {...props({ install })} />)
    const input = screen.getByLabelText(en.choose)
    fireEvent.change(input, { target: { files: [new File(['plugin'], 'plugin.tgz')] } })
    await waitFor(() => { expect(install).toHaveBeenCalledOnce() })
    expect((await screen.findByRole('status')).textContent).toContain(en.restartRequired)
  })

  it('uses an inline confirmation before uninstalling without a native dialog', async () => {
    const uninstall = vi.fn(props().uninstall)
    render(<PluginManagerTab {...props({ uninstall })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'dsh-mail, 0.2.3' }))

    fireEvent.click(screen.getByRole('button', { name: en.uninstall }))

    expect(screen.getByText(content => content.startsWith(en.uninstallConfirm))).toBeTruthy()
    expect(uninstall).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm uninstall' }))
    await waitFor(() => { expect(uninstall).toHaveBeenCalledOnce() })
  })
})
