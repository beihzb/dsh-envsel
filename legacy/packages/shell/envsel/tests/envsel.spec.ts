/**
 * Tests for `@deepseek-ai/dsh-envsel`: pure parsing/rendering/folding units,
 * plus an apply-level integration pass that mounts the real `apply()` against
 * stubbed service seams and drives the `/env` command, runtime context,
 * `DSH_ENV_*` resolution, and the `session_env` tool.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  SESSION_ENV_TOOL,
  apply,
  cliPathGuidance,
  defaultStandaloneRRoots,
  describeEntry,
  envHelpText,
  isWindowsHost,
  joinPath,
  parseEnvLine,
  parsePinnedDocument,
  prefixFromRscript,
  probeCustomPath,
  selectionContext,
  serializePinnedDocument,
  slotCompatible,
} from '../src/index.ts'
import { EnvselRemoteService } from '../src/index.ts'
import * as envselInvariant from '../src/invariant.ts'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { baseName, discoverAll } from '../src/discover.ts'
import {
  ENV_SLOTS,
  entryAddress,
  foldSelection,
  isEmptySelection,
  refMatchesEntry,
} from '../src/types.ts'
import type { EnvEntry, EnvSelection, EnvSlot, SessionId } from '../src/types.ts'

// ── fixtures ──────────────────────────────────────────────────────────────────

const CONDA_JSON = JSON.stringify({
  envs: [
    'C:\\fake\\base',
    'C:\\Users\\u\\.conda\\envs\\scRNAv2',
  ],
})

const BASE_ENTRY: EnvEntry = {
  kind: 'conda',
  name: 'base',
  prefix: 'C:\\fake\\base',
  python: 'C:\\fake\\base\\python.exe',
  rscript: null,
  pythonCommand: 'C:\\fake\\base\\python.exe',
}

const SCRNAV2_ENTRY: EnvEntry = {
  kind: 'conda',
  name: 'scRNAv2',
  prefix: 'C:\\Users\\u\\.conda\\envs\\scRNAv2',
  python: 'C:\\Users\\u\\.conda\\envs\\scRNAv2\\python.exe',
  rscript: 'C:\\Users\\u\\.conda\\envs\\scRNAv2\\Scripts\\Rscript.exe',
  pythonCommand: 'C:\\Users\\u\\.conda\\envs\\scRNAv2\\python.exe',
  rscriptCommand: 'C:\\Users\\u\\.conda\\envs\\scRNAv2\\Scripts\\Rscript.exe',
}

const R451_ENTRY: EnvEntry = {
  kind: 'r',
  name: 'R-4.5.1',
  prefix: 'C:\\Program Files\\R\\R-4.5.1',
  python: null,
  rscript: 'C:\\Program Files\\R\\R-4.5.1\\bin\\Rscript.exe',
  rscriptCommand: 'C:\\Program Files\\R\\R-4.5.1\\bin\\Rscript.exe',
}

/** One fake live Session: an appendable event window keyed in the registry. */
interface FakeSession {
  readonly header: { version: number; id: string; createdAt: number }
  readonly events: { type: string; data: unknown }[]
  append(type: string, data: unknown): void
}

/** Live-session registry backing the `sessions` stub; cleared per test. */
const sessionRegistry = new Map<string, FakeSession>()

beforeEach(() => {
  sessionRegistry.clear()
})

/** Minimal Agent double backed by one registered live Session. */
function fakeAgent(sessionId = 'session-test'): Agent {
  let session = sessionRegistry.get(sessionId)
  if (session === undefined) {
    const events: { type: string; data: unknown }[] = []
    session = {
      header: { version: 0, id: sessionId, createdAt: 0 },
      events,
      append(type: string, data: unknown): void {
        events.push({ type, data })
      },
    }
    sessionRegistry.set(sessionId, session)
  }
  return { session } as unknown as Agent
}

