/**
 * envsel — session environment selector for DeepSeek Harness. Per-language
 * slots (`python`, `r`, `cli`) each hold one first-priority environment drawn
 * from conda, standalone R installs, WSL distributions, or user-pinned custom
 * paths. Selections persist in a machine-local JSON store keyed by session id
 * (never the session event log — see state.ts), are injected into every shell
 * call as `DSH_ENV_*` facts, and are changed from the browser via the `/env`
 * command, the `session_env` model tool, or the `envsel` Typert Remote that
 * backs the header dropdown.
 *
 * @module @beihaizb/dsh-envsel
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { BashEnvContributor } from '@deepseek-ai/dsh-shell-env'
import type { DshEnvironmentKey } from '@deepseek-ai/dsh-shell'
import { discoverAll, isWindowsHost, probeCustomPath } from './discover.ts'
import type { DiscoverConfig } from './discover.ts'
import { appendPinnedPath, PINNED_FILE_NAME, removePinnedPath, resolvePinnedEntries } from './pin-cache.ts'
import { EnvselRemoteService } from './remote.ts'
import type { EnvselGatewayHandlers } from './remote.ts'
import { readAllSelections, writeSessionSelection } from './state.ts'
import {
  ENV_SLOTS,
  ENV_SLOT_LABELS,
  isEmptySelection,
} from './types.ts'
import type { EnvEntry, EnvSelection, EnvSlot, SessionId } from './types.ts'
import type {
  EnvselCatalogValue,
  EnvselGetResult,
  EnvselGetValue,
  EnvselPinResult,
  EnvselRejected,
  EnvselSetResult,
  EnvselSuccess,
  EnvselUnpinResult,
} from './types.ts'
export {
  defaultStandaloneRRoots,
  isWindowsHost,
  joinPath,
  prefixFromRscript,
  probeCustomPath,
} from './discover.ts'
export { parsePinnedDocument, PINNED_FILE_NAME, serializePinnedDocument } from './pin-cache.ts'
export { parseStateDocument, serializeStateDocument, STATE_FILE_NAME } from './state.ts'
export type * from './types.ts'
export { EnvselRemoteService } from './remote.ts'
export type { EnvselGatewayHandlers } from './remote.ts'
export type { DiscoverConfig, DiscoverResult } from './discover.ts'

export const name = 'envsel'

/** Hard dependencies: every service ships in the official DSH host plane. */
export const inject = ['subprocess', 'fs', 'shellEnv', 'commands', 'tools', 'timer', 'sessions']

/** Default catalog cache TTL in milliseconds. */
export const LIST_TTL_MS_DEFAULT = 300000

/** Default conda executable name. */
export const CONDA_COMMAND_DEFAULT = 'conda'

/** Default per-probe watchdog timeout in milliseconds. */
export const PROBE_TIMEOUT_MS_DEFAULT = 20000

/** envsel deployment configuration (every field optional; schema defaults apply). */
export interface Config {
  /** Catalog cache TTL in milliseconds. */
  readonly listTtlMs?: number
  /** Conda executable name or absolute path. */
  readonly condaCommand?: string
  /** Extra standalone-R roots scanned after the Program Files defaults. */
  readonly standaloneRRoots?: string[]
  /** Whether WSL discovery is enabled. */
  readonly wslEnabled?: boolean
  /** Whether the `session_env` model tool is registered. */
  readonly registerTool?: boolean
  /** Per-probe hard timeout in milliseconds (watchdog terminate). */
  readonly probeTimeoutMs?: number
}

/** Validated runtime configuration. */
interface ResolvedConfig {
  readonly listTtlMs: number
  readonly condaCommand: string
  readonly standaloneRRoots: readonly string[]
  readonly wslEnabled: boolean
  readonly registerTool: boolean
  readonly probeTimeoutMs: number
}

