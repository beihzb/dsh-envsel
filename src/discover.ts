/**
 * Environment discovery for envsel: conda environments, standalone R
 * installations, and WSL distributions. All discovery goes through the
 * injected `subprocess` and `fs` services — never node:child_process — so the
 * package stays on the harness's process-sandbox seam and its spawns are
 * tree-scoped and observable.
 *
 * @module @deepseek-ai/dsh-envsel/discover
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-fs'
import type { EnvEntry } from './types.ts'

/** Timer-service surface used by the probe watchdog (inject: ['timer']). */
type TimerService = { timeout(callback: () => void, delay: number): () => void }

/** Discovery timeout policy shared by every subprocess probe. */
export interface DiscoverConfig {
  /** Conda executable name or absolute path (default `conda`). */
  readonly condaCommand: string
  /** Extra standalone-R roots scanned after the Program Files defaults. */
  readonly standaloneRRoots: readonly string[]
  /** Whether WSL discovery is enabled at all. */
  readonly wslEnabled: boolean
  /** Per-probe hard timeout in milliseconds (watchdog terminate). */
  readonly probeTimeoutMs: number
}

/** Result of one discovery pass: entries plus human-readable warnings. */
export interface DiscoverResult {
  readonly entries: EnvEntry[]
  readonly warnings: string[]
}

/** Base conda install root reported first by `conda env list`. */
function isBaseRoot(index: number): boolean {
  return index === 0
}

/** Last path segment of a Windows or POSIX path. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(part => part.length > 0)
  return parts.length > 0 ? parts[parts.length - 1] ?? path : path
}

/**
 * True when the host is Windows (WSL and Program Files live here only).
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns whether the platform is `win32`.
 */
export function isWindowsHost(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
}

/**
 * Join one parent and one child using the host's path separator.
 * @param parent - existing prefix; a trailing slash is stripped.
 * @param child - single path segment to append.
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns `parent` + separator + `child`.
 */
export function joinPath(parent: string, child: string, platform: NodeJS.Platform = process.platform): string {
  const sep = isWindowsHost(platform) ? '\\' : '/'
  if (parent.length === 0) return child
  const trimmed = parent.replace(/[\\/]+$/u, '')
  return `${trimmed}${sep}${child}`
}

/**
 * Reconstruct an install prefix from an absolute Rscript path, keeping the
 * original separator and a POSIX leading slash.
 * @param rscript - absolute interpreter path (python or Rscript).
 * @returns the install prefix above `bin` / `Scripts` / `Resources`.
 */
export function prefixFromRscript(rscript: string): string {
  const posix = rscript.includes('/') && !rscript.includes('\\')
  const sep = posix ? '/' : '\\'
  const absolute = posix && rscript.startsWith('/')
  const parts = rscript.split(/[\\/]+/).filter(part => part.length > 0)
  let index = parts.length - 1
  while (index > 0) {
    const segment = parts[index]!.toLowerCase()
    if (segment === 'rscript.exe' || segment === 'rscript' || segment === 'python.exe'
      || segment === 'python' || segment === 'python3' || segment === 'bin'
      || segment === 'x64' || segment === 'scripts' || segment === 'resources') {
      index -= 1
      continue
    }
    break
  }
  const joined = parts.slice(0, index + 1).join(sep)
  return absolute ? `/${joined}` : joined
}

/**
 * Default standalone-R scan roots for the host platform (missing roots are skipped).
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns the platform's well-known R install roots.
 */
export function defaultStandaloneRRoots(platform: NodeJS.Platform = process.platform): readonly string[] {
  if (platform === 'win32') return ['C:\\Program Files\\R', 'C:\\Program Files (x86)\\R']
  if (platform === 'darwin') {
    return [
      '/Library/Frameworks/R.framework/Versions',
      '/opt/homebrew/opt/r',
      '/usr/local/opt/r',
    ]
  }
  return ['/opt/R', '/usr/local', '/usr']
}

/**
 * Spawn one argv and collect bounded stdout/stderr, terminating after
 * `timeoutMs`. Returns `{ exitCode, stdout, stderr }`.
 */
export async function runProbe(
  ctx: Context,
  argv: readonly string[],
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const timer = ctx.get('timer') as TimerService | undefined
  const handle = ctx.subprocess.spawn({
    argv: [...argv],
    cwd: process.cwd(),
    stdio: { stdin: 'ignore', stdout: { maxBytes: 1 << 20 }, stderr: { maxBytes: 65536 } },
    graceMs: 5000,
  })
  const stopWatchdog = timer !== undefined
    ? timer.timeout(() => {
      try {
        handle.terminate()
      } catch (_terminateFailure) {
        // Termination is best-effort; the done promise settles regardless.
      }
    }, timeoutMs)
    : () => {}
  try {
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    return { exitCode: outcome.exitCode, stdout, stderr }
  } finally {
    stopWatchdog()
  }
}

