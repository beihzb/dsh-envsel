/**
 * Standalone per-session selection store for envsel. Selections live in a
 * machine-local JSON file (`$DSH_HOME/envsel-state.json`) keyed by session id,
 * NOT in the session event log: a downstream plugin's event type is unknown to
 * the harness's session-persistence reader, which refuses a log containing an
 * unrecognized non-ignorable event. Writing selection changes into the log
 * would therefore make the owning session unreadable after a restart, so the
 * plugin owns its own durable state instead.
 *
 * @module dsh-envsel/state
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { EnvSelection, SessionId } from './types.ts'

/** On-disk file name of the selection store under the harness home. */
export const STATE_FILE_NAME = 'envsel-state.json'

/** Current on-disk document version. */
export const STATE_FILE_VERSION = 1

/** The selection store document: one folded selection per session id. */
export interface StateDocument {
  readonly version: typeof STATE_FILE_VERSION
  readonly selections: Record<string, EnvSelection>
}

/**
 * Resolved selection-store path under the current harness home.
 * @returns the absolute `$DSH_HOME/envsel-state.json` path.
 */
export function statePath(): string {
  return dshHomePath(STATE_FILE_NAME)
}

/**
 * Parse the on-disk document into a session→selection map.
 * @param raw - file contents; invalid or version-mismatched JSON becomes an empty map.
 * @returns selections keyed by session id.
 */
export function parseStateDocument(raw: string): Record<string, EnvSelection> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (_parseFailure) {
    return {}
  }
  if (parsed === null || typeof parsed !== 'object') return {}
  const doc = parsed as Partial<StateDocument>
  if (doc.version !== STATE_FILE_VERSION) return {}
  const selections = doc.selections
  if (selections === null || typeof selections !== 'object' || Array.isArray(selections)) return {}
  const out: Record<string, EnvSelection> = {}
  for (const [key, value] of Object.entries(selections)) {
    if (value !== null && typeof value === 'object') out[key] = value as EnvSelection
  }
  return out
}

/**
 * Serialize the selection map as a stable versioned document.
 * @param selections - selections to persist.
 * @returns UTF-8 document with a trailing newline.
 */
export function serializeStateDocument(selections: Record<string, EnvSelection>): string {
  const doc: StateDocument = { version: STATE_FILE_VERSION, selections }
  return `${JSON.stringify(doc, null, 2)}\n`
}

/**
 * Read the whole selection map; a missing or unreadable file is empty.
 * @param ctx - host context carrying `fs`.
 * @returns selections keyed by session id.
 */
export async function readAllSelections(ctx: Context): Promise<Record<string, EnvSelection>> {
  try {
    const target = await ctx.fs.resolve(statePath())
    const raw = await ctx.fs.readText(target)
    return parseStateDocument(raw)
  } catch (_readFailure) {
    return {}
  }
}

/**
 * Replace the whole selection map (an empty map still writes).
 * @param ctx - host context carrying `fs`.
 * @param selections - complete replacement map.
 */
export async function writeAllSelections(ctx: Context, selections: Record<string, EnvSelection>): Promise<void> {
  const target = await ctx.fs.resolve(statePath())
  await ctx.fs.writeText(target, serializeStateDocument(selections))
}

/**
 * Read one session's folded selection.
 * @param ctx - host context carrying `fs`.
 * @param sessionId - the addressed session.
 * @returns the stored selection, or undefined when the session has none.
 */
export async function readSessionSelection(ctx: Context, sessionId: SessionId): Promise<EnvSelection | undefined> {
  const all = await readAllSelections(ctx)
  return all[String(sessionId)]
}

/**
 * Persist one session's selection, replacing its previous value.
 * @param ctx - host context carrying `fs`.
 * @param sessionId - the addressed session.
 * @param selection - the new selection (empty object clears the session).
 */
export async function writeSessionSelection(
  ctx: Context,
  sessionId: SessionId,
  selection: EnvSelection,
): Promise<void> {
  const all = await readAllSelections(ctx)
  const key = String(sessionId)
  if (selection === null || Object.keys(selection).length === 0) {
    delete all[key]
  } else {
    all[key] = selection
  }
  await writeAllSelections(ctx, all)
}