/** Apply defaults and validate deployment values at the configuration boundary. */
function resolveConfig(input: Config = {}): ResolvedConfig {
  const listTtlMs = input.listTtlMs ?? LIST_TTL_MS_DEFAULT
  const probeTimeoutMs = input.probeTimeoutMs ?? PROBE_TIMEOUT_MS_DEFAULT
  const condaCommand = input.condaCommand ?? CONDA_COMMAND_DEFAULT
  if (!Number.isFinite(listTtlMs) || listTtlMs <= 0) {
    throw new TypeError(`envsel: listTtlMs must be a positive finite number, got ${String(listTtlMs)}`)
  }
  if (!Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= 0) {
    throw new TypeError(`envsel: probeTimeoutMs must be a positive finite number, got ${String(probeTimeoutMs)}`)
  }
  if (condaCommand.trim().length === 0) {
    throw new TypeError('envsel: condaCommand must be non-empty')
  }
  return {
    listTtlMs,
    condaCommand: condaCommand.trim(),
    standaloneRRoots: [...(input.standaloneRRoots ?? [])],
    wslEnabled: input.wslEnabled ?? true,
    registerTool: input.registerTool ?? true,
    probeTimeoutMs,
  }
}

/** Parse one `/env` command line. */
type EnvLineAction =
  | { kind: 'show' }
  | { kind: 'help' }
  | { kind: 'clear' }
  | { kind: 'wsl' }
  | { kind: 'add'; path: string }
  | { kind: 'unpin'; address: string }
  | { kind: 'list'; filter: string }
  | { kind: 'assign'; assignments: ReadonlyArray<{ slot: EnvSlot; value: string }> }
  | { kind: 'error'; text: string }

const ASSIGNMENT = /^([a-z]+)=(.*)$/u

/** Parse the raw input of a `/env` invocation into an action. */
export function parseEnvLine(rawInput: string): EnvLineAction {
  const tokens = rawInput.trim().split(/\s+/u).filter(token => token.length > 0)
  if (tokens.length === 0) return { kind: 'show' }
  const first = tokens[0]!
  if (first === 'help') return { kind: 'help' }
  if (first === 'clear') return { kind: 'clear' }
  if (first === 'wsl') return { kind: 'wsl' }
  if (first === 'add') {
    const path = tokens.slice(1).join(' ').trim()
    if (path.length === 0) return { kind: 'error', text: '用法: /env add <解释器或安装目录的绝对路径>' }
    return { kind: 'add', path }
  }
  if (first === 'unpin') {
    const address = tokens.slice(1).join(' ').trim()
    if (address.length === 0) return { kind: 'error', text: '用法: /env unpin custom:<名> 或 /env unpin <路径>' }
    return { kind: 'unpin', address }
  }
  if (first === 'list') {
    return { kind: 'list', filter: tokens.slice(1).join(' ').trim() }
  }
  const assignments: { slot: EnvSlot; value: string }[] = []
  for (const token of tokens) {
    const match = ASSIGNMENT.exec(token)
    if (match === null) {
      return { kind: 'error', text: `无法识别的参数 "${token}"（应为 slot=值，如 python=scRNAv2）` }
    }
    const slot = match[1] as EnvSlot
    const value = match[2] ?? ''
    if (!ENV_SLOTS.includes(slot)) {
      return { kind: 'error', text: `未知槽位 "${slot}"（可用: ${ENV_SLOTS.join(' / ')}）` }
    }
    assignments.push({ slot, value })
  }
  return { kind: 'assign', assignments }
}

/** Resolve a value into an entry reference against one catalog. */
function resolveEntry(catalog: readonly EnvEntry[], value: string): EnvEntry | null {
  if (value.length === 0) return null
  if (value.includes(':')) {
    const parts = value.split(':')
    if (parts.length === 2) {
      const [kind, name] = parts
      return catalog.find(entry => entry.kind === kind && entry.name === name) ?? null
    }
    if (parts.length === 3 && parts[0] === 'wsl') {
      const [, distro, name] = parts
      return catalog.find(entry => entry.kind === 'wsl' && entry.distro === distro && entry.name === name) ?? null
    }
    return null
  }
  const matches = catalog.filter(entry => entry.name === value)
  if (matches.length === 1) return matches[0]!
  return null
}

/** Whether an entry can serve a slot (its language must be present). */
export function slotCompatible(slot: EnvSlot, entry: EnvEntry): boolean {
  if (slot === 'python') return entry.python !== null
  if (slot === 'r') return entry.rscript !== null
  return true
}