/** Probe `ctx.fs` for the first existing candidate path, or null. */
export async function firstExisting(ctx: Context, candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const target = await ctx.fs.resolve(candidate)
      const info = await ctx.fs.stat(target)
      if (info !== undefined) return candidate
    } catch (_statFailure) {
      // Missing or unreadable paths are ordinary negatives.
    }
  }
  return null
}

/** Build a conda entry with its probed interpreters. */
async function condaEntry(ctx: Context, index: number, prefix: string): Promise<EnvEntry> {
  const python = await firstExisting(ctx, [prefix + '\\python.exe', prefix + '/python.exe', prefix + '/bin/python'])
  const rscript = await firstExisting(ctx, [
    prefix + '\\Library\\bin\\Rscript.exe',
    prefix + '\\Scripts\\Rscript.exe',
    prefix + '/bin/Rscript',
  ])
  const entry: EnvEntry = {
    kind: 'conda',
    name: isBaseRoot(index) ? 'base' : baseName(prefix),
    prefix,
    python,
    rscript,
    ...(python !== null ? { pythonCommand: python } : {}),
    ...(rscript !== null ? { rscriptCommand: rscript } : {}),
  }
  return entry
}

/** Discover conda environments via `conda env list --json`. */
export async function discoverConda(ctx: Context, config: DiscoverConfig): Promise<{ entries: EnvEntry[]; error?: string }> {
  let condaExe: string | null = null
  try {
    condaExe = await ctx.subprocess.resolveExecutable(config.condaCommand)
  } catch (_resolveFailure) {
    condaExe = null
  }
  // A resolved bare command is preferred; a Windows .bat/.cmd wrapper cannot
  // be spawned directly by Node, so route it through cmd.exe /c.
  const argv = condaExe !== null && !/\.(bat|cmd)$/i.test(condaExe)
    ? [condaExe, 'env', 'list', '--json']
    : process.platform === 'win32'
      ? ['cmd.exe', '/d', '/c', config.condaCommand, 'env', 'list', '--json']
      : [config.condaCommand, 'env', 'list', '--json']
  let probe: { exitCode: number | null; stdout: string; stderr: string }
  try {
    probe = await runProbe(ctx, argv, config.probeTimeoutMs)
  } catch (error) {
    return { entries: [], error: `conda 环境列举失败（需要 ${config.condaCommand} 在 PATH 上）: ${String(error)}` }
  }
  if (probe.exitCode !== 0) {
    const detail = probe.stderr.trim().slice(0, 300)
    return { entries: [], error: `conda env list 退出码 ${String(probe.exitCode)}${detail.length > 0 ? ` - ${detail}` : ''}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(probe.stdout)
  } catch (error) {
    return { entries: [], error: `conda env list 输出无法解析: ${String(error)}` }
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray((parsed as { envs?: unknown }).envs)) {
    return { entries: [], error: 'conda env list 输出结构异常（缺少 envs 数组）' }
  }
  const prefixes = (parsed as { envs: unknown[] }).envs.filter((item): item is string => typeof item === 'string' && item.length > 0)
  const entries = await Promise.all(prefixes.map((prefix, index) => condaEntry(ctx, index, prefix)))
  return { entries }
}

/** Rscript candidates under one install prefix (Windows and POSIX layouts). */
function rscriptCandidates(prefix: string): string[] {
  return [
    `${prefix}\\bin\\Rscript.exe`,
    `${prefix}\\bin\\x64\\Rscript.exe`,
    `${prefix}/bin/Rscript`,
    `${prefix}/Resources/bin/Rscript`,
  ]
}

/** Python candidates under one install prefix (Windows and POSIX layouts). */
function pythonCandidates(prefix: string): string[] {
  return [
    `${prefix}\\python.exe`,
    `${prefix}/python.exe`,
    `${prefix}/bin/python`,
    `${prefix}/bin/python3`,
  ]
}

/** Build a standalone-R entry from an install root. */
async function makeRInstall(ctx: Context, prefix: string): Promise<EnvEntry | null> {
  const rscript = await firstExisting(ctx, rscriptCandidates(prefix))
  if (rscript === null) return null
  return {
    kind: 'r',
    name: standaloneRName(prefix),
    prefix,
    python: null,
    rscript,
    rscriptCommand: rscript,
  }
}

/** Display name for a standalone R prefix (`R-4.5.1`, `4.4-arm64`, `usr`). */
function standaloneRName(prefix: string): string {
  const leaf = baseName(prefix)
  if (leaf.length === 0 || leaf === 'Current' || leaf === 'Resources') {
    const parent = prefix.replace(/[\\/]+(?:Current|Resources)$/u, '')
    return baseName(parent) || leaf || 'R'
  }
  return leaf
}

/** Whether a child directory name looks like an R version install. */
function looksLikeRVersionDir(name: string): boolean {
  return /^R-\d/i.test(name) || /^\d+\.\d/u.test(name)
}

/**
 * Whether a root is a version container (`…/R`, `…/Versions`) rather than a
 * single prefix such as `/usr`. Containers are listed; prefixes are probed
 * in place so a Linux catalog does not walk all of `/usr`.
 */
function isRVersionContainer(root: string): boolean {
  const leaf = baseName(root)
  return /^R$/i.test(leaf) || /^versions$/i.test(leaf)
}

/** Scan one directory for versioned R installs, or treat the directory itself as one. */
async function scanRRoot(ctx: Context, root: string): Promise<EnvEntry[]> {
  const self = await makeRInstall(ctx, root)
  if (!isRVersionContainer(root)) return self !== null ? [self] : []
  let children: { name: string; type: string }[] = []
  try {
    const target = await ctx.fs.resolve(root)
    const entries = await ctx.fs.listDir(target)
    children = entries.map(entry => ({ name: entry.name, type: entry.type }))
  } catch (_listFailure) {
    return self !== null ? [self] : []
  }
  const found: EnvEntry[] = []
  for (const child of children) {
    if (child.type !== 'directory') continue
    if (looksLikeRVersionDir(child.name)) {
      const install = await makeRInstall(ctx, joinPath(root, child.name))
      if (install !== null) found.push(install)
    }
  }
  if (found.length === 0 && self !== null) found.push(self)
  return found
}

/** Discover standalone R installations: platform defaults, PATH, and configured roots. */
export async function discoverStandaloneR(ctx: Context, config: DiscoverConfig): Promise<EnvEntry[]> {
  const found: EnvEntry[] = []
  const seen = new Set<string>()
  const roots = [...defaultStandaloneRRoots(), ...config.standaloneRRoots]
  for (const root of roots) {
    for (const install of await scanRRoot(ctx, root)) {
      const key = install.prefix.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      found.push(install)
    }
  }
  // PATH Rscript not owned by a conda env dir.
  let onPath: string | null = null
  try {
    onPath = await ctx.subprocess.resolveExecutable('Rscript')
  } catch (_resolveFailure) {
    onPath = null
  }
  if (onPath !== null) {
    const lower = onPath.toLowerCase()
    const isConda = lower.includes('\\envs\\') || lower.includes('/envs/')
    const known = [...seen].some(prefix => onPath!.toLowerCase().startsWith(prefix))
    if (!isConda && !known) {
      const install = await makeRInstall(ctx, prefixFromRscript(onPath))
      if (install !== null && !seen.has(install.prefix.toLowerCase())) {
        seen.add(install.prefix.toLowerCase())
        found.push(install)
      }
    }
  }
  return found
}

/**
 * List WSL distributions via `wsl.exe --list --quiet`. WSL writes UTF-16LE to
 * stdout on Windows; decode accordingly. A non-zero exit or empty list means
 * WSL is unavailable.
 */
export async function wslDistros(ctx: Context, config: DiscoverConfig): Promise<{ distros: string[]; error?: string }> {
  if (!config.wslEnabled || !isWindowsHost()) return { distros: [] }
  let probe: { exitCode: number | null; stdout: string; stderr: string }
  try {
    probe = await runProbe(ctx, ['wsl.exe', '--list', '--quiet'], config.probeTimeoutMs)
  } catch (error) {
    return { distros: [], error: `WSL 不可用: ${String(error)}` }
  }
  if (probe.exitCode !== 0) {
    const detail = probe.stderr.trim().slice(0, 300)
    return { distros: [], error: `wsl --list 退出码 ${String(probe.exitCode)}${detail.length > 0 ? ` - ${detail}` : ''}` }
  }
  // wsl.exe emits UTF-16LE (including a BOM) on Windows; treat the bytes as
  // such when the output is not valid UTF-8.
  let text = probe.stdout
  if (process.platform === 'win32') {
    try {
      const decoder = new TextDecoder('utf-16le', { fatal: true })
      const bytes = Buffer.from(text, 'binary')
      text = decoder.decode(bytes)
    } catch {
      // Already UTF-8 (e.g. non-Windows or a patched wsl) — keep as-is.
    }
  }
  const distros = text
    .replace(/\u0000/g, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^[*\s]*$/.test(line))
  return { distros }
}

/** Probe one WSL distribution for conda environments and system interpreters. */
export async function discoverWslDistro(
  ctx: Context,
  config: DiscoverConfig,
  distro: string,
): Promise<{ entries: EnvEntry[]; error?: string }> {
  // One shell line: report conda env prefixes, or a sentinel when conda is absent.
  const script = 'command -v conda >/dev/null 2>&1 && conda env list --json || printf "__NO_CONDA__"'
  let probe: { exitCode: number | null; stdout: string; stderr: string }
  try {
    probe = await runProbe(ctx, ['wsl.exe', '-d', distro, '--', 'sh', '-lc', script], config.probeTimeoutMs)
  } catch (error) {
    return { entries: [], error: `${distro}: WSL 探测失败: ${String(error)}` }
  }
  if (probe.exitCode !== 0) {
    return { entries: [], error: `${distro}: 探测退出码 ${String(probe.exitCode)}: ${probe.stderr.trim().slice(0, 300)}` }
  }
  const stdout = probe.stdout.trim()
  if (stdout === '__NO_CONDA__') {
    // Still offer the distro's system python/Rscript when present.
    const system = await probeDistroSystem(ctx, config, distro)
    return { entries: system }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    return { entries: [], error: `${distro}: conda env list 输出无法解析: ${String(error)}` }
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray((parsed as { envs?: unknown }).envs)) {
    return { entries: [], error: `${distro}: 输出结构异常` }
  }
  const prefixes = (parsed as { envs: unknown[] }).envs.filter((item): item is string => typeof item === 'string' && item.length > 0)
  const entries: EnvEntry[] = []
  for (const [index, prefix] of prefixes.entries()) {
    const entry = await probeWslEntry(ctx, config, distro, index, prefix)
    if (entry !== null) entries.push(entry)
  }
  return { entries }
}

/** Probe one Linux prefix for python/Rscript via a single sh -lc. */
async function probeWslEntry(
  ctx: Context,
  config: DiscoverConfig,
  distro: string,
  index: number,
  prefix: string,
): Promise<EnvEntry | null> {
  const script = [
    'for p in',
    `${JSON.stringify(prefix + '/bin/python')}`,
    `${JSON.stringify(prefix + '/bin/Rscript')}`,
    '; do test -x "$p" && printf "%s\\n" "$p"; done',
  ].join(' ')
  let probe: { exitCode: number | null; stdout: string; stderr: string }
  try {
    probe = await runProbe(ctx, ['wsl.exe', '-d', distro, '--', 'sh', '-lc', script], config.probeTimeoutMs)
  } catch (_probeFailure) {
    return null
  }
  if (probe.exitCode !== 0) return null
  const present = new Set(probe.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0))
  const python = present.has(prefix + '/bin/python') ? prefix + '/bin/python' : null
  const rscript = present.has(prefix + '/bin/Rscript') ? prefix + '/bin/Rscript' : null
  if (python === null && rscript === null) return null
  return {
    kind: 'wsl',
    name: isBaseRoot(index) ? 'base' : baseName(prefix),
    prefix,
    python,
    rscript,
    distro,
    ...(python !== null ? { pythonCommand: `wsl.exe -d ${distro} -- ${python}` } : {}),
    ...(rscript !== null ? { rscriptCommand: `wsl.exe -d ${distro} -- ${rscript}` } : {}),
  }
}

/** Offer the distro's system python3/Rscript when conda is absent. */
async function probeDistroSystem(ctx: Context, config: DiscoverConfig, distro: string): Promise<EnvEntry[]> {
  const script = [
    'for p in /usr/bin/python3 /usr/bin/Rscript; do test -x "$p" && printf "%s\\n" "$p"; done',
  ].join(' ')
  let probe: { exitCode: number | null; stdout: string; stderr: string }
  try {
    probe = await runProbe(ctx, ['wsl.exe', '-d', distro, '--', 'sh', '-lc', script], config.probeTimeoutMs)
  } catch (_probeFailure) {
    return []
  }
  if (probe.exitCode !== 0) return []
  const present = probe.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
  if (present.length === 0) return []
  const python = present.includes('/usr/bin/python3') ? '/usr/bin/python3' : null
  const rscript = present.includes('/usr/bin/Rscript') ? '/usr/bin/Rscript' : null
  if (python === null && rscript === null) return []
  const prefix = '/usr'
  return [{
    kind: 'wsl',
    name: 'system',
    prefix,
    python,
    rscript,
    distro,
    ...(python !== null ? { pythonCommand: `wsl.exe -d ${distro} -- ${python}` } : {}),
    ...(rscript !== null ? { rscriptCommand: `wsl.exe -d ${distro} -- ${rscript}` } : {}),
  }]
}

/** Full discovery pass used by the catalog cache. */
export async function discoverAll(ctx: Context, config: DiscoverConfig): Promise<DiscoverResult> {
  const warnings: string[] = []
  const entries: EnvEntry[] = []

  const conda = await discoverConda(ctx, config)
  if (conda.error !== undefined) warnings.push(conda.error)
  entries.push(...conda.entries)

  const standalone = await discoverStandaloneR(ctx, config)
  entries.push(...standalone)

  if (config.wslEnabled && isWindowsHost()) {
    const distros = await wslDistros(ctx, config)
    if (distros.error !== undefined) {
      warnings.push(distros.error)
    } else {
      for (const distro of distros.distros) {
        const result = await discoverWslDistro(ctx, config, distro)
        if (result.error !== undefined) warnings.push(result.error)
        entries.push(...result.entries)
      }
    }
  }

  // Deduplicate by kind+name+prefix (WSL entries also by distro).
  const seen = new Set<string>()
  const deduped: EnvEntry[] = []
  for (const entry of entries) {
    const key = `${entry.kind}|${entry.distro ?? ''}|${entry.name}|${entry.prefix}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(entry)
  }
  return { entries: deduped, warnings }
}

/** Why a user-supplied path could not become a catalog entry. */
export type ProbeCustomFailure = 'invalid-path' | 'not-found' | 'no-interpreter'

/** Result of probing one user-supplied interpreter or install prefix. */
export type ProbeCustomResult =
  | { readonly ok: true; readonly entry: EnvEntry }
  | { readonly ok: false; readonly code: ProbeCustomFailure }

/** True when the last path segment names a python or Rscript executable. */
function isInterpreterFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'python' || lower === 'python.exe' || lower === 'python3'
    || lower === 'rscript' || lower === 'rscript.exe'
}