/** Subprocess stub: resolveExecutable + canned spawn responses by argv key. */
function fakeSubprocess(spawns: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>) {
  return {
    async resolveExecutable(name: string): Promise<string> {
      if (name === 'conda') return 'C:\\fake\\conda.exe'
      if (name === 'Rscript') return 'C:\\Program Files\\R\\R-4.5.1\\bin\\Rscript.exe'
      return name
    },
    spawn(spec: { argv: readonly string[] }) {
      const canned = spawns[spec.argv.join(' ')] ?? { stdout: '', exitCode: 1, stderr: 'unhandled spawn' }
      return {
        pid: -1,
        done: Promise.resolve({ exitCode: canned.exitCode ?? 0, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: canned.stdout ?? '' }) },
          stderr: { readFrom: () => ({ text: canned.stderr ?? '' }) },
        },
        terminate() {
          // no-op for canned spawns
        },
      }
    },
  }
}

/** FileSystem stub: stat answers from an existing-path set; optional dirs and text files. */
function fakeFs(
  existing: Set<string>,
  options: { directories?: Set<string>; files?: Map<string, string>; writes?: string[] } = {},
) {
  const directories = options.directories ?? new Set<string>()
  const files = options.files ?? new Map<string, string>()
  const writes = options.writes ?? []
  return {
    async resolve(path: string) {
      return { displayPath: path, targetKey: path }
    },
    async stat(target: { displayPath: string }) {
      if (directories.has(target.displayPath)) return { type: 'directory' as const, version: 0 }
      if (existing.has(target.displayPath) || files.has(target.displayPath)) {
        return { type: 'file' as const, version: 0 }
      }
      return undefined
    },
    async listDir(target: { displayPath: string }) {
      const prefix = target.displayPath.replace(/[\\/]+$/u, '')
      const children: { name: string; type: 'file' | 'directory' }[] = []
      const seen = new Set<string>()
      for (const path of [...directories, ...existing, ...files.keys()]) {
        if (!path.startsWith(`${prefix}/`) && !path.startsWith(`${prefix}\\`)) continue
        const rest = path.slice(prefix.length + 1)
        const name = rest.split(/[\\/]/u)[0]
        if (name === undefined || name.length === 0 || seen.has(name)) continue
        seen.add(name)
        const childPath = path.startsWith(`${prefix}/`) ? `${prefix}/${name}` : `${prefix}\\${name}`
        children.push({
          name,
          type: directories.has(childPath) ? 'directory' : 'file',
        })
      }
      return children
    },
    async readText(target: { displayPath: string }) {
      const text = files.get(target.displayPath)
      if (text === undefined) throw new Error(`missing ${target.displayPath}`)
      return text
    },
    async writeText(target: { displayPath: string }, content: string) {
      files.set(target.displayPath, content)
      writes.push(target.displayPath)
      return { created: true }
    },
  }
}

interface MountedEnvsel {
  ctx: Context
  command: { handler: (invocation: { rawInput: string; agent: Agent }) => Promise<unknown> }
  context: { text: (context: { agent?: Agent }) => string }
  contributor: { resolve: (execution: { agent?: Agent }) => Record<string, string> }
  tool: { execute: (args: Record<string, unknown>, exec: { agent?: Agent }) => Promise<unknown> }
}