/** Human-readable one-line summary of an entry. */
export function describeEntry(entry: EnvEntry): string {
  const badges = [
    entry.python !== null ? 'python' : null,
    entry.rscript !== null ? 'R' : null,
  ].filter((badge): badge is string => badge !== null)
  const address = entry.kind === 'wsl'
    ? `wsl:${entry.distro}:${entry.name}`
    : `${entry.kind}:${entry.name}`
  return `${address} — ${entry.prefix}${badges.length > 0 ? ` (${badges.join(', ')})` : ''}`
}

/** Render the runtime-context block for one selection. */
export function selectionContext(selection: EnvSelection): string {
  const blocks: string[] = []
  const python = selection.python
  if (python !== undefined) {
    const run = python.pythonCommand ?? python.python ?? `python from ${python.prefix}`
    const lines = [
      `Session Python env (user-selected): ${python.name} (${python.kind}).`,
      `- python: ${run}`,
      `Use it for all Python work in this session: ${run} script.py (absolute path, no activation needed).`,
    ]
    if (python.kind === 'wsl') lines.push('- WSL: pass Windows paths as /mnt/c/<drive>/<path>.')
    blocks.push(lines.join('\n'))
  }
  const r = selection.r
  if (r !== undefined) {
    const run = r.rscriptCommand ?? r.rscript ?? `Rscript from ${r.prefix}`
    const lines = [
      `Session R env (user-selected): ${r.name} (${r.kind}).`,
      `- Rscript: ${run}`,
      `Use it for all R work in this session: ${run} -e / -f file.R.`,
    ]
    if (r.kind === 'wsl') lines.push('- WSL: pass Windows paths as /mnt/c/<drive>/<path>.')
    blocks.push(lines.join('\n'))
  }
  const cli = selection.cli
  if (cli !== undefined) {
    const lines = [
      `Session CLI env (user-selected): ${cli.name} (${cli.kind}) — prepend its dirs to PATH for shell tools:`,
      cliPathGuidance(cli),
    ]
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n\n')
}

/** Usage text for the /env command. */
export function envHelpText(): string {
  return [
    '/env 会话环境选择器（conda / 独立 R / WSL / 手动路径）',
    '  /env                     查看当前选择',
    '  /env help                显示本帮助',
    '  /env python=scRNAv2      设置 Python 槽位（conda 名 / 独立R名 / wsl:发行版:名 / custom:名）',
    '  /env r=R-4.4.1           设置 R 槽位',
    '  /env cli=base            设置 CLI 槽位（PATH 前缀）',
    '  /env python= /env r= /env cli=   清空对应槽位',
    '  /env list [关键词]        列出全部可用环境',
    '  /env add <路径>           把解释器或安装目录记入本机缓存',
    '  /env unpin custom:<名>    从本机缓存移除一条手动路径',
    '  /env clear               清空全部选择',
    '  /env wsl                 重新扫描 WSL（仅 Windows；可能较慢，含发行版冷启动）',
  ].join('\n')
}

/** Display path of the machine-local pin cache. */
function pinnedCacheHint(): string {
  return `~/.dsh/${PINNED_FILE_NAME}`
}

/**
 * PATH-prefix guidance for the CLI slot, matching the host shell family.
 * @param entry - selected CLI environment.
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns one copy-pasteable PATH line for the model snapshot.
 */
export function cliPathGuidance(entry: EnvEntry, platform: NodeJS.Platform = process.platform): string {
  if (entry.kind === 'wsl') {
    return `- wsl.exe -d ${entry.distro} -- bash -lc 'export PATH="${entry.prefix}/bin:$PATH"'`
  }
  if (isWindowsHost(platform)) {
    return `- pwsh: $env:PATH = "${entry.prefix};${entry.prefix}\\Scripts;${entry.prefix}\\Library\\bin;" + $env:PATH`
  }
  return `- bash: export PATH="${entry.prefix}/bin:${entry.prefix}:$PATH"`
}

/** The registered `session_env` tool name. */
export const SESSION_ENV_TOOL = 'session_env'

/** Build one successful Remote reply branch. */
function success<T>(value: T): EnvselSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build one rejected Remote reply branch. */
function rejected<E>(error: E): EnvselRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/**
 * Install the envsel command, prompt context, shell facts, and model tool.
 * @param ctx - registrant context carrying every injected service.
 * @param config - deployment's explicit envsel policy.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = resolveConfig(config)
  const discoverConfig: DiscoverConfig = {
    condaCommand: resolved.condaCommand,
    standaloneRRoots: resolved.standaloneRRoots,
    wslEnabled: resolved.wslEnabled,
    probeTimeoutMs: resolved.probeTimeoutMs,
  }

  // ── catalog cache ──────────────────────────────────────────────────────────
  let catalog: { at: number; entries: EnvEntry[]; warnings: string[] } | null = null
  let catalogPending: Promise<{ entries: EnvEntry[]; warnings: string[] }> | null = null

  async function loadCatalog(): Promise<{ entries: EnvEntry[]; warnings: string[] }> {
    const discovered = await discoverAll(ctx, discoverConfig)
    const pinned = await resolvePinnedEntries(ctx)
    const seen = new Set(discovered.entries.map(entry => `${entry.kind}|${entry.distro ?? ''}|${entry.name}|${entry.prefix}`))
    const entries = [...discovered.entries]
    for (const entry of pinned.entries) {
      const key = `${entry.kind}|${entry.distro ?? ''}|${entry.name}|${entry.prefix}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(entry)
    }
    return { entries, warnings: [...discovered.warnings, ...pinned.warnings] }
  }

  function getCatalog(force: boolean): Promise<{ entries: EnvEntry[]; warnings: string[] }> {
    if (catalogPending !== null) return catalogPending
    if (!force && catalog !== null && Date.now() - catalog.at < resolved.listTtlMs) {
      return Promise.resolve({ entries: catalog.entries, warnings: catalog.warnings })
    }
    catalogPending = loadCatalog()
      .then(result => {
        catalog = { at: Date.now(), entries: result.entries, warnings: result.warnings }
        return { entries: result.entries, warnings: result.warnings }
      })
      .finally(() => {
        catalogPending = null
      })
    return catalogPending
  }

  async function pinPath(path: string): Promise<EnvselPinResult> {
    const probed = await probeCustomPath(ctx, path)
    if (!probed.ok) return rejected({ code: probed.code, path: path.trim() })
    await appendPinnedPath(ctx, path)
    const result = await getCatalog(true)
    return success<EnvselCatalogValue>({ entries: result.entries, warnings: result.warnings })
  }

  async function unpinPath(address: string): Promise<EnvselUnpinResult> {
    const current = await getCatalog(false)
    const removed = await removePinnedPath(ctx, address, current.entries)
    if (!removed) return rejected({ code: 'entry-not-found', address })
    const result = await getCatalog(true)
    return success<EnvselCatalogValue>({ entries: result.entries, warnings: result.warnings })
  }

  // ── per-session selection: in-memory map preloaded from the durable store ──
  const selections = new Map<string, EnvSelection>()

  function liveSession(sessionId: SessionId): ReturnType<typeof ctx.sessions.get> {
    return ctx.sessions.get(sessionId)
  }

  function selectionOfSession(sessionId: SessionId): EnvSelection {
    return selections.get(String(sessionId)) ?? {}
  }

  function selectionOf(agent: Agent): EnvSelection {
    return selectionOfSession(agent.session.header.id)
  }

  async function setSelectionForSession(sessionId: SessionId, next: EnvSelection): Promise<void> {
    if (isEmptySelection(next)) {
      selections.delete(String(sessionId))
    } else {
      selections.set(String(sessionId), next)
    }
    await writeSessionSelection(ctx, sessionId, next)
  }

  async function setSelection(agent: Agent, next: EnvSelection): Promise<void> {
    await setSelectionForSession(agent.session.header.id, next)
  }

  function copySelection(agent: Agent): EnvSelection {
    return { ...selectionOf(agent) }
  }

  // Preload durable selections into memory so every synchronous read path
  // (the DSH_ENV_* resolve, command/tool/remote handlers) sees the same state.
  {
    const stored = await readAllSelections(ctx)
    for (const [key, value] of Object.entries(stored)) selections.set(key, value)
  }

  // ── browser gateway: shares the catalog cache and selection state ───────────
  const gatewayHandlers: EnvselGatewayHandlers = {
    list: async () => {
      const result = await getCatalog(false)
      return { entries: result.entries, warnings: result.warnings }
    },
    get: (sessionId: SessionId): EnvselGetResult => {
      if (liveSession(sessionId) === undefined) {
        return rejected({ code: 'session-not-found', sessionId })
      }
      return success<EnvselGetValue>({ selection: selectionOfSession(sessionId) })
    },
    pin: (path: string) => pinPath(path),
    unpin: (address: string) => unpinPath(address),
    set: async (sessionId: SessionId, slot: EnvSlot, address: string): Promise<EnvselSetResult> => {
      if (liveSession(sessionId) === undefined) {
        return rejected({ code: 'session-not-found', sessionId })
      }
      if (!(ENV_SLOTS as readonly string[]).includes(slot)) {
        return rejected({ code: 'unknown-slot', sessionId, slot })
      }
      const next: EnvSelection = { ...selectionOfSession(sessionId) }
      if (address.length === 0) {
        delete next[slot]
      } else {
        const result = await getCatalog(false)
        const entry = resolveEntry(result.entries, address)
        if (entry === null) {
          return rejected({ code: 'entry-not-found', sessionId, slot, address })
        }
        if (!slotCompatible(slot, entry)) {
          return rejected({ code: 'incompatible', sessionId, slot, address })
        }
        next[slot] = entry
      }
      await setSelectionForSession(sessionId, next)
      return success<EnvselGetValue>({ selection: next })
    },
  }
  // The TypertRemoteService constructor provides the `envsel` service itself;
  // the api gateway resolves it from the live Context on every invocation.
  new EnvselRemoteService(ctx, gatewayHandlers)

  // ── /env command ────────────────────────────────────────────────────────────
  ctx.effect(() => ctx.commands.register({
    name: 'env',
    description: '选择本会话的 conda / 独立 R / WSL / 手动路径环境（如 /env python=scRNAv2 r=R-4.4.1）',
    input: { hint: 'python=scRNAv2 r=R-4.4.1 | list [过滤] | add <路径> | unpin custom:<名> | clear | wsl | help' },
    handler: (invocation: CommandInvocation): Promise<CommandResult> => handleEnvLine(invocation),
  }), 'envsel: /env command')

  async function handleEnvLine(invocation: CommandInvocation): Promise<CommandResult> {
    const action = parseEnvLine(invocation.rawInput)
    try {
      switch (action.kind) {
        case 'error':
          return { kind: 'error', text: action.text }
        case 'help':
          return { kind: 'success', text: envHelpText() }
        case 'show': {
          return { kind: 'success', text: renderSelection(selectionOf(invocation.agent)) }
        }
        case 'clear': {
          await setSelection(invocation.agent, {})
          return { kind: 'success', text: '已清空全部环境选择。' }
        }
        case 'wsl': {
          if (!isWindowsHost()) {
            return { kind: 'success', text: '当前宿主不是 Windows，已跳过 WSL 扫描。可用 /env add <路径> 手动添加环境。' }
          }
          const result = await getCatalog(true)
          const wslEntries = result.entries.filter(entry => entry.kind === 'wsl')
          const lines = [
            `WSL 扫描完成（${wslEntries.length} 个条目）:`,
            ...wslEntries.map(entry => `  ${describeEntry(entry)}`),
            ...(wslEntries.length === 0 ? ['  （未发现 WSL 环境）'] : []),
            ...result.warnings.map(warning => `  ⚠ ${warning}`),
          ]
          return { kind: 'success', text: lines.join('\n') }
        }
        case 'add': {
          const pinned = await pinPath(action.path)
          if (!pinned.ok) {
            const reason = pinned.error.code === 'invalid-path'
              ? '路径为空'
              : pinned.error.code === 'not-found'
                ? '路径不存在'
                : '未找到 python / Rscript'
            return { kind: 'error', text: `无法添加 "${action.path}"：${reason}` }
          }
          const added = pinned.value.entries.filter(entry => entry.kind === 'custom')
          return {
            kind: 'success',
            text: [
              `已记入本机缓存（${pinnedCacheHint()}）:`,
              ...added.map(entry => `  ${describeEntry(entry)}`),
            ].join('\n'),
          }
        }
        case 'unpin': {
          const removed = await unpinPath(action.address)
          if (!removed.ok) {
            return { kind: 'error', text: `未找到手动路径 "${action.address}"` }
          }
          return { kind: 'success', text: `已从本机缓存移除 ${action.address}` }
        }
        case 'list': {
          const result = await getCatalog(false)
          const filter = action.filter.toLowerCase()
          const entries = filter.length === 0
            ? result.entries
            : result.entries.filter(entry =>
              entry.name.toLowerCase().includes(filter) || entry.prefix.toLowerCase().includes(filter))
          const lines = [
            `可用环境（${entries.length} 个${filter.length > 0 ? `，过滤 "${action.filter}"` : ''}）:`,
            ...entries.map(entry => `  ${describeEntry(entry)}`),
            ...result.warnings.map(warning => `  ⚠ ${warning}`),
          ]
          return { kind: 'success', text: lines.join('\n') }
        }
        case 'assign': {
          const result = await getCatalog(false)
          const next = copySelection(invocation.agent)
          const applied: string[] = []
          for (const assignment of action.assignments) {
            if (assignment.value.length === 0) {
              delete next[assignment.slot]
              applied.push(`${ENV_SLOT_LABELS[assignment.slot]} → 未设置`)
              continue
            }
            const entry = resolveEntry(result.entries, assignment.value)
            if (entry === null) {
              const candidates = result.entries.filter(candidate => candidate.name === assignment.value)
              const hint = candidates.length > 0
                ? `名称有歧义，请用完整地址: ${candidates.map(describeEntry).join('；')}`
                : `未找到 "${assignment.value}"，可用 /env list 查看`
              return { kind: 'error', text: `${ENV_SLOT_LABELS[assignment.slot]} 槽位设置失败: ${hint}` }
            }
            if (!slotCompatible(assignment.slot, entry)) {
              return {
                kind: 'error',
                text: `${ENV_SLOT_LABELS[assignment.slot]} 槽位不能使用 ${describeEntry(entry)}（缺少该语言解释器）`,
              }
            }
            next[assignment.slot] = entry
            applied.push(`${ENV_SLOT_LABELS[assignment.slot]} → ${entry.name} (${entry.kind})`)
          }
          await setSelection(invocation.agent, next)
          return { kind: 'success', text: `已更新:\n${applied.map(line => `  ${line}`).join('\n')}` }
        }
      }
    } catch (error) {
      return { kind: 'error', text: `envsel: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  /** Render the current selection as command text. */
  function renderSelection(selection: EnvSelection): string {
    if (isEmptySelection(selection)) {
      return ['当前未选择任何环境。', '用法: /env python=scRNAv2 r=R-4.4.1 cli=base，/env list 查看全部可用环境。'].join('\n')
    }
    const lines = ['当前会话环境:']
    for (const slot of ENV_SLOTS) {
      const entry = selection[slot]
      lines.push(entry === undefined
        ? `  ${ENV_SLOT_LABELS[slot]} → （未设置）`
        : `  ${ENV_SLOT_LABELS[slot]} → ${describeEntry(entry)}`)
    }
    lines.push('用法: /env help')
    return lines.join('\n')
  }

  // ── DSH_ENV_* shell facts ───────────────────────────────────────────────────
  const DSH_ENV_PYTHON = 'DSH_ENV_PYTHON' as DshEnvironmentKey
  const DSH_ENV_RSCRIPT = 'DSH_ENV_RSCRIPT' as DshEnvironmentKey
  const DSH_ENV_CLI_PREFIX = 'DSH_ENV_CLI_PREFIX' as DshEnvironmentKey

  const contributor: BashEnvContributor = {
    name: 'envsel',
    variables: {
      [DSH_ENV_PYTHON]: { description: 'Absolute python invocation of the session\'s selected Python environment.' },
      [DSH_ENV_RSCRIPT]: { description: 'Absolute Rscript invocation of the session\'s selected R environment.' },
      [DSH_ENV_CLI_PREFIX]: { description: 'Install prefix of the session\'s selected CLI environment (wsl:distro:prefix for WSL).' },
    },
    resolve(execution) {
      const agent = execution?.agent
      if (agent === undefined) return {}
      const selection = selectionOf(agent)
      const out: Partial<Record<DshEnvironmentKey, string>> = {}
      const python = selection.python
      if (python?.pythonCommand !== undefined && python.pythonCommand !== null) {
        out[DSH_ENV_PYTHON] = python.pythonCommand
      }
      const r = selection.r
      if (r?.rscriptCommand !== undefined && r.rscriptCommand !== null) {
        out[DSH_ENV_RSCRIPT] = r.rscriptCommand
      }
      const cli = selection.cli
      if (cli !== undefined) {
        out[DSH_ENV_CLI_PREFIX] = cli.kind === 'wsl'
          ? `wsl:${cli.distro}:${cli.prefix}`
          : cli.prefix
      }
      return out
    },
  }
  ctx.effect(() => ctx.shellEnv.register(contributor), 'envsel: shell facts')

  // ── session_env model tool ──────────────────────────────────────────────────
  if (resolved.registerTool) {
    ctx.tools.register(defineTool({
      name: SESSION_ENV_TOOL,
      description: 'Manage the environments selected for the current session (Jupyter-kernel-style): per-language slots python/r/cli, each holding one conda, standalone R, WSL, or user-pinned custom entry. action=list enumerates all entries; action=get returns the current selection; action=set assigns one slot (slot required, name="" clears that slot; kind is an optional disambiguation hint); action=pin remembers a host interpreter/install path in the machine-local cache (name = path); action=unpin forgets a cached path (name = custom:<name> or the original path). Takes effect from the next model turn via DSH_ENV_* shell variables.',
      parameters: {
        action: { type: 'string', required: true, enum: ['list', 'get', 'set', 'pin', 'unpin'], description: 'Operation to perform.' },
        slot: { type: 'string', enum: ['python', 'r', 'cli'], description: 'Slot to assign for action=set.' },
        kind: { type: 'string', enum: ['conda', 'r', 'wsl', 'custom'], description: 'Entry-kind disambiguation hint for action=set.' },
        name: { type: 'string', description: 'Entry name for action=set (empty clears); host path for action=pin; custom:<name> or path for action=unpin.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec) {
        const action = args.action
        if (action === 'list') {
          const result = await getCatalog(false)
          return { entries: [...result.entries], warnings: [...result.warnings] }
        }
        if (action === 'pin') {
          const path = typeof args.name === 'string' ? args.name.trim() : ''
          const pinned = await pinPath(path)
          if (!pinned.ok) {
            throw new Error(`session_env: 无法添加路径 ${JSON.stringify(path)}（${pinned.error.code}）`)
          }
          return { entries: [...pinned.value.entries], warnings: [...pinned.value.warnings] }
        }
        if (action === 'unpin') {
          const address = typeof args.name === 'string' ? args.name.trim() : ''
          const removed = await unpinPath(address)
          if (!removed.ok) {
            throw new Error(`session_env: 未找到手动路径 ${JSON.stringify(address)}`)
          }
          return { entries: [...removed.value.entries], warnings: [...removed.value.warnings] }
        }
        if (exec.agent === undefined) throw new Error('session_env requires an owning agent session')
        const agent = exec.agent
        if (action === 'get') return { selection: selectionOf(agent) }
        if (action === 'set') {
          const slot = args.slot as EnvSlot | undefined
          if (slot === undefined || !ENV_SLOTS.includes(slot)) {
            throw new Error(`session_env: unknown slot ${JSON.stringify(slot)} (use python | r | cli)`)
          }
          const name = typeof args.name === 'string' ? args.name.trim() : ''
          const next = copySelection(agent)
          if (name.length === 0) {
            delete next[slot]
          } else {
            const result = await getCatalog(false)
            const kindHint = args.kind
            const entry = typeof kindHint === 'string' && kindHint.length > 0
              ? result.entries.find(candidate => candidate.kind === kindHint && candidate.name === name) ?? null
              : resolveEntry(result.entries, name)
            if (entry === null) {
              throw new Error(`session_env: 未找到环境 ${JSON.stringify(name)}（可用 /env list 或 session_env list 查看）`)
            }
            if (!slotCompatible(slot, entry)) {
              throw new Error(`session_env: ${slot} 槽位不能使用 ${describeEntry(entry)}（缺少该语言解释器）`)
            }
            next[slot] = entry
          }
          await setSelection(agent, next)
          return { selection: next }
        }
        throw new Error(`session_env: unknown action ${JSON.stringify(action)}`)
      },
      presentCall: args => ({
        card: 'generic',
        title: 'Session environment',
        kind: 'other',
        rawInput: args.action === 'set' || args.action === 'pin' || args.action === 'unpin'
          ? `${String(args.action)} ${String(args.slot ?? '')} ${String(args.name ?? '')}`.trim()
          : String(args.action),
      }),
    }))
  }
}