/**
 * Probe one user-supplied path (interpreter file or install directory) and
 * build a `custom` catalog entry when a python or Rscript is present.
 * @param ctx - host context carrying `fs`.
 * @param rawPath - path the user typed; leading/trailing whitespace is ignored.
 * @returns the entry, or a structured reason the path cannot be pinned.
 */
export async function probeCustomPath(ctx: Context, rawPath: string): Promise<ProbeCustomResult> {
  const path = rawPath.trim()
  if (path.length === 0) return { ok: false, code: 'invalid-path' }
  let info: { type: string } | undefined
  try {
    const target = await ctx.fs.resolve(path)
    info = await ctx.fs.stat(target)
  } catch (_statFailure) {
    return { ok: false, code: 'not-found' }
  }
  if (info === undefined) return { ok: false, code: 'not-found' }

  let prefix = path
  let python: string | null = null
  let rscript: string | null = null
  if (info.type === 'file') {
    if (!isInterpreterFileName(baseName(path))) return { ok: false, code: 'no-interpreter' }
    prefix = prefixFromRscript(path)
    const lower = baseName(path).toLowerCase()
    if (lower.startsWith('python')) python = path
    else rscript = path
    if (python === null) python = await firstExisting(ctx, pythonCandidates(prefix))
    if (rscript === null) rscript = await firstExisting(ctx, rscriptCandidates(prefix))
  } else if (info.type === 'directory') {
    prefix = path
    python = await firstExisting(ctx, pythonCandidates(prefix))
    rscript = await firstExisting(ctx, rscriptCandidates(prefix))
  } else {
    return { ok: false, code: 'no-interpreter' }
  }
  if (python === null && rscript === null) return { ok: false, code: 'no-interpreter' }
  const name = standaloneRName(prefix)
  return {
    ok: true,
    entry: {
      kind: 'custom',
      name,
      prefix,
      python,
      rscript,
      ...(python !== null ? { pythonCommand: python } : {}),
      ...(rscript !== null ? { rscriptCommand: rscript } : {}),
    },
  }
}