/** Mount the real apply() against stubbed seams and return the captured registrations. */
function mountEnvsel(existing: Set<string>): MountedEnvsel {
  const ctx = new Context()
  const command: MountedEnvsel['command'] = { handler: async () => null }
  const context: MountedEnvsel['context'] = { text: () => '' }
  const contributor: MountedEnvsel['contributor'] = { resolve: () => ({}) }
  const tool: MountedEnvsel['tool'] = { execute: async () => null }

  ctx.provide('subprocess', fakeSubprocess({
    'C:\\fake\\conda.exe env list --json': { stdout: CONDA_JSON },
  }))
  ctx.provide('fs', fakeFs(existing))
  ctx.provide('sessions', {
    get(id: string) {
      return sessionRegistry.get(id)
    },
  })
  ctx.provide('systemPrompt', {
    context(section: MountedEnvsel['context']): () => void {
      context.text = section.text
      return () => {}
    },
  })
  ctx.provide('shellEnv', {
    register(contributorIn: MountedEnvsel['contributor']): () => void {
      contributor.resolve = contributorIn.resolve
      return () => {}
    },
  })
  ctx.provide('commands', {
    register(definition: { handler: MountedEnvsel['command']['handler'] }): () => void {
      command.handler = definition.handler
      return () => {}
    },
  })
  ctx.provide('tools', {
    register(definition: MountedEnvsel['tool'] & { name?: string }): () => void {
      tool.execute = definition.execute
      return () => {}
    },
  })
  ctx.provide('timer', {
    timeout(): () => void {
      return () => {}
    },
  })

  apply(ctx, {
    listTtlMs: 60000,
    condaCommand: 'conda',
    standaloneRRoots: [],
    wslEnabled: false,
    registerTool: true,
    probeTimeoutMs: 5000,
  })
  return { ctx, command, context, contributor, tool }
}

// ── pure units ────────────────────────────────────────────────────────────────

describe('types', () => {
  it('folds the last envsel/selection snapshot', () => {
    const first: EnvSelection = { python: BASE_ENTRY }
    const second: EnvSelection = { python: SCRNAV2_ENTRY, r: R451_ENTRY }
    const events = [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'envsel/selection', data: { slots: first } },
      { type: 'turn/end', data: {} },
      { type: 'envsel/selection', data: { slots: second } },
    ]
    expect(foldSelection(events)).toEqual(second)
  })

  it('returns an empty selection when no envsel event exists', () => {
    expect(foldSelection([{ type: 'turn/start', data: {} }])).toEqual({})
    expect(isEmptySelection({})).toBe(true)
    expect(isEmptySelection({ python: BASE_ENTRY })).toBe(false)
  })

  it('addresses and matches entries by kind/name/distro', () => {
    expect(entryAddress(SCRNAV2_ENTRY)).toBe('conda:scRNAv2')
    expect(entryAddress({ ...R451_ENTRY, kind: 'wsl', distro: 'Ubuntu', prefix: '/home/u/envs/x' }))
      .toBe('wsl:Ubuntu:R-4.5.1')
    expect(refMatchesEntry({ kind: 'conda', name: 'scRNAv2' }, SCRNAV2_ENTRY)).toBe(true)
    const wsl = { ...R451_ENTRY, kind: 'wsl' as const, distro: 'Ubuntu', prefix: '/home/u' }
    expect(refMatchesEntry({ kind: 'wsl', name: 'R-4.5.1', distro: 'Ubuntu' }, wsl)).toBe(true)
    expect(refMatchesEntry({ kind: 'wsl', name: 'R-4.5.1', distro: 'Debian' }, wsl)).toBe(false)
  })

  it('computes base names from Windows and POSIX paths', () => {
    expect(baseName('C:\\Users\\u\\.conda\\envs\\scRNAv2')).toBe('scRNAv2')
    expect(baseName('/home/u/miniconda3/envs/x')).toBe('x')
  })
})

