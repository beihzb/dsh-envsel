// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvselHeaderButton } from '../src/client/EnvselHeaderButton.tsx'
import type {
  EnvselHeaderButtonInjected,
  EnvselHeaderButtonProps,
  EnvselRemoteOutcome,
} from '../src/client/EnvselHeaderButton.tsx'
import { en, type EnvselLocaleKey } from '../src/client/locales.ts'
import type { EnvselCatalogValue, EnvselGetValue, EnvEntry } from '@deepseek-ai/dsh-envsel/types'

afterEach(cleanup)

const t = ((key: EnvselLocaleKey, params?: Record<string, string | number>): string => {
  let text = en[key]
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) text = text.replace(`{${name}}`, String(value))
  }
  return text
}) as EnvselHeaderButtonProps['t']

const BASE: EnvEntry = {
  kind: 'conda', name: 'base', prefix: 'C:\\fake\\base',
  python: 'C:\\fake\\base\\python.exe', rscript: null, pythonCommand: 'C:\\fake\\base\\python.exe',
}
const SCRNAV2: EnvEntry = {
  kind: 'conda', name: 'scRNAv2', prefix: 'C:\\envs\\scRNAv2',
  python: 'C:\\envs\\scRNAv2\\python.exe', rscript: 'C:\\envs\\scRNAv2\\Scripts\\Rscript.exe',
  pythonCommand: 'C:\\envs\\scRNAv2\\python.exe', rscriptCommand: 'C:\\envs\\scRNAv2\\Scripts\\Rscript.exe',
}
const R451: EnvEntry = {
  kind: 'r', name: 'R-4.5.1', prefix: 'C:\\Program Files\\R\\R-4.5.1',
  python: null, rscript: 'C:\\Program Files\\R\\R-4.5.1\\bin\\Rscript.exe',
  rscriptCommand: 'C:\\Program Files\\R\\R-4.5.1\\bin\\Rscript.exe',
}
const WSL: EnvEntry = {
  kind: 'wsl', name: 'scRNA', distro: 'Ubuntu', prefix: '/home/u/miniconda3/envs/scRNA',
  python: '/home/u/miniconda3/envs/scRNA/bin/python', rscript: null,
  pythonCommand: 'wsl.exe -d Ubuntu -- /home/u/miniconda3/envs/scRNA/bin/python',
}

const CATALOG: EnvselCatalogValue = { entries: [BASE, SCRNAV2, R451, WSL], warnings: [] }

function ok<T>(value: T): EnvselRemoteOutcome<T> {
  return { ok: true, value }
}

function fail(code: string): EnvselRemoteOutcome<never> {
  return { ok: false, error: { code, message: code } }
}

function props(overrides: Partial<EnvselHeaderButtonInjected> = {}): EnvselHeaderButtonProps {
  return {
    sessionId: 's1',
    t,
    listCatalog: vi.fn(async () => ok(CATALOG)),
    getSelection: vi.fn(async () => ok<EnvselGetValue>({ selection: {} })),
    setSelection: vi.fn(async () => ok<EnvselGetValue>({ selection: {} })),
    pinPath: vi.fn(async () => ok(CATALOG)),
    unpinPath: vi.fn(async () => ok(CATALOG)),
    ...overrides,
  } as EnvselHeaderButtonProps
}

