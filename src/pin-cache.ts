/**
 * Machine-local cache of user-pinned interpreter / install paths. The file
 * lives at `$DSH_HOME/envsel-pinned.json` and is shared across sessions; each
 * session still chooses independently from the resulting catalog entries.
 *
 * @module @deepseek-ai/@beihaizb/dsh-envsel/pin-cache
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { probeCustomPath } from './discover.ts'
import { writeHomeFile } from './home-io.ts'
import type { EnvEntry } from './types.ts'

/** On-disk file name of the machine-local pin cache under the harness home. */
export const PINNED_FILE_NAME = 'envsel-pinned.json'

/** One remembered host path. */
export interface PinnedPath {
  readonly path: string
}

/**
 * Resolved pin-cache file under the current harness home.
 * @returns the absolute `$DSH_HOME/envsel-pinned.json` path.
 */
export function pinnedCachePath(): string {
  return dshHomePath(PINNED_FILE_NAME)
}

/**
 * Parse the on-disk document into a de-duplicated path list.
 * @param raw - file contents; invalid JSON becomes an empty list.
 * @returns remembered paths in document order.
 */
export function parsePinnedDocument(raw: string): PinnedPath[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (_parseFailure) {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  const out: PinnedPath[] = []
  for (const item of parsed) {
    const path = typeof item === 'string'
      ? item.trim()
      : item !== null && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string'
        ? (item as { path: string }).path.trim()
        : ''
    if (path.length === 0) continue
    const key = path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ path })
  }
  return out
}

/**
 * Serialize remembered paths as a stable JSON array.
 * @param pins - paths to persist.
 * @returns UTF-8 document with a trailing newline.
 */
export function serializePinnedDocument(pins: readonly PinnedPath[]): string {
  return `${JSON.stringify(pins.map(pin => ({ path: pin.path })), null, 2)}\n`
}

/**
 * Read the pin file; a missing or unreadable file is an empty list.
 * @param ctx - host context carrying `fs`.
 * @returns remembered paths, or `[]` when the file is absent.
 */
export async function readPinnedPaths(ctx: Context): Promise<PinnedPath[]> {
  try {
    const target = await ctx.fs.resolve(pinnedCachePath())
    const raw = await ctx.fs.readText(target)
    return parsePinnedDocument(raw)
  } catch (_readFailure) {
    return []
  }
}

/**
 * Replace the pin file with the given list (empty list still writes).
 * @param ctx - host context carrying `fs`.
 * @param pins - complete replacement list.
 */
export async function writePinnedPaths(ctx: Context, pins: readonly PinnedPath[]): Promise<void> {
  const target = await ctx.fs.resolve(pinnedCachePath())
  await writeHomeFile(ctx, target, serializePinnedDocument(pins))
}

/** Result of probing every remembered path into catalog entries. */
export interface ResolvedPins {
  readonly entries: EnvEntry[]
  readonly warnings: string[]
}

/**
 * Probe every remembered path. A vanished path stays on disk (the user can
 * unpin it) and becomes a catalog warning so the dropdown still explains it.
 * @param ctx - host context carrying `fs`.
 * @returns catalog entries plus one warning per unusable pin.
 */
export async function resolvePinnedEntries(ctx: Context): Promise<ResolvedPins> {
  const pins = await readPinnedPaths(ctx)
  const entries: EnvEntry[] = []
  const warnings: string[] = []
  const seen = new Set<string>()
  for (const pin of pins) {
    const probed = await probeCustomPath(ctx, pin.path)
    if (!probed.ok) {
      warnings.push(`手动路径不可用（${probed.code}）: ${pin.path}`)
      continue
    }
    const key = `${probed.entry.kind}|${probed.entry.name}|${probed.entry.prefix}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(probed.entry)
  }
  return { entries, warnings }
}

/**
 * Append a path to the cache if it is not already present.
 * @param ctx - host context carrying `fs`.
 * @param path - absolute interpreter or install path to remember.
 */
export async function appendPinnedPath(ctx: Context, path: string): Promise<void> {
  const pins = await readPinnedPaths(ctx)
  const key = path.trim().toLowerCase()
  if (pins.some(pin => pin.path.toLowerCase() === key)) return
  await writePinnedPaths(ctx, [...pins, { path: path.trim() }])
}

/**
 * Remove a remembered path (by original path or by `custom:<name>` address).
 * @param ctx - host context carrying `fs`.
 * @param addressOrPath - `custom:<name>`, the display name, or the original path.
 * @param entries - current catalog used to resolve a `custom:` address.
 * @returns whether a row was removed.
 */
export async function removePinnedPath(
  ctx: Context,
  addressOrPath: string,
  entries: readonly EnvEntry[],
): Promise<boolean> {
  const pins = await readPinnedPaths(ctx)
  const needle = addressOrPath.trim()
  if (needle.length === 0) return false
  const next = pins.filter((pin) => {
    if (pin.path === needle || pin.path.toLowerCase() === needle.toLowerCase()) return false
    const match = entries.find(entry =>
      entry.kind === 'custom'
      && (entry.prefix === pin.path || entry.python === pin.path || entry.rscript === pin.path))
    if (match === undefined) return true
    return `custom:${match.name}` !== needle && match.name !== needle
  })
  if (next.length === pins.length) return false
  await writePinnedPaths(ctx, next)
  return true
}