describe('posix path helpers', () => {
  it('joins and reconstructs prefixes without dropping a leading slash', () => {
    expect(joinPath('/opt/R', '4.4.1', 'linux')).toBe('/opt/R/4.4.1')
    expect(joinPath('C:\\Program Files\\R', 'R-4.5.1', 'win32')).toBe('C:\\Program Files\\R\\R-4.5.1')
    expect(prefixFromRscript('/usr/bin/Rscript')).toBe('/usr')
    expect(prefixFromRscript('/Library/Frameworks/R.framework/Versions/4.4-arm64/Resources/bin/Rscript'))
      .toBe('/Library/Frameworks/R.framework/Versions/4.4-arm64')
    expect(prefixFromRscript('C:\\Program Files\\R\\R-4.5.1\\bin\\Rscript.exe'))
      .toBe('C:\\Program Files\\R\\R-4.5.1')
  })

  it('picks platform default standalone-R roots', () => {
    expect(defaultStandaloneRRoots('win32')).toEqual(['C:\\Program Files\\R', 'C:\\Program Files (x86)\\R'])
    expect(defaultStandaloneRRoots('darwin')).toContain('/Library/Frameworks/R.framework/Versions')
    expect(defaultStandaloneRRoots('linux')).toEqual(['/opt/R', '/usr/local', '/usr'])
    expect(isWindowsHost('linux')).toBe(false)
  })

  it('round-trips the pin-cache document', () => {
    const raw = serializePinnedDocument([{ path: '/opt/homebrew/bin/Rscript' }, { path: '/opt/homebrew/bin/Rscript' }])
    expect(parsePinnedDocument(raw)).toEqual([{ path: '/opt/homebrew/bin/Rscript' }])
    expect(parsePinnedDocument('not-json')).toEqual([])
    expect(parsePinnedDocument('[{"path":""},"/usr/bin/Rscript"]')).toEqual([{ path: '/usr/bin/Rscript' }])
  })
})

describe('parseEnvLine', () => {
  it('parses show / clear / wsl / help / list', () => {
    expect(parseEnvLine('')).toEqual({ kind: 'show' })
    expect(parseEnvLine('   ')).toEqual({ kind: 'show' })
    expect(parseEnvLine('clear')).toEqual({ kind: 'clear' })
    expect(parseEnvLine('wsl')).toEqual({ kind: 'wsl' })
    expect(parseEnvLine('help')).toEqual({ kind: 'help' })
    expect(parseEnvLine('list scRNA')).toEqual({ kind: 'list', filter: 'scRNA' })
    expect(parseEnvLine('add /usr/bin/Rscript')).toEqual({ kind: 'add', path: '/usr/bin/Rscript' })
    expect(parseEnvLine('unpin custom:Rscript')).toEqual({ kind: 'unpin', address: 'custom:Rscript' })
    expect(parseEnvLine('add').kind).toBe('error')
    expect(parseEnvLine('unpin').kind).toBe('error')
  })

  it('parses one or more slot assignments', () => {
    expect(parseEnvLine('python=scRNAv2')).toEqual({
      kind: 'assign',
      assignments: [{ slot: 'python', value: 'scRNAv2' }],
    })
    expect(parseEnvLine('python=scRNAv2 r=R-4.4.1 cli=base')).toEqual({
      kind: 'assign',
      assignments: [
        { slot: 'python', value: 'scRNAv2' },
        { slot: 'r', value: 'R-4.4.1' },
        { slot: 'cli', value: 'base' },
      ],
    })
  })

  it('supports clearing a slot and rejects unknown slots/tokens', () => {
    expect(parseEnvLine('python=')).toEqual({ kind: 'assign', assignments: [{ slot: 'python', value: '' }] })
    expect(parseEnvLine('python=scRNAv2')).toEqual({ kind: 'assign', assignments: [{ slot: 'python', value: 'scRNAv2' }] })
    expect(parseEnvLine('julia=1.0').kind).toBe('error')
    expect(parseEnvLine('garbage').kind).toBe('error')
  })
})

describe('slotCompatible / describeEntry', () => {
  it('requires the language interpreter for python and r slots', () => {
    expect(slotCompatible('python', SCRNAV2_ENTRY)).toBe(true)
    expect(slotCompatible('python', R451_ENTRY)).toBe(false)
    expect(slotCompatible('r', SCRNAV2_ENTRY)).toBe(true)
    expect(slotCompatible('r', R451_ENTRY)).toBe(true)
    expect(slotCompatible('cli', R451_ENTRY)).toBe(true)
  })

  it('describes entries with their language badges', () => {
    expect(describeEntry(SCRNAV2_ENTRY)).toContain('conda:scRNAv2')
    expect(describeEntry(SCRNAV2_ENTRY)).toContain('python, R')
    expect(describeEntry(R451_ENTRY)).toContain('r:R-4.5.1')
  })
})