describe('EnvselHeaderButton', () => {
  it('renders the trigger summary from the folded selection', async () => {
    render(<EnvselHeaderButton {...props({
      getSelection: vi.fn(async () => ok<EnvselGetValue>({ selection: { python: SCRNAV2, r: R451 } })),
    })} />)
    expect(await screen.findByRole('button', { name: /Python: scRNAv2 · R: R-4.5.1/ })).toBeTruthy()
  })

  it('loads the catalog lazily on first open and filters entries per slot', async () => {
    const listCatalog = vi.fn(async () => ok(CATALOG))
    render(<EnvselHeaderButton {...props({ listCatalog })} />)
    expect(listCatalog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /none selected/ }))
    await act(async () => {})
    expect(listCatalog).toHaveBeenCalledOnce()
    expect(await screen.findByRole('group', { name: en.panelAria })).toBeTruthy()

    // Python slot: entries carrying a python interpreter.
    expect(screen.getByRole('button', { name: 'Use base for Python' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use scRNAv2 for Python' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use R-4.5.1 for Python' })).toBeNull()
    // R slot: entries carrying Rscript.
    expect(screen.getByRole('button', { name: 'Use scRNAv2 for R' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use R-4.5.1 for R' })).toBeTruthy()
    // CLI slot: every entry.
    expect(screen.getByRole('button', { name: 'Use base for CLI tools' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use R-4.5.1 for CLI tools' })).toBeTruthy()
    // WSL entries carry their distribution; the entry serves both Python and CLI slots.
    expect(screen.getAllByText('WSL · Ubuntu').length).toBeGreaterThan(0)
  })

  it('assigns a slot and reflects the committed selection', async () => {
    const setSelection = vi.fn(async () => ok<EnvselGetValue>({ selection: { python: SCRNAV2 } }))
    render(<EnvselHeaderButton {...props({ setSelection })} />)
    fireEvent.click(screen.getByRole('button', { name: /none selected/ }))
    await screen.findByRole('group', { name: en.panelAria })

    fireEvent.click(await screen.findByRole('button', { name: 'Use scRNAv2 for Python' }))
    expect(setSelection).toHaveBeenCalledWith('s1', 'python', 'conda:scRNAv2')
    expect(await screen.findByRole('button', { name: /Python: scRNAv2/ })).toBeTruthy()
  })

  it('clears a slot by sending an empty address', async () => {
    const setSelection = vi.fn(async () => ok<EnvselGetValue>({ selection: {} }))
    render(<EnvselHeaderButton {...props({
      getSelection: vi.fn(async () => ok<EnvselGetValue>({ selection: { python: SCRNAV2 } })),
      setSelection,
    })} />)
    fireEvent.click(await screen.findByRole('button', { name: /Python: scRNAv2/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear Python environment' }))
    expect(setSelection).toHaveBeenCalledWith('s1', 'python', '')
    expect(await screen.findByRole('button', { name: /none selected/ })).toBeTruthy()
  })

  it('shows a retryable banner when the selection read fails', async () => {
    const getSelection = vi.fn()
      .mockResolvedValueOnce(fail('session-not-found'))
      .mockResolvedValueOnce(ok<EnvselGetValue>({ selection: { python: BASE } }))
    render(<EnvselHeaderButton {...props({ getSelection })} />)

    expect(await screen.findByRole('button', { name: /session does not exist/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /session does not exist/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('session does not exist')

    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(getSelection).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('button', { name: /Python: base/ })).toBeTruthy()
  })

  it('shows an inline error when the catalog fails to load', async () => {
    const listCatalog = vi.fn(async () => fail('transport'))
    render(<EnvselHeaderButton {...props({ listCatalog })} />)
    fireEvent.click(screen.getByRole('button', { name: /none selected/ }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('shows the action failure inside the open panel', async () => {
    const setSelection = vi.fn(async () => fail('incompatible'))
    render(<EnvselHeaderButton {...props({ setSelection })} />)
    fireEvent.click(screen.getByRole('button', { name: /none selected/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use scRNAv2 for Python' }))
    expect(await screen.findByText('Switch failed: the environment provides no such language')).toBeTruthy()
  })

  it('pins a typed path and shows the resulting custom entry', async () => {
    const custom: EnvEntry = {
      kind: 'custom', name: 'homebrew', prefix: '/opt/homebrew',
      python: null, rscript: '/opt/homebrew/bin/Rscript', rscriptCommand: '/opt/homebrew/bin/Rscript',
    }
    const pinPath = vi.fn(async () => ok({ entries: [...CATALOG.entries, custom], warnings: [] }))
    render(<EnvselHeaderButton {...props({ pinPath })} />)
    fireEvent.click(screen.getByRole('button', { name: /none selected/ }))
    await screen.findByRole('group', { name: en.panelAria })
    fireEvent.change(screen.getByLabelText(en.addPathAria), { target: { value: '/opt/homebrew/bin/Rscript' } })
    fireEvent.click(screen.getByRole('button', { name: en.addPathSubmit }))
    expect(pinPath).toHaveBeenCalledWith('/opt/homebrew/bin/Rscript')
    expect(await screen.findByRole('button', { name: 'Use homebrew for R' })).toBeTruthy()
    expect(screen.getAllByText(en.kindCustom).length).toBeGreaterThan(0)
  })

  it('unpins a custom entry from the catalog', async () => {
    const custom: EnvEntry = {
      kind: 'custom', name: 'homebrew', prefix: '/opt/homebrew',
      python: null, rscript: '/opt/homebrew/bin/Rscript', rscriptCommand: '/opt/homebrew/bin/Rscript',
    }
    const unpinPath = vi.fn(async () => ok(CATALOG))
    render(<EnvselHeaderButton {...props({
      listCatalog: vi.fn(async () => ok({ entries: [...CATALOG.entries, custom], warnings: [] })),
      unpinPath,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /none selected/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove homebrew from the local cache' }))
    expect(unpinPath).toHaveBeenCalledWith('custom:homebrew')
  })

  it('shows a pin failure as an action error', async () => {
    const pinPath = vi.fn(async () => fail('no-interpreter'))
    render(<EnvselHeaderButton {...props({ pinPath })} />)
    fireEvent.click(screen.getByRole('button', { name: /none selected/ }))
    await screen.findByRole('group', { name: en.panelAria })
    fireEvent.change(screen.getByLabelText(en.addPathAria), { target: { value: '/tmp/notes.txt' } })
    fireEvent.click(screen.getByRole('button', { name: en.addPathSubmit }))
    expect(await screen.findByText('Switch failed: no python or Rscript found')).toBeTruthy()
  })

  it('closes on Escape and refocuses the trigger', async () => {
    render(<EnvselHeaderButton {...props()} />)
    const trigger = screen.getByRole('button', { name: /none selected/ })
    fireEvent.click(trigger)
    await screen.findByRole('group', { name: en.panelAria })
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: en.panelAria })).toBeNull()
  })
})