describe('selectionContext', () => {
  it('renders per-language guidance for a multi-slot selection', () => {
    const text = selectionContext({ python: SCRNAV2_ENTRY, r: R451_ENTRY })
    expect(text).toContain('Session Python env')
    expect(text).toContain(SCRNAV2_ENTRY.pythonCommand!)
    expect(text).toContain('Session R env')
    expect(text).toContain(R451_ENTRY.rscriptCommand!)
  })

  it('renders WSL invocation guidance', () => {
    const wsl: EnvEntry = {
      kind: 'wsl',
      name: 'scRNA',
      distro: 'Ubuntu',
      prefix: '/home/u/miniconda3/envs/scRNA',
      python: '/home/u/miniconda3/envs/scRNA/bin/python',
      rscript: null,
      pythonCommand: 'wsl.exe -d Ubuntu -- /home/u/miniconda3/envs/scRNA/bin/python',
    }
    const text = selectionContext({ python: wsl })
    expect(text).toContain('wsl.exe -d Ubuntu -- /home/u/miniconda3/envs/scRNA/bin/python')
    expect(text).toContain('/mnt/c/')
  })

  it('renders cli PATH guidance and an empty selection as empty text', () => {
    expect(cliPathGuidance(SCRNAV2_ENTRY, 'win32')).toContain('$env:PATH')
    expect(cliPathGuidance(SCRNAV2_ENTRY, 'linux')).toContain('export PATH=')
    expect(selectionContext({})).toBe('')
  })
})

describe('apply integration', () => {
  const existing = new Set([
    'C:\\fake\\base\\python.exe',
    'C:\\Users\\u\\.conda\\envs\\scRNAv2\\python.exe',
    'C:\\Users\\u\\.conda\\envs\\scRNAv2\\Scripts\\Rscript.exe',
    'C:\\Program Files\\R\\R-4.5.1\\bin\\Rscript.exe',
  ])

  it('registers the /env command, runtime context, shell facts, and tool', () => {
    const mounted = mountEnvsel(existing)
    expect(mounted.command.handler).toBeTypeOf('function')
    expect(mounted.context.text({})).toBe('')
    expect(mounted.tool.execute).toBeTypeOf('function')
    expect(ENV_SLOTS).toEqual(['python', 'r', 'cli'])
    expect(SESSION_ENV_TOOL).toBe('session_env')
  })

  it('assigns slots through /env and appends the durable selection event', async () => {
    const mounted = mountEnvsel(existing)
    const agent = fakeAgent()

    const result = await mounted.command.handler({ rawInput: 'python=scRNAv2 r=R-4.5.1', agent })
    expect(result).toEqual({ kind: 'success', text: expect.stringContaining('scRNAv2') })
    expect(agent.session.events).toHaveLength(1)
    expect((agent.session.events[0] as { type: string }).type).toBe('envsel/selection')
    const selection = (agent.session.events[0] as { data: { slots: EnvSelection } }).data.slots
    expect(selection.python?.name).toBe('scRNAv2')
    expect(selection.r?.name).toBe('R-4.5.1')

    const text = mounted.context.text({ agent })
    expect(text).toContain('Session Python env')
    expect(text).toContain('Session R env')

    const facts = mounted.contributor.resolve({ agent })
    expect(facts.DSH_ENV_PYTHON).toBe(SCRNAV2_ENTRY.pythonCommand)
    expect(facts.DSH_ENV_RSCRIPT).toBe(R451_ENTRY.rscriptCommand)
    expect(facts.DSH_ENV_CLI_PREFIX).toBeUndefined()
  })

  it('rejects unknown entries and incompatible slots with helpful errors', async () => {
    const mounted = mountEnvsel(existing)
    const agent = fakeAgent()

    const missing = await mounted.command.handler({ rawInput: 'python=nope', agent })
    expect(missing).toEqual({ kind: 'error', text: expect.stringContaining('未找到 "nope"') })

    const incompatible = await mounted.command.handler({ rawInput: 'python=R-4.5.1', agent })
    expect(incompatible).toEqual({ kind: 'error', text: expect.stringContaining('缺少该语言解释器') })

    // The error path appends nothing.
    expect(agent.session.events).toHaveLength(0)
  })

  it('clears slots and lists the catalog', async () => {
    const mounted = mountEnvsel(existing)
    const agent = fakeAgent()

    const list = await mounted.command.handler({ rawInput: 'list', agent })
    expect(list).toEqual({ kind: 'success', text: expect.stringContaining('scRNAv2') })
    expect(list).toEqual({ kind: 'success', text: expect.stringContaining('R-4.5.1') })

    await mounted.command.handler({ rawInput: 'python=scRNAv2', agent })
    const cleared = await mounted.command.handler({ rawInput: 'python=', agent })
    expect(cleared).toEqual({ kind: 'success', text: expect.stringContaining('已更新') })
    expect(mounted.context.text({ agent })).toBe('')
  })

  it('drives the session_env tool: list / get / set / clear', async () => {
    const mounted = mountEnvsel(existing)
    const agent = fakeAgent()

    const listed = await mounted.tool.execute({ action: 'list' }, { agent })
    const entries = (listed as { entries: EnvEntry[] }).entries
    expect(entries.some(entry => entry.name === 'scRNAv2')).toBe(true)
    expect(entries.some(entry => entry.kind === 'r')).toBe(true)

    const set = await mounted.tool.execute({ action: 'set', slot: 'cli', name: 'scRNAv2' }, { agent })
    expect((set as { selection: EnvSelection }).selection.cli?.name).toBe('scRNAv2')
    expect(mounted.contributor.resolve({ agent }).DSH_ENV_CLI_PREFIX).toBe(SCRNAV2_ENTRY.prefix)

    const get = await mounted.tool.execute({ action: 'get' }, { agent })
    expect((get as { selection: EnvSelection }).selection.cli?.name).toBe('scRNAv2')

    await mounted.tool.execute({ action: 'set', slot: 'cli', name: '' }, { agent })
    expect(mounted.context.text({ agent })).toBe('')

    await expect(mounted.tool.execute({ action: 'set', slot: 'python', name: 'R-4.5.1' }, { agent }))
      .rejects.toThrow(/缺少该语言解释器/)
    await expect(mounted.tool.execute({ action: 'set', slot: 'python', name: 'missing' }, { agent }))
      .rejects.toThrow(/未找到环境/)
  })

  it('serves the browser gateway: list / get / set / clear and explicit failures', async () => {
    const mounted = mountEnvsel(existing)
    const agent = fakeAgent()
    const gateway = mounted.ctx.get('envsel') as EnvselRemoteService
    const sessionId = agent.session.header.id as SessionId

    const catalog = await gateway.list()
    expect(catalog.entries.some(entry => entry.name === 'scRNAv2')).toBe(true)
    expect(catalog.entries.some(entry => entry.kind === 'r')).toBe(true)

    const before = gateway.get({ sessionId })
    expect(before.ok && before.value.selection).toEqual({})

    const assigned = await gateway.set({ sessionId, slot: 'python', address: 'conda:scRNAv2' })
    expect(assigned.ok && assigned.value.selection.python?.name).toBe('scRNAv2')
    expect(agent.session.events.some(event => event.type === 'envsel/selection')).toBe(true)

    const after = gateway.get({ sessionId })
    expect(after.ok && after.value.selection.python?.name).toBe('scRNAv2')

    const cleared = await gateway.set({ sessionId, slot: 'python', address: '' })
    expect(cleared.ok && cleared.value.selection.python).toBeUndefined()

    expect(gateway.get({ sessionId: 'missing' as SessionId }).ok).toBe(false)
    expect((await gateway.set({ sessionId: 'missing' as SessionId, slot: 'python', address: 'conda:base' })).ok)
      .toBe(false)
    expect((await gateway.set({ sessionId, slot: 'julia' as EnvSlot, address: 'conda:base' })).ok).toBe(false)
    expect((await gateway.set({ sessionId, slot: 'python', address: 'conda:nope' })).ok).toBe(false)
    expect((await gateway.set({ sessionId, slot: 'python', address: 'r:R-4.5.1' })).ok).toBe(false)
  })

  it('renders help text mentioning every subcommand', () => {
    const help = envHelpText()
    for (const fragment of ['/env list', '/env clear', '/env wsl', '/env help', '/env add', '/env unpin', 'python=']) {
      expect(help).toContain(fragment)
    }
  })

  it('pins a custom interpreter path through /env add and the gateway', async () => {
    const extra = new Set([...existing, 'C:\\opt\\custom\\python.exe'])
    const mounted = mountEnvsel(extra)
    const agent = fakeAgent()
    const added = await mounted.command.handler({ rawInput: 'add C:\\opt\\custom\\python.exe', agent })
    expect(added).toEqual({ kind: 'success', text: expect.stringContaining('custom:') })

    const listed = await mounted.command.handler({ rawInput: 'list custom', agent })
    expect(listed).toEqual({ kind: 'success', text: expect.stringContaining('custom:') })

    const gateway = mounted.ctx.get('envsel') as EnvselRemoteService
    const catalog = await gateway.list()
    expect(catalog.entries.some(entry => entry.kind === 'custom' && entry.python?.endsWith('python.exe'))).toBe(true)

    const unpinned = await gateway.unpin({ address: 'custom:custom' })
    expect(unpinned.ok).toBe(true)
  })

  it('rejects an empty or interpreter-less pin', async () => {
    const mounted = mountEnvsel(existing)
    const agent = fakeAgent()
    expect(await mounted.command.handler({ rawInput: 'add C:\\missing\\python.exe', agent }))
      .toEqual({ kind: 'error', text: expect.stringContaining('路径不存在') })
    await expect(mounted.tool.execute({ action: 'pin', name: '' }, { agent }))
      .rejects.toThrow(/无法添加路径/)
  })
})

describe('discovery on POSIX hosts', () => {
  it('finds a Linux /usr Rscript and a versioned /opt/R install', async () => {
    const ctx = new Context()
    const posixSub = fakeSubprocess({
      '/usr/bin/conda env list --json': { stdout: JSON.stringify({ envs: ['/home/u/miniconda3'] }), exitCode: 0 },
    })
    ctx.provide('subprocess', {
      ...posixSub,
      async resolveExecutable(name: string): Promise<string> {
        if (name === 'conda') return '/usr/bin/conda'
        throw new Error(`not on PATH: ${name}`)
      },
    })
    ctx.provide('fs', fakeFs(new Set([
      '/home/u/miniconda3/bin/python',
      '/usr/bin/Rscript',
      '/opt/R/4.4.1/bin/Rscript',
    ]), {
      directories: new Set(['/opt/R', '/opt/R/4.4.1', '/usr', '/usr/bin', '/home/u/miniconda3', '/home/u/miniconda3/bin']),
    }))
    ctx.provide('timer', { timeout(): () => void { return () => {} } })
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux' })
    try {
      const result = await discoverAll(ctx, {
        condaCommand: 'conda',
        standaloneRRoots: [],
        wslEnabled: true,
        probeTimeoutMs: 1000,
      })
      expect(result.entries.some(entry => entry.kind === 'r' && entry.rscript === '/usr/bin/Rscript')).toBe(true)
      expect(result.entries.some(entry => entry.kind === 'r' && entry.prefix === '/opt/R/4.4.1')).toBe(true)
      expect(result.warnings.some(warning => warning.includes('WSL'))).toBe(false)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('finds a macOS Framework R install', async () => {
    const ctx = new Context()
    const posixSub = fakeSubprocess({
      '/opt/homebrew/bin/conda env list --json': { stdout: JSON.stringify({ envs: [] }), exitCode: 0 },
    })
    ctx.provide('subprocess', {
      ...posixSub,
      async resolveExecutable(name: string): Promise<string> {
        if (name === 'conda') return '/opt/homebrew/bin/conda'
        throw new Error(`not on PATH: ${name}`)
      },
    })
    ctx.provide('fs', fakeFs(new Set([
      '/Library/Frameworks/R.framework/Versions/4.4-arm64/Resources/bin/Rscript',
    ]), {
      directories: new Set([
        '/Library/Frameworks/R.framework/Versions',
        '/Library/Frameworks/R.framework/Versions/4.4-arm64',
        '/Library/Frameworks/R.framework/Versions/4.4-arm64/Resources',
        '/Library/Frameworks/R.framework/Versions/4.4-arm64/Resources/bin',
      ]),
    }))
    ctx.provide('timer', { timeout(): () => void { return () => {} } })
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    try {
      const result = await discoverAll(ctx, {
        condaCommand: 'conda',
        standaloneRRoots: [],
        wslEnabled: true,
        probeTimeoutMs: 1000,
      })
      expect(result.entries.some(entry =>
        entry.kind === 'r' && entry.name === '4.4-arm64' && entry.rscript?.endsWith('/Resources/bin/Rscript'))).toBe(true)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('probes a custom POSIX interpreter path', async () => {
    const ctx = new Context()
    ctx.provide('fs', fakeFs(new Set(['/opt/homebrew/bin/Rscript'])))
    const probed = await probeCustomPath(ctx, '/opt/homebrew/bin/Rscript')
    expect(probed.ok).toBe(true)
    if (probed.ok) {
      expect(probed.entry.kind).toBe('custom')
      expect(probed.entry.rscript).toBe('/opt/homebrew/bin/Rscript')
      expect(probed.entry.prefix).toBe('/opt/homebrew')
    }
  })
})

describe('invariant companion', () => {
  async function mountInvariant(events: unknown[]): Promise<{ failures: string[]; installer: InvariantInstaller | undefined; ctx: Context }> {
    const ctx = new Context()
    const failures: string[] = []
    let installer: InvariantInstaller | undefined
    ctx.provide('invariants', {
      register(_name: string, inst: InvariantInstaller): () => void {
        installer = inst
        return () => {}
      },
    })
    ctx.provide('sessions', {
      list: () => [{ events }],
    })
    await envselInvariant.apply(ctx)
    return { failures, installer, ctx }
  }

  it('flags unknown slots in envsel/selection events', async () => {
    const mounted = await mountInvariant([
      { type: 'envsel/selection', data: { slots: { julia: { kind: 'conda' } } } },
    ])
    const fail = ((message: string): never => {
      mounted.failures.push(message)
      throw new Error(message)
    }) as InvariantFailure
    expect(() => mounted.installer?.(mounted.ctx, fail)).toThrow()
    expect(mounted.failures.some(message => message.includes('unknown slot "julia"'))).toBe(true)
  })

  it('flags malformed entries in envsel/selection events', async () => {
    const mounted = await mountInvariant([
      { type: 'envsel/selection', data: { slots: { python: { kind: 'conda', name: '', prefix: 'C:\\x' } } } },
    ])
    const fail = ((message: string): never => {
      mounted.failures.push(message)
      throw new Error(message)
    }) as InvariantFailure
    expect(() => mounted.installer?.(mounted.ctx, fail)).toThrow()
    expect(mounted.failures.some(message => message.includes('name must be a non-empty string'))).toBe(true)
  })

  it('accepts a well-formed selection event', async () => {
    const mounted = await mountInvariant([
      {
        type: 'envsel/selection',
        data: { slots: { python: { kind: 'conda', name: 'scRNAv2', prefix: 'C:\\envs\\scRNAv2' } } },
      },
    ])
    const fail = ((message: string): never => {
      mounted.failures.push(message)
      throw new Error(message)
    }) as InvariantFailure
    mounted.installer?.(mounted.ctx, fail)
    expect(mounted.failures).toEqual([])
  })
})
